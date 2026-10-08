create table public.practical_submissions (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  module_id text not null,
  module_title text not null default '',
  user_id uuid not null,
  email text not null,
  student_name text not null,
  answer text not null default '',
  links text not null default '',
  has_image boolean not null default false,
  ai_score int,
  teacher_score int,
  feedback text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.practical_submissions to authenticated;
grant all on public.practical_submissions to service_role;
alter table public.practical_submissions enable row level security;
create policy "own or teacher view" on public.practical_submissions for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'teacher'));
create policy "own insert" on public.practical_submissions for insert to authenticated
  with check (user_id = auth.uid() and lower(email) = lower(coalesce(auth.jwt()->>'email','')) and ai_score is null and teacher_score is null and status = 'pending');
create policy "teacher update" on public.practical_submissions for update to authenticated
  using (public.has_role(auth.uid(), 'teacher')) with check (public.has_role(auth.uid(), 'teacher'));
create policy "teacher delete" on public.practical_submissions for delete to authenticated
  using (public.has_role(auth.uid(), 'teacher'));

create or replace function public.practical_scores(_course_id text)
returns table(id uuid, module_id text, module_title text, student_name text, score int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (user_id, module_id) id, module_id, module_title, student_name,
    coalesce(teacher_score, ai_score) as score, created_at
  from public.practical_submissions
  where course_id = _course_id and status = 'graded'
  order by user_id, module_id, created_at desc
$$;
grant execute on function public.practical_scores(text) to anon, authenticated;