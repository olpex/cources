CREATE TABLE public.subscription_allows (
  email text NOT NULL,
  course_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_allows TO authenticated;
GRANT ALL ON public.subscription_allows TO service_role;
ALTER TABLE public.subscription_allows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own allows view" ON public.subscription_allows FOR SELECT TO authenticated
  USING (email = lower(coalesce(auth.jwt()->>'email','')));
CREATE POLICY "teacher manage allows" ON public.subscription_allows FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'teacher')) WITH CHECK (public.has_role(auth.uid(),'teacher'));

CREATE OR REPLACE FUNCTION public.is_sub_blocked(_course_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.subscription_blocks
      WHERE email = lower(coalesce(auth.jwt()->>'email','')))
    AND NOT EXISTS (SELECT 1 FROM public.subscription_allows
      WHERE course_id = _course_id AND email = lower(coalesce(auth.jwt()->>'email','')))
$$;