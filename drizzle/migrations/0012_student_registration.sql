-- Registration of students by email + course, with device binding.
-- Students no longer need a Google account to subscribe to announcements.
-- The teacher keeps the existing Supabase login for editing; the code login is
-- only an extra way to bind a device and open a real session.

CREATE TABLE public.student_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(email)),
  course_id text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  note text NOT NULL DEFAULT '',
  UNIQUE (email, course_id)
);

-- One active course per student: enforced by the database, not only by code.
CREATE UNIQUE INDEX student_registrations_one_active
  ON public.student_registrations (email)
  WHERE status = 'active';

CREATE INDEX student_registrations_course_idx
  ON public.student_registrations (course_id, status);

CREATE TABLE public.student_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(email)),
  course_id text,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  token_hash text NOT NULL UNIQUE,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX student_devices_email_idx ON public.student_devices (email);

CREATE TABLE public.student_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(email)),
  course_id text,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  full_name text NOT NULL DEFAULT '',
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX student_codes_email_idx ON public.student_codes (email, created_at DESC);

-- These tables are reached only through server functions that use the service
-- role. RLS is on and no policy is granted, so anon/authenticated cannot read
-- or write them even with the publishable key.
ALTER TABLE public.student_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_codes ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.student_registrations TO service_role;
GRANT ALL ON public.student_devices TO service_role;
GRANT ALL ON public.student_codes TO service_role;

-- A lifetime ban by email already exists as forum_bans (email PRIMARY KEY).
-- Blocking a student inserts there, so the ban covers every device and course.

-- Teacher-only helpers used by the server functions. Kept in SQL so the rules
-- hold even if a future client forgets them.
CREATE OR REPLACE FUNCTION public.student_is_teacher_email(_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.user_roles r ON r.user_id = u.id
    WHERE lower(u.email) = lower(_email) AND r.role = 'teacher'
  )
$$;

REVOKE ALL ON FUNCTION public.student_is_teacher_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_is_teacher_email(text) TO service_role;

-- Students now create Supabase users too, so "the first user becomes teacher"
-- would hand the admin role to whichever student registered first. Pin the
-- teacher role to the owner's address instead.
CREATE OR REPLACE FUNCTION public.grant_first_user_teacher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(coalesce(new.email, '')) = 'olppara@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'teacher')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

-- Safety net: the owner must never lose admin because of the change above.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'teacher'::public.app_role
FROM auth.users u
WHERE lower(u.email) = 'olppara@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
