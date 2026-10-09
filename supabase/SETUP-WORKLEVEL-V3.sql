-- WORKLEVEL V3 - run this once in Supabase > SQL Editor.
-- It removes the temporary public development policy and makes customer rows private to the signed-in user.

create extension if not exists pgcrypto;

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

create policy "customers_select_own"
on public.customers for select
to authenticated
using (auth.uid() = owner_id);

create policy "customers_insert_own"
on public.customers for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "customers_update_own"
on public.customers for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "customers_delete_own"
on public.customers for delete
to authenticated
using (auth.uid() = owner_id);

create index if not exists customers_owner_id_idx on public.customers(owner_id);
