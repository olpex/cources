CREATE TABLE public.forum_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  author_name text NOT NULL DEFAULT '',
  course_id text,
  category text NOT NULL DEFAULT 'organizational',
  title text NOT NULL,
  body text NOT NULL,
  is_private boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_threads TO authenticated;
GRANT ALL ON public.forum_threads TO service_role;
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_thread(_thread_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.forum_threads t WHERE t.id = _thread_id
    AND (NOT t.is_private OR t.author_id = auth.uid() OR public.has_role(auth.uid(),'teacher')))
$$;

CREATE POLICY "view threads" ON public.forum_threads FOR SELECT TO authenticated
  USING (NOT is_private OR author_id = auth.uid() OR public.has_role(auth.uid(),'teacher'));
CREATE POLICY "create own thread" ON public.forum_threads FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "teacher or author delete" ON public.forum_threads FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(),'teacher'));

CREATE TABLE public.forum_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text NOT NULL DEFAULT '',
  is_teacher boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.forum_replies TO authenticated;
GRANT ALL ON public.forum_replies TO service_role;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view replies" ON public.forum_replies FOR SELECT TO authenticated
  USING (public.can_view_thread(thread_id));
CREATE POLICY "create reply" ON public.forum_replies FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_view_thread(thread_id));
CREATE POLICY "teacher or author delete reply" ON public.forum_replies FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(),'teacher'));

CREATE OR REPLACE FUNCTION public.set_reply_teacher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.is_teacher := public.has_role(NEW.author_id,'teacher'); RETURN NEW; END $$;
CREATE TRIGGER forum_replies_teacher BEFORE INSERT ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.set_reply_teacher();

CREATE TABLE public.course_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id text NOT NULL,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
GRANT SELECT, INSERT, DELETE ON public.course_subscriptions TO authenticated;
GRANT ALL ON public.course_subscriptions TO service_role;
ALTER TABLE public.course_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or teacher view subs" ON public.course_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'teacher'));
CREATE POLICY "own sub insert" ON public.course_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "own sub delete" ON public.course_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.forum_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id text,
  subject text NOT NULL,
  body text NOT NULL,
  sent_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forum_broadcasts TO authenticated;
GRANT ALL ON public.forum_broadcasts TO service_role;
ALTER TABLE public.forum_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated view broadcasts" ON public.forum_broadcasts FOR SELECT TO authenticated USING (true);