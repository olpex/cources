DROP POLICY IF EXISTS "authenticated view broadcasts" ON public.forum_broadcasts;
CREATE POLICY "teacher views broadcasts" ON public.forum_broadcasts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'teacher'::app_role));
DROP POLICY IF EXISTS "anyone reads announcements" ON public.announcements;
REVOKE SELECT ON public.announcements FROM anon;
CREATE POLICY "signed-in users read announcements" ON public.announcements FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);