-- A student may only be subscribed to the announcements of the course they
-- registered for. Without this, the «Підписка на оголошення» switches let a
-- student of one course subscribe to the other two and receive their mail.
--
-- Two layers: this policy (the truth) and the disabled switches in the UI.

-- The caller's active course, or null. SECURITY DEFINER because
-- student_registrations is reachable only by the service role.
CREATE OR REPLACE FUNCTION public.student_active_course()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.course_id FROM public.student_registrations r
  WHERE r.email = lower(coalesce(auth.jwt() ->> 'email', '')) AND r.status = 'active'
  LIMIT 1
$$;

-- Has this address ever registered through the email-code flow? Needed to tell
-- a visitor of the old Google flow (no row at all, keep every switch) from a
-- student whose registration was closed (row exists, nothing may be subscribed).
CREATE OR REPLACE FUNCTION public.student_has_registration()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_registrations r
    WHERE r.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

REVOKE ALL ON FUNCTION public.student_active_course() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_has_registration() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_active_course() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.student_has_registration() TO authenticated, service_role;

-- Announcement subscriptions: only the registered course.
DROP POLICY IF EXISTS "own ann sub insert" ON public.announcement_subscriptions;
CREATE POLICY "own ann sub insert" ON public.announcement_subscriptions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND (
      public.has_role(auth.uid(), 'teacher'::public.app_role)
      -- Never registered here (the old Google flow) — unchanged behaviour.
      OR NOT public.student_has_registration()
      -- Registered: exactly one course, and only while it is active.
      OR course_id = public.student_active_course()
    )
  );

-- Forum subscriptions followed the same hole.
DROP POLICY IF EXISTS "own sub insert" ON public.course_subscriptions;
CREATE POLICY "own sub insert" ON public.course_subscriptions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT public.is_banned()
    AND NOT public.is_sub_blocked(course_id)
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND (
      public.has_role(auth.uid(), 'teacher'::public.app_role)
      OR NOT public.student_has_registration()
      OR course_id = public.student_active_course()
    )
  );

-- Rows already created by hand (or before this rule) would keep delivering
-- mail from courses the student never joined. Drop exactly those.
DELETE FROM public.announcement_subscriptions s
USING public.student_registrations r
WHERE r.status = 'active'
  AND lower(s.email) = r.email
  AND s.course_id <> r.course_id;

DELETE FROM public.course_subscriptions s
USING public.student_registrations r
WHERE r.status = 'active'
  AND lower(s.email) = r.email
  AND s.course_id <> r.course_id;

-- Closed registrations keep no subscriptions at all.
DELETE FROM public.announcement_subscriptions s
USING public.student_registrations r
WHERE r.status <> 'active'
  AND lower(s.email) = r.email;

DELETE FROM public.course_subscriptions s
USING public.student_registrations r
WHERE r.status <> 'active'
  AND lower(s.email) = r.email;
