ALTER TABLE public.practical_submissions ADD COLUMN IF NOT EXISTS files jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE POLICY "practical own upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'practical-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "practical own or teacher read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'practical-files' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'teacher')));

CREATE POLICY "practical teacher delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'practical-files' AND public.has_role(auth.uid(), 'teacher'));