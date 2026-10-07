CREATE TABLE public.thread_watchers (
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.thread_watchers TO authenticated;
GRANT ALL ON public.thread_watchers TO service_role;
ALTER TABLE public.thread_watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own watch view" ON public.thread_watchers FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own watch insert" ON public.thread_watchers FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND NOT public.is_banned() AND public.can_view_thread(thread_id) AND lower(email) = lower(coalesce(auth.jwt()->>'email','')));
CREATE POLICY "own watch delete" ON public.thread_watchers FOR DELETE TO authenticated USING (user_id = auth.uid());