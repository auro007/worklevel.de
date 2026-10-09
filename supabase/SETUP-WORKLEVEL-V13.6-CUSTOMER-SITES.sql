-- WORKLEVEL V13.6 — Customer sites (Objekte / Häuser / Einsatzorte)
-- Additive. Safe to re-run.
-- One Kunde (Vermieter / Rechnungsadresse) can have many sites (Haus 1, Haus 2, …)
-- with Mieter contact data. Billing stays on customers; jobs may pick a site.

create extension if not exists pgcrypto;

create table if not exists public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id bigint not null references public.customers(id) on delete cascade,
  name text not null,
  street text,
  postal_code text,
  city text,
  tenant_name text,
  tenant_phone text,
  tenant_email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent column ensures
alter table public.customer_sites add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.customer_sites add column if not exists customer_id bigint references public.customers(id) on delete cascade;
alter table public.customer_sites add column if not exists name text;
alter table public.customer_sites add column if not exists street text;
alter table public.customer_sites add column if not exists postal_code text;
alter table public.customer_sites add column if not exists city text;
alter table public.customer_sites add column if not exists tenant_name text;
alter table public.customer_sites add column if not exists tenant_phone text;
alter table public.customer_sites add column if not exists tenant_email text;
alter table public.customer_sites add column if not exists notes text;
alter table public.customer_sites add column if not exists active boolean not null default true;
alter table public.customer_sites add column if not exists created_at timestamptz not null default now();
alter table public.customer_sites add column if not exists updated_at timestamptz not null default now();

create index if not exists customer_sites_company_customer_idx
  on public.customer_sites (company_id, customer_id);
create index if not exists customer_sites_company_active_idx
  on public.customer_sites (company_id, active);

-- Jobs: optional Einsatzort
alter table public.jobs
  add column if not exists customer_site_id uuid references public.customer_sites(id) on delete set null;

create index if not exists jobs_customer_site_idx
  on public.jobs (company_id, customer_site_id)
  where customer_site_id is not null;

-- updated_at touch
create or replace function public.touch_customer_sites_updated_at()
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

drop trigger if exists customer_sites_touch_updated_at on public.customer_sites;
create trigger customer_sites_touch_updated_at
  before update on public.customer_sites
  for each row execute function public.touch_customer_sites_updated_at();

revoke all on function public.touch_customer_sites_updated_at() from public, anon, authenticated;

alter table public.customer_sites enable row level security;

drop policy if exists customer_sites_office on public.customer_sites;
create policy customer_sites_office on public.customer_sites
  for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin']))
  with check (public.has_company_role(company_id, array['owner','admin']));

drop policy if exists customer_sites_worker_select on public.customer_sites;
create policy customer_sites_worker_select on public.customer_sites
  for select to authenticated
  using (
    public.has_company_role(company_id, array['owner','admin'])
    or public.worker_can_access_customer(customer_id)
  );

grant select, insert, update, delete on public.customer_sites to authenticated;

notify pgrst, 'reload schema';
