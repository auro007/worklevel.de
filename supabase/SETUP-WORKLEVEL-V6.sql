-- WORKLEVEL V6 - MULTI-COMPANY / SAAS FOUNDATION
-- Run this ONCE in Supabase > SQL Editor after the working V5 setup.
-- It keeps existing V5 data. After login, V6 asks the current user to create a company;
-- create_worklevel_company() then attaches that user's existing customers/employees/jobs/V5 records to that company.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  street text,
  postal_code text,
  city text,
  phone text,
  email text,
  owner_name text,
  tax_number text,
  vat_id text,
  hourly_rate numeric(10,2) not null default 75,
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','worker')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  primary key (company_id,user_id)
);

-- Safe re-run support if an earlier V6 draft already created companies.
alter table public.companies add column if not exists owner_name text;
alter table public.companies add column if not exists tax_number text;
alter table public.companies add column if not exists vat_id text;
alter table public.companies add column if not exists hourly_rate numeric(10,2) not null default 75;

create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null default 'worker' check (role in ('owner','admin','worker')),
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.customers add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.employees add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.employees add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.jobs add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.job_time_entries add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.job_materials add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.job_notes add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.job_photos add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.job_signatures add column if not exists company_id uuid references public.companies(id) on delete cascade;

create index if not exists customers_company_idx on public.customers(company_id);
create index if not exists employees_company_idx on public.employees(company_id);
create index if not exists employees_auth_user_idx on public.employees(auth_user_id);
create index if not exists jobs_company_idx on public.jobs(company_id);
create index if not exists company_members_user_idx on public.company_members(user_id);
create index if not exists company_invites_company_idx on public.company_invites(company_id);

-- SECURITY DEFINER helpers avoid recursive RLS checks on company_members.
create or replace function public.is_company_member(p_company uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.company_members m where m.company_id=p_company and m.user_id=auth.uid() and m.status='active'); $$;

create or replace function public.has_company_role(p_company uuid, p_roles text[])
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.company_members m where m.company_id=p_company and m.user_id=auth.uid() and m.status='active' and m.role=any(p_roles)); $$;

create or replace function public.is_assigned_worker(p_job uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.jobs j join public.employees e on e.id=j.employee_id
    where j.id=p_job and e.auth_user_id=auth.uid() and j.company_id=e.company_id
  );
$$;

grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.has_company_role(uuid,text[]) to authenticated;
grant execute on function public.is_assigned_worker(uuid) to authenticated;

-- Create a company and migrate the logged-in user's old V3/V4/V5 rows into it.
create or replace function public.create_worklevel_company(p_name text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_company uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Firmenname fehlt'; end if;
  if exists(select 1 from public.company_members where user_id=v_user and status='active') then raise exception 'Dieses Konto gehört bereits zu einer Firma'; end if;
  insert into public.companies(name,owner_user_id,email) values(trim(p_name),v_user,auth.jwt()->>'email') returning id into v_company;
  insert into public.company_members(company_id,user_id,role,status) values(v_company,v_user,'owner','active');
  update public.customers set company_id=v_company where owner_id=v_user and company_id is null;
  update public.employees set company_id=v_company where owner_id=v_user and company_id is null;
  update public.jobs set company_id=v_company where owner_id=v_user and company_id is null;
  update public.job_time_entries set company_id=v_company where owner_id=v_user and company_id is null;
  update public.job_materials set company_id=v_company where owner_id=v_user and company_id is null;
  update public.job_notes set company_id=v_company where owner_id=v_user and company_id is null;
  update public.job_photos set company_id=v_company where owner_id=v_user and company_id is null;
  update public.job_signatures set company_id=v_company where owner_id=v_user and company_id is null;
  return v_company;
end; $$;
grant execute on function public.create_worklevel_company(text) to authenticated;

create or replace function public.accept_company_invite(p_code text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_email text:=lower(coalesce(auth.jwt()->>'email','')); v_inv public.company_invites%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select * into v_inv from public.company_invites where upper(code)=upper(trim(p_code)) and accepted_at is null and expires_at>now() for update;
  if not found then raise exception 'Einladungscode ist ungültig oder abgelaufen'; end if;
  if lower(v_inv.email)<>v_email then raise exception 'Diese Einladung gehört zu einer anderen E-Mail-Adresse'; end if;
  if exists(select 1 from public.company_members where user_id=v_user and status='active') then raise exception 'Dieses Konto gehört bereits zu einer Firma'; end if;
  insert into public.company_members(company_id,user_id,role,status) values(v_inv.company_id,v_user,v_inv.role,'active') on conflict(company_id,user_id) do update set role=excluded.role,status='active';
  update public.company_invites set accepted_at=now(),accepted_by=v_user where id=v_inv.id;
  if v_inv.role='worker' then
    update public.employees set auth_user_id=v_user where company_id=v_inv.company_id and lower(coalesce(email,''))=v_email and auth_user_id is null;
    if not found then
      insert into public.employees(owner_id,company_id,auth_user_id,name,role,email,status,active,xp)
      values(v_inv.created_by,v_inv.company_id,v_user,split_part(v_email,'@',1),'Techniker',v_email,'Verfügbar',true,0);
    end if;
  end if;
  return v_inv.company_id;
end; $$;
grant execute on function public.accept_company_invite(text) to authenticated;

-- Secure member directory: auth.users is never exposed directly to the browser.
create or replace function public.get_company_members(p_company uuid)
returns table(user_id uuid,email text,role text,status text,created_at timestamptz)
language plpgsql stable security definer set search_path=public,auth
as $$
begin
  if not public.is_company_member(p_company) then raise exception 'Kein Zugriff auf diese Firma'; end if;
  return query
  select m.user_id,u.email::text,m.role,m.status,m.created_at
  from public.company_members m join auth.users u on u.id=m.user_id
  where m.company_id=p_company
  order by m.created_at;
end; $$;
grant execute on function public.get_company_members(uuid) to authenticated;

-- Invitations are created server-side so admins cannot escalate themselves/others to owner.
create or replace function public.create_company_invite(p_company uuid,p_email text,p_role text default 'worker')
returns text language plpgsql security definer set search_path=public
as $$
declare v_role text:=lower(trim(p_role)); v_email text:=lower(trim(p_email)); v_code text;
begin
  if v_email='' or position('@' in v_email)=0 then raise exception 'Ungültige E-Mail-Adresse'; end if;
  if v_role not in ('owner','admin','worker') then raise exception 'Ungültige Rolle'; end if;
  if not public.has_company_role(p_company,array['owner','admin']) then raise exception 'Keine Berechtigung'; end if;
  if v_role='owner' and not public.has_company_role(p_company,array['owner']) then raise exception 'Nur der Chef kann einen weiteren Inhaber einladen'; end if;
  if exists(select 1 from public.company_members m join auth.users u on u.id=m.user_id where m.company_id=p_company and lower(u.email)=v_email and m.status='active') then raise exception 'Dieses Konto gehört bereits zur Firma'; end if;
  delete from public.company_invites where company_id=p_company and lower(email)=v_email and accepted_at is null;
  loop
    v_code:='WL-'||upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
    exit when not exists(select 1 from public.company_invites where code=v_code);
  end loop;
  insert into public.company_invites(company_id,email,role,code,created_by) values(p_company,v_email,v_role,v_code,auth.uid());
  return v_code;
end; $$;
grant execute on function public.create_company_invite(uuid,text,text) to authenticated;

-- Workers may only move their own assigned job through the technician workflow.
create or replace function public.set_assigned_job_status(p_job uuid,p_status text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if p_status not in ('In Arbeit','Erledigt') then raise exception 'Status für Mitarbeiter nicht erlaubt'; end if;
  if not public.is_assigned_worker(p_job) then raise exception 'Dieser Auftrag ist dir nicht zugewiesen'; end if;
  update public.jobs set status=p_status,updated_at=now() where id=p_job;
end; $$;
grant execute on function public.set_assigned_job_status(uuid,text) to authenticated;

-- Restrict customer visibility for workers to customers on their assigned jobs.
create or replace function public.worker_can_access_customer(p_customer bigint)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.jobs j join public.employees e on e.id=j.employee_id
    where j.customer_id=p_customer and e.auth_user_id=auth.uid() and j.company_id=e.company_id
  );
$$;
grant execute on function public.worker_can_access_customer(bigint) to authenticated;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.company_invites enable row level security;

-- Company + membership policies.
drop policy if exists companies_member_select on public.companies;
drop policy if exists companies_admin_update on public.companies;
create policy companies_member_select on public.companies for select to authenticated using(public.is_company_member(id));
create policy companies_admin_update on public.companies for update to authenticated using(public.has_company_role(id,array['owner','admin'])) with check(public.has_company_role(id,array['owner','admin']));

drop policy if exists members_same_company_select on public.company_members;
drop policy if exists members_owner_admin_manage on public.company_members;
create policy members_same_company_select on public.company_members for select to authenticated using(public.is_company_member(company_id));
create policy members_owner_admin_manage on public.company_members for all to authenticated using(public.has_company_role(company_id,array['owner'])) with check(public.has_company_role(company_id,array['owner']));

drop policy if exists invites_admin_all on public.company_invites;
drop policy if exists invites_admin_select on public.company_invites;
drop policy if exists invites_admin_delete on public.company_invites;
create policy invites_admin_select on public.company_invites for select to authenticated using(public.has_company_role(company_id,array['owner','admin']));
create policy invites_admin_delete on public.company_invites for delete to authenticated using(public.has_company_role(company_id,array['owner','admin']));

-- Replace single-user policies with company-aware policies.
alter table public.customers enable row level security;
alter table public.employees enable row level security;
alter table public.jobs enable row level security;

drop policy if exists "Development customer access" on public.customers;
drop policy if exists "customers_select_own" on public.customers;
drop policy if exists "customers_insert_own" on public.customers;
drop policy if exists "customers_update_own" on public.customers;
drop policy if exists "customers_delete_own" on public.customers;
drop policy if exists customers_company_select on public.customers;
drop policy if exists customers_company_manage on public.customers;
create policy customers_company_select on public.customers for select to authenticated using(public.has_company_role(company_id,array['owner','admin']) or public.worker_can_access_customer(id));
create policy customers_company_manage on public.customers for all to authenticated using(public.has_company_role(company_id,array['owner','admin'])) with check(public.has_company_role(company_id,array['owner','admin']));

drop policy if exists "employees_select_own" on public.employees;
drop policy if exists "employees_insert_own" on public.employees;
drop policy if exists "employees_update_own" on public.employees;
drop policy if exists "employees_delete_own" on public.employees;
drop policy if exists employees_company_select on public.employees;
drop policy if exists employees_company_manage on public.employees;
create policy employees_company_select on public.employees for select to authenticated using(public.has_company_role(company_id,array['owner','admin']) or auth_user_id=auth.uid());
create policy employees_company_manage on public.employees for all to authenticated using(public.has_company_role(company_id,array['owner','admin'])) with check(public.has_company_role(company_id,array['owner','admin']));

drop policy if exists "jobs_select_own" on public.jobs;
drop policy if exists "jobs_insert_own" on public.jobs;
drop policy if exists "jobs_update_own" on public.jobs;
drop policy if exists "jobs_delete_own" on public.jobs;
drop policy if exists jobs_company_select on public.jobs;
drop policy if exists jobs_company_manage on public.jobs;
drop policy if exists jobs_worker_update on public.jobs;
create policy jobs_company_select on public.jobs for select to authenticated using(public.has_company_role(company_id,array['owner','admin']) or public.is_assigned_worker(id));
create policy jobs_company_manage on public.jobs for all to authenticated using(public.has_company_role(company_id,array['owner','admin'])) with check(public.has_company_role(company_id,array['owner','admin']));

-- V5 technician tables.
drop policy if exists "job_time_entries_own" on public.job_time_entries;
drop policy if exists "job_materials_own" on public.job_materials;
drop policy if exists "job_notes_own" on public.job_notes;
drop policy if exists "job_photos_own" on public.job_photos;
drop policy if exists "job_signatures_own" on public.job_signatures;

-- V6 treats the customer signature as one current signature per job, independent of which company user captured it.
delete from public.job_signatures a using public.job_signatures b
where a.job_id=b.job_id and (a.created_at<b.created_at or (a.created_at=b.created_at and a.id<b.id));
create unique index if not exists job_signatures_one_per_job_idx on public.job_signatures(job_id);

-- Backfill V5 child company_id from their jobs where possible.
update public.job_time_entries x set company_id=j.company_id from public.jobs j where x.job_id=j.id and x.company_id is null;
update public.job_materials x set company_id=j.company_id from public.jobs j where x.job_id=j.id and x.company_id is null;
update public.job_notes x set company_id=j.company_id from public.jobs j where x.job_id=j.id and x.company_id is null;
update public.job_photos x set company_id=j.company_id from public.jobs j where x.job_id=j.id and x.company_id is null;
update public.job_signatures x set company_id=j.company_id from public.jobs j where x.job_id=j.id and x.company_id is null;

-- Helper policies for job-child tables: office/admin or assigned worker.
do $$ declare t text; begin
  foreach t in array array['job_time_entries','job_materials','job_notes','job_photos','job_signatures'] loop
    execute format('drop policy if exists %I on public.%I', t||'_company_access', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_company_role(company_id,array[''owner'',''admin'']) or public.is_assigned_worker(job_id)) with check (public.has_company_role(company_id,array[''owner'',''admin'']) or public.is_assigned_worker(job_id))', t||'_company_access', t);
  end loop;
end $$;

-- File access follows job access, not merely company membership.
create or replace function public.can_access_job(p_job uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.jobs j
    where j.id=p_job and (public.has_company_role(j.company_id,array['owner','admin']) or public.is_assigned_worker(j.id))
  );
$$;
grant execute on function public.can_access_job(uuid) to authenticated;

-- Private file access. V6 paths are <company-id>/<job-id>/..., but old V5 paths <user-id>/<job-id>/... remain readable by their owner.
drop policy if exists "job_files_select_own" on storage.objects;
drop policy if exists "job_files_insert_own" on storage.objects;
drop policy if exists "job_files_update_own" on storage.objects;
drop policy if exists "job_files_delete_own" on storage.objects;
drop policy if exists job_files_company_select on storage.objects;
drop policy if exists job_files_company_insert on storage.objects;
drop policy if exists job_files_company_update on storage.objects;
drop policy if exists job_files_company_delete on storage.objects;

create policy job_files_company_select on storage.objects for select to authenticated using(
  bucket_id='job-files' and (
    (storage.foldername(name))[1]=auth.uid()::text or
    (public.is_company_member(((storage.foldername(name))[1])::uuid) and public.can_access_job(((storage.foldername(name))[2])::uuid))
  )
);
create policy job_files_company_insert on storage.objects for insert to authenticated with check(
  bucket_id='job-files'
  and public.is_company_member(((storage.foldername(name))[1])::uuid)
  and public.can_access_job(((storage.foldername(name))[2])::uuid)
);
create policy job_files_company_update on storage.objects for update to authenticated using(
  bucket_id='job-files'
  and public.is_company_member(((storage.foldername(name))[1])::uuid)
  and public.can_access_job(((storage.foldername(name))[2])::uuid)
) with check(
  bucket_id='job-files'
  and public.is_company_member(((storage.foldername(name))[1])::uuid)
  and public.can_access_job(((storage.foldername(name))[2])::uuid)
);
create policy job_files_company_delete on storage.objects for delete to authenticated using(
  bucket_id='job-files'
  and public.is_company_member(((storage.foldername(name))[1])::uuid)
  and public.can_access_job(((storage.foldername(name))[2])::uuid)
);
