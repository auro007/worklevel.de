-- WORKLEVEL V14.3 — Kundendienst: Fehlercodes + Geräte-Pläne (site_devices)
-- Additive only. Safe to re-run. Project: xvaxlafehhetydvgldfw
-- Prerequisite: companies, customers, customer_sites, jobs, has_company_role / is_company_member / worker_can_access_customer / is_assigned_worker

create extension if not exists pgcrypto;

-- ═══════════════════════════════════════════════════════════════════
-- 1) error_codes — company catalog
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.error_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  trade_category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.error_codes add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.error_codes add column if not exists code text;
alter table public.error_codes add column if not exists title text;
alter table public.error_codes add column if not exists description text;
alter table public.error_codes add column if not exists trade_category text;
alter table public.error_codes add column if not exists active boolean not null default true;
alter table public.error_codes add column if not exists created_at timestamptz not null default now();
alter table public.error_codes add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'error_codes_company_code_unique'
  ) then
    alter table public.error_codes
      add constraint error_codes_company_code_unique unique (company_id, code);
  end if;
end $$;

create index if not exists error_codes_company_active_idx
  on public.error_codes (company_id, active);
create index if not exists error_codes_company_trade_idx
  on public.error_codes (company_id, trade_category);
create index if not exists error_codes_code_trgm_idx
  on public.error_codes (company_id, lower(code));

comment on table public.error_codes is 'Kundendienst-Fehlercode-Katalog (firmenbezogen)';

create or replace function public.touch_error_codes_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists error_codes_touch_updated_at on public.error_codes;
create trigger error_codes_touch_updated_at
  before update on public.error_codes
  for each row execute function public.touch_error_codes_updated_at();

revoke all on function public.touch_error_codes_updated_at() from public, anon, authenticated;

alter table public.error_codes enable row level security;

drop policy if exists error_codes_office on public.error_codes;
drop policy if exists error_codes_member_select on public.error_codes;

create policy error_codes_office on public.error_codes
  for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin']))
  with check (public.has_company_role(company_id, array['owner','admin']));

-- Workers (and all members): read catalog for lookup on jobs
create policy error_codes_member_select on public.error_codes
  for select to authenticated
  using (public.is_company_member(company_id));

grant select, insert, update, delete on public.error_codes to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 2) site_devices — Geräte / Anlagen / Pläne at customer / site
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.site_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id bigint not null references public.customers(id) on delete cascade,
  customer_site_id uuid references public.customer_sites(id) on delete set null,
  name text not null,
  device_type text not null default 'Sonstiges',
  serial_number text,
  model text,
  notes text,
  plan_path text,
  plan_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_devices add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.site_devices add column if not exists customer_id bigint references public.customers(id) on delete cascade;
alter table public.site_devices add column if not exists customer_site_id uuid references public.customer_sites(id) on delete set null;
alter table public.site_devices add column if not exists name text;
alter table public.site_devices add column if not exists device_type text not null default 'Sonstiges';
alter table public.site_devices add column if not exists serial_number text;
alter table public.site_devices add column if not exists model text;
alter table public.site_devices add column if not exists notes text;
alter table public.site_devices add column if not exists plan_path text;
alter table public.site_devices add column if not exists plan_url text;
alter table public.site_devices add column if not exists active boolean not null default true;
alter table public.site_devices add column if not exists created_at timestamptz not null default now();
alter table public.site_devices add column if not exists updated_at timestamptz not null default now();

create index if not exists site_devices_company_customer_idx
  on public.site_devices (company_id, customer_id);
create index if not exists site_devices_company_site_idx
  on public.site_devices (company_id, customer_site_id)
  where customer_site_id is not null;
create index if not exists site_devices_company_active_idx
  on public.site_devices (company_id, active);
create index if not exists site_devices_type_idx
  on public.site_devices (company_id, device_type);

comment on table public.site_devices is 'Geräte / Anlagen / Pläne am Kundenobjekt';
comment on column public.site_devices.plan_path is 'Storage path in bucket device-plans';
comment on column public.site_devices.plan_url is 'Optional external URL for plan PDF/image';

create or replace function public.touch_site_devices_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists site_devices_touch_updated_at on public.site_devices;
create trigger site_devices_touch_updated_at
  before update on public.site_devices
  for each row execute function public.touch_site_devices_updated_at();

revoke all on function public.touch_site_devices_updated_at() from public, anon, authenticated;

alter table public.site_devices enable row level security;

drop policy if exists site_devices_office on public.site_devices;
drop policy if exists site_devices_worker_select on public.site_devices;

create policy site_devices_office on public.site_devices
  for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin']))
  with check (public.has_company_role(company_id, array['owner','admin']));

create policy site_devices_worker_select on public.site_devices
  for select to authenticated
  using (
    public.has_company_role(company_id, array['owner','admin'])
    or public.worker_can_access_customer(customer_id)
  );

grant select, insert, update, delete on public.site_devices to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 3) Jobs: optional error_code_id + site_device_id
-- ═══════════════════════════════════════════════════════════════════
alter table public.jobs
  add column if not exists error_code_id uuid references public.error_codes(id) on delete set null;

alter table public.jobs
  add column if not exists site_device_id uuid references public.site_devices(id) on delete set null;

create index if not exists jobs_error_code_idx
  on public.jobs (company_id, error_code_id)
  where error_code_id is not null;

create index if not exists jobs_site_device_idx
  on public.jobs (company_id, site_device_id)
  where site_device_id is not null;

-- Worker may attach/clear error code on assigned job
create or replace function public.set_assigned_job_error_code(p_job uuid, p_error_code uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if not public.is_assigned_worker(p_job) then
    raise exception 'Dieser Auftrag ist dir nicht zugewiesen';
  end if;
  select company_id into v_company from public.jobs where id = p_job;
  if v_company is null then
    raise exception 'Auftrag nicht gefunden';
  end if;
  if p_error_code is not null then
    if not exists (
      select 1 from public.error_codes ec
      where ec.id = p_error_code
        and ec.company_id = v_company
        and ec.active = true
    ) then
      raise exception 'Fehlercode ungültig oder inaktiv';
    end if;
  end if;
  update public.jobs
  set error_code_id = p_error_code, updated_at = now()
  where id = p_job;
end;
$$;

revoke all on function public.set_assigned_job_error_code(uuid, uuid) from public, anon;
grant execute on function public.set_assigned_job_error_code(uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 4) Storage bucket for device plan PDFs / images
-- ═══════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('device-plans', 'device-plans', false)
on conflict (id) do nothing;

-- Path convention: {company_id}/devices/{device_id}/{filename}
drop policy if exists device_plans_select on storage.objects;
drop policy if exists device_plans_insert on storage.objects;
drop policy if exists device_plans_update on storage.objects;
drop policy if exists device_plans_delete on storage.objects;

create policy device_plans_select on storage.objects
for select to authenticated
using (
  bucket_id = 'device-plans'
  and public.is_company_member(((storage.foldername(name))[1])::uuid)
);

create policy device_plans_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'device-plans'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::text[]
  )
);

create policy device_plans_update on storage.objects
for update to authenticated
using (
  bucket_id = 'device-plans'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::text[]
  )
)
with check (
  bucket_id = 'device-plans'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::text[]
  )
);

create policy device_plans_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'device-plans'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::text[]
  )
);

notify pgrst, 'reload schema';
