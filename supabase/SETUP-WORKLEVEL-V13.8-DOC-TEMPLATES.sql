-- WORKLEVEL V13.8 — Document templates (Fertige Vorlagen)
-- Angebot/Rechnung: named templates with Vorbemerkung (intro), Nachbemerkung (notes),
-- title, vat defaults, optional default line items.
-- Additive. Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_type text not null check (doc_type in ('offer', 'invoice')),
  name text not null,
  title text,
  intro text,
  notes text,
  vat_rate numeric(5,2) not null default 19,
  default_items jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent column ensures
alter table public.document_templates add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.document_templates add column if not exists doc_type text;
alter table public.document_templates add column if not exists name text;
alter table public.document_templates add column if not exists title text;
alter table public.document_templates add column if not exists intro text;
alter table public.document_templates add column if not exists notes text;
alter table public.document_templates add column if not exists vat_rate numeric(5,2) not null default 19;
alter table public.document_templates add column if not exists default_items jsonb not null default '[]'::jsonb;
alter table public.document_templates add column if not exists active boolean not null default true;
alter table public.document_templates add column if not exists created_at timestamptz not null default now();
alter table public.document_templates add column if not exists updated_at timestamptz not null default now();

-- Ensure doc_type check constraint exists (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'document_templates_doc_type_check'
      and conrelid = 'public.document_templates'::regclass
  ) then
    alter table public.document_templates
      add constraint document_templates_doc_type_check
      check (doc_type in ('offer', 'invoice'));
  end if;
exception when others then
  null;
end $$;

create index if not exists document_templates_company_type_idx
  on public.document_templates (company_id, doc_type);

create index if not exists document_templates_company_active_idx
  on public.document_templates (company_id, active);

-- updated_at touch
create or replace function public.touch_document_templates_updated_at()
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

drop trigger if exists document_templates_touch_updated_at on public.document_templates;
create trigger document_templates_touch_updated_at
  before update on public.document_templates
  for each row execute function public.touch_document_templates_updated_at();

revoke all on function public.touch_document_templates_updated_at() from public, anon, authenticated;

alter table public.document_templates enable row level security;

drop policy if exists document_templates_office on public.document_templates;
create policy document_templates_office on public.document_templates
  for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin']))
  with check (public.has_company_role(company_id, array['owner','admin']));

grant select, insert, update, delete on public.document_templates to authenticated;

notify pgrst, 'reload schema';
