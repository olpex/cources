ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE public.forum_replies ADD COLUMN IF NOT EXISTS edited_at timestamptz;
GRANT UPDATE ON public.forum_threads TO authenticated;
GRANT UPDATE ON public.forum_replies TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_thread_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.id := OLD.id; NEW.author_id := OLD.author_id; NEW.created_at := OLD.created_at;
  IF NOT public.has_role(auth.uid(),'teacher') THEN
    NEW.is_closed := OLD.is_closed;
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body THEN
    IF OLD.author_id <> auth.uid() THEN
      NEW.title := OLD.title; NEW.body := OLD.body;
    ELSE
      NEW.edited_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER forum_threads_guard BEFORE UPDATE ON public.forum_threads FOR EACH ROW EXECUTE FUNCTION public.guard_thread_update();

CREATE OR REPLACE FUNCTION public.guard_reply_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.id := OLD.id; NEW.thread_id := OLD.thread_id; NEW.author_id := OLD.author_id;
  NEW.is_teacher := OLD.is_teacher; NEW.created_at := OLD.created_at;
  IF NEW.body IS DISTINCT FROM OLD.body THEN NEW.edited_at := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER forum_replies_guard BEFORE UPDATE ON public.forum_replies FOR EACH ROW EXECUTE FUNCTION public.guard_reply_update();

CREATE OR REPLACE FUNCTION public.thread_open(_thread_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.forum_threads WHERE id = _thread_id AND NOT is_closed)
$$;

CREATE POLICY "author or teacher update thread" ON public.forum_threads FOR UPDATE TO authenticated
  USING ((author_id = auth.uid() AND NOT public.is_banned()) OR public.has_role(auth.uid(),'teacher'))
  WITH CHECK ((author_id = auth.uid() AND NOT public.is_banned()) OR public.has_role(auth.uid(),'teacher'));
CREATE POLICY "author update reply" ON public.forum_replies FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND NOT public.is_banned())
  WITH CHECK (author_id = auth.uid() AND NOT public.is_banned());

DROP POLICY "create reply" ON public.forum_replies;
CREATE POLICY "create reply" ON public.forum_replies FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND NOT public.is_banned() AND public.can_view_thread(thread_id)
    AND (public.thread_open(thread_id) OR public.has_role(auth.uid(),'teacher')));