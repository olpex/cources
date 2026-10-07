CREATE TABLE public.forum_bans (
  email text PRIMARY KEY,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.forum_bans TO authenticated;
GRANT ALL ON public.forum_bans TO service_role;
ALTER TABLE public.forum_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher manage bans" ON public.forum_bans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'teacher')) WITH CHECK (public.has_role(auth.uid(),'teacher'));

CREATE TABLE public.subscription_blocks (
  email text NOT NULL,
  course_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, course_id)
);
GRANT SELECT, INSERT, DELETE ON public.subscription_blocks TO authenticated;
GRANT ALL ON public.subscription_blocks TO service_role;
ALTER TABLE public.subscription_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher manage blocks" ON public.subscription_blocks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'teacher')) WITH CHECK (public.has_role(auth.uid(),'teacher'));
CREATE POLICY "own blocks view" ON public.subscription_blocks FOR SELECT TO authenticated
  USING (email = lower(coalesce(auth.jwt()->>'email','')));

CREATE OR REPLACE FUNCTION public.is_banned()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.forum_bans WHERE email = lower(coalesce(auth.jwt()->>'email','')))
$$;
CREATE OR REPLACE FUNCTION public.is_sub_blocked(_course_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.subscription_blocks
    WHERE course_id = _course_id AND email = lower(coalesce(auth.jwt()->>'email','')))
$$;

DROP POLICY "view threads" ON public.forum_threads;
CREATE POLICY "view threads" ON public.forum_threads FOR SELECT TO authenticated
  USING (NOT public.is_banned() AND (NOT is_private OR author_id = auth.uid() OR public.has_role(auth.uid(),'teacher')));
DROP POLICY "create own thread" ON public.forum_threads;
CREATE POLICY "create own thread" ON public.forum_threads FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND NOT public.is_banned());

DROP POLICY "create reply" ON public.forum_replies;
CREATE POLICY "create reply" ON public.forum_replies FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND NOT public.is_banned() AND public.can_view_thread(thread_id));

DROP POLICY "own sub insert" ON public.course_subscriptions;
CREATE POLICY "own sub insert" ON public.course_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND NOT public.is_banned() AND NOT public.is_sub_blocked(course_id)
    AND lower(email) = lower(coalesce(auth.jwt()->>'email','')));
CREATE POLICY "teacher delete subs" ON public.course_subscriptions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'teacher'));