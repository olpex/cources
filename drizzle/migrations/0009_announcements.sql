CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  links text NOT NULL DEFAULT '',
  sent_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads announcements" ON public.announcements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "teacher deletes announcements" ON public.announcements FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'teacher'));

CREATE TABLE public.announcement_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id text NOT NULL,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
GRANT SELECT, INSERT, DELETE ON public.announcement_subscriptions TO authenticated;
GRANT ALL ON public.announcement_subscriptions TO service_role;
ALTER TABLE public.announcement_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or teacher view ann subs" ON public.announcement_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "own ann sub insert" ON public.announcement_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
CREATE POLICY "own or teacher delete ann sub" ON public.announcement_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'teacher'));