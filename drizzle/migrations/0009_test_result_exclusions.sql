CREATE TABLE public.test_result_exclusions (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT normalized_exclusion_email CHECK (email = lower(btrim(email)) AND email <> '')
);
GRANT SELECT, INSERT, DELETE ON public.test_result_exclusions TO authenticated;
GRANT ALL ON public.test_result_exclusions TO service_role;
ALTER TABLE public.test_result_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read test exclusions" ON public.test_result_exclusions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Teachers add test exclusions" ON public.test_result_exclusions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Teachers remove test exclusions" ON public.test_result_exclusions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'teacher'));
