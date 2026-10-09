-- WORKLEVEL starter schema for the cloud phase.
-- Run this later in Supabase SQL Editor after authentication/tenant design is finalized.

create table if not exists customers (
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

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  phone text,
  email text,
  status text not null default 'Verfügbar',
  xp integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text,
  title text not null,
  customer_id uuid references customers(id),
  employee_id uuid references employees(id),
  job_date date,
  job_time time,
  status text not null default 'Geplant',
  priority text not null default 'Normal',
  address text,
  description text,
  estimated_hours numeric not null default 0,
  material_cost numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Do not use public anon "true" policies in production.
-- Add Supabase Auth and company/tenant-specific RLS before storing real customer data.
