-- WORKLEVEL V12.5 — Cloud Leads
-- Additive migration. Run AFTER SETUP-WORKLEVEL-V12.4-SECURITY.sql (if not already applied).
-- Creates public.leads with company_id + RLS (owner/admin), uuid PK.
-- Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  company_name text,
  phone text,
  email text,
  street text,
  postal_code text,
  city text,
  source text,
  status text not null default 'Neu'
    check (status in ('Neu','Kontaktiert','Angebot','Gewonnen','Verloren')),
  estimated_value numeric(12,2) not null default 0,
  notes text,
  converted_customer_id bigint references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent column ensures for databases that already had a partial leads table
alter table public.leads add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.leads add column if not exists company_name text;
alter table public.leads add column if not exists phone text;
alter table public.leads add column if not exists email text;
alter table public.leads add column if not exists street text;
alter table public.leads add column if not exists postal_code text;
alter table public.leads add column if not exists city text;
alter table public.leads add column if not exists source text;
alter table public.leads add column if not exists status text;
alter table public.leads add column if not exists estimated_value numeric(12,2) not null default 0;
alter table public.leads add column if not exists notes text;
alter table public.leads add column if not exists converted_customer_id bigint;
alter table public.leads add column if not exists updated_at timestamptz not null default now();

create index if not exists leads_company_idx on public.leads(company_id, created_at desc);
create index if not exists leads_company_status_idx on public.leads(company_id, status);

alter table public.leads enable row level security;

drop policy if exists leads_office on public.leads;
create policy leads_office on public.leads
  for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin']))
  with check (public.has_company_role(company_id, array['owner','admin']));

-- Keep updated_at fresh on row changes
create or replace function public.touch_leads_updated_at()
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

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
  before update on public.leads
  for each row execute function public.touch_leads_updated_at();

-- Clients must not execute the trigger helper directly
revoke all on function public.touch_leads_updated_at() from public, anon, authenticated;

grant select, insert, update, delete on public.leads to authenticated;

notify pgrst, 'reload schema';
