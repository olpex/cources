DROP POLICY IF EXISTS "signed-in users read announcements" ON public.announcements;
CREATE POLICY "subscribers or teacher read announcements" ON public.announcements
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'teacher'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.announcement_subscriptions s WHERE s.course_id = announcements.course_id AND s.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.course_subscriptions s WHERE s.course_id = announcements.course_id AND s.user_id = auth.uid())
);