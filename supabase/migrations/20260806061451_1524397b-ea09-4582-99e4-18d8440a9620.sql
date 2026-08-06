create type public.app_role as enum ('teacher');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users can read their own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.site_content (
  id text primary key default 'main',
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
grant select on public.site_content to anon;
grant select, insert, update on public.site_content to authenticated;
grant all on public.site_content to service_role;
alter table public.site_content enable row level security;
create policy "Anyone can read site content" on public.site_content for select using (true);
create policy "Teachers can create site content" on public.site_content for insert to authenticated with check (public.has_role(auth.uid(), 'teacher'));
create policy "Teachers can update site content" on public.site_content for update to authenticated using (public.has_role(auth.uid(), 'teacher')) with check (public.has_role(auth.uid(), 'teacher'));

create or replace function public.grant_first_user_teacher()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'teacher') then
    insert into public.user_roles (user_id, role) values (new.id, 'teacher')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_grant_teacher
after insert on auth.users
for each row execute function public.grant_first_user_teacher();