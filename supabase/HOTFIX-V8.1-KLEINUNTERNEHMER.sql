-- WORKLEVEL V8.1
-- Adds company/document tax mode for regular VAT or Kleinunternehmer (§ 19 Abs. 1 UStG).
-- Safe to run once after V8 / V8 hotfix. Existing data is kept.

alter table public.companies
  add column if not exists taxation_mode text not null default 'standard';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'companies_taxation_mode_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_taxation_mode_check
      check (taxation_mode in ('standard','small_business'));
  end if;
end $$;

alter table public.documents
  add column if not exists taxation_mode text not null default 'standard';

alter table public.documents
  add column if not exists tax_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_taxation_mode_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_taxation_mode_check
      check (taxation_mode in ('standard','small_business'));
  end if;
end $$;

-- Existing documents remain standard VAT documents.
-- For Kleinunternehmer documents the app saves vat_rate = 0 and the mandatory exemption notice.
