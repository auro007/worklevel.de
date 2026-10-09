-- WORKLEVEL V5 - TECHNIKER WORKFLOW
-- Run once in Supabase > SQL Editor AFTER the working V4 setup.
-- This migration keeps all existing customers, employees and jobs.

create extension if not exists pgcrypto;

-- Work sessions. Each start/resume creates a session; pause/end closes it.
create table if not exists public.job_time_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

-- Materials actually used on a job.
create table if not exists public.job_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  material_name text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null default 'Stk.',
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now()
);

-- Technician / office notes.
create table if not exists public.job_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

-- Metadata for private job photos.
create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  storage_path text not null,
  file_name text,
  caption text,
  created_at timestamptz not null default now()
);

-- One current customer signature per job (upserted by the app).
create table if not exists public.job_signatures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  signer_name text,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique(owner_id, job_id)
);

alter table public.job_time_entries enable row level security;
alter table public.job_materials enable row level security;
alter table public.job_notes enable row level security;
alter table public.job_photos enable row level security;
alter table public.job_signatures enable row level security;

-- Helper pattern: rows belong to the logged-in account and must point at that account's job.
drop policy if exists "job_time_entries_own" on public.job_time_entries;
create policy "job_time_entries_own" on public.job_time_entries
for all to authenticated
using (
  auth.uid() = owner_id
  and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
)
with check (
  auth.uid() = owner_id
  and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  and (employee_id is null or exists (select 1 from public.employees e where e.id = employee_id and e.owner_id = auth.uid()))
);

drop policy if exists "job_materials_own" on public.job_materials;
create policy "job_materials_own" on public.job_materials
for all to authenticated
using (auth.uid() = owner_id and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
with check (auth.uid() = owner_id and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()));

drop policy if exists "job_notes_own" on public.job_notes;
create policy "job_notes_own" on public.job_notes
for all to authenticated
using (auth.uid() = owner_id and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
with check (auth.uid() = owner_id and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()));

drop policy if exists "job_photos_own" on public.job_photos;
create policy "job_photos_own" on public.job_photos
for all to authenticated
using (auth.uid() = owner_id and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
with check (auth.uid() = owner_id and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()));

drop policy if exists "job_signatures_own" on public.job_signatures;
create policy "job_signatures_own" on public.job_signatures
for all to authenticated
using (auth.uid() = owner_id and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
with check (auth.uid() = owner_id and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()));

create index if not exists job_time_entries_job_idx on public.job_time_entries(job_id, started_at);
create index if not exists job_materials_job_idx on public.job_materials(job_id, created_at);
create index if not exists job_notes_job_idx on public.job_notes(job_id, created_at);
create index if not exists job_photos_job_idx on public.job_photos(job_id, created_at);
create index if not exists job_signatures_job_idx on public.job_signatures(job_id);

-- Private storage for photos and signatures.
insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', false)
on conflict (id) do update set public = false;

-- Each user's files live under: <auth-user-id>/<job-id>/...
drop policy if exists "job_files_select_own" on storage.objects;
drop policy if exists "job_files_insert_own" on storage.objects;
drop policy if exists "job_files_update_own" on storage.objects;
drop policy if exists "job_files_delete_own" on storage.objects;

create policy "job_files_select_own" on storage.objects
for select to authenticated
using (bucket_id = 'job-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "job_files_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'job-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "job_files_update_own" on storage.objects
for update to authenticated
using (bucket_id = 'job-files' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'job-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "job_files_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'job-files' and (storage.foldername(name))[1] = auth.uid()::text);
