-- WORKLEVEL V4
-- Run ONCE in Supabase > SQL Editor while logged into the same project used by WORKLEVEL V3.
-- Keeps your existing V3 customers (whose id is bigint) and adds secure employee + job tables.

create extension if not exists pgcrypto;

-- Customers: keep V3 data and security.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_number text,
  company_name text not null,
  contact_name text,
  street text,
  postal_code text,
  city text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.customers add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.customers enable row level security;

drop policy if exists "Development customer access" on public.customers;
drop policy if exists "customers_select_own" on public.customers;
drop policy if exists "customers_insert_own" on public.customers;
drop policy if exists "customers_update_own" on public.customers;
drop policy if exists "customers_delete_own" on public.customers;
create policy "customers_select_own" on public.customers for select to authenticated using (auth.uid() = owner_id);
create policy "customers_insert_own" on public.customers for insert to authenticated with check (auth.uid() = owner_id);
create policy "customers_update_own" on public.customers for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "customers_delete_own" on public.customers for delete to authenticated using (auth.uid() = owner_id);
create index if not exists customers_owner_id_idx on public.customers(owner_id);

-- Employees / technicians
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  status text not null default 'Verfügbar' check (status in ('Im Einsatz','Verfügbar','Urlaub')),
  active boolean not null default true,
  xp integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.employees enable row level security;
drop policy if exists "employees_select_own" on public.employees;
drop policy if exists "employees_insert_own" on public.employees;
drop policy if exists "employees_update_own" on public.employees;
drop policy if exists "employees_delete_own" on public.employees;
create policy "employees_select_own" on public.employees for select to authenticated using (auth.uid() = owner_id);
create policy "employees_insert_own" on public.employees for insert to authenticated with check (auth.uid() = owner_id);
create policy "employees_update_own" on public.employees for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "employees_delete_own" on public.employees for delete to authenticated using (auth.uid() = owner_id);
create index if not exists employees_owner_id_idx on public.employees(owner_id);

-- Jobs / work orders
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_number text,
  title text not null,
  customer_id bigint not null references public.customers(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete set null,
  job_date date not null,
  job_time time not null default '08:00',
  status text not null default 'Geplant' check (status in ('Geplant','In Arbeit','Erledigt','Storniert')),
  priority text not null default 'Normal' check (priority in ('Normal','Hoch','Notfall')),
  address text,
  description text,
  estimated_hours numeric(8,2) not null default 0,
  material_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.jobs enable row level security;
drop policy if exists "jobs_select_own" on public.jobs;
drop policy if exists "jobs_insert_own" on public.jobs;
drop policy if exists "jobs_update_own" on public.jobs;
drop policy if exists "jobs_delete_own" on public.jobs;
create policy "jobs_select_own" on public.jobs for select to authenticated using (auth.uid() = owner_id);
create policy "jobs_insert_own" on public.jobs for insert to authenticated with check (
  auth.uid() = owner_id
  and exists (select 1 from public.customers c where c.id = customer_id and c.owner_id = auth.uid())
  and (employee_id is null or exists (select 1 from public.employees e where e.id = employee_id and e.owner_id = auth.uid()))
);
create policy "jobs_update_own" on public.jobs for update to authenticated using (auth.uid() = owner_id) with check (
  auth.uid() = owner_id
  and exists (select 1 from public.customers c where c.id = customer_id and c.owner_id = auth.uid())
  and (employee_id is null or exists (select 1 from public.employees e where e.id = employee_id and e.owner_id = auth.uid()))
);
create policy "jobs_delete_own" on public.jobs for delete to authenticated using (auth.uid() = owner_id);
create index if not exists jobs_owner_id_idx on public.jobs(owner_id);
create index if not exists jobs_date_idx on public.jobs(owner_id, job_date);
create index if not exists jobs_customer_idx on public.jobs(customer_id);
create index if not exists jobs_employee_idx on public.jobs(employee_id);
