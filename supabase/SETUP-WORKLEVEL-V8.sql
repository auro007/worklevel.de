-- WORKLEVEL V8 - ANGEBOTE, LIEFERSCHEINE, RECHNUNGEN + PDF-DATEN
-- Run ONCE in Supabase > SQL Editor after V7 is working.
-- Keeps all existing companies, users, customers, jobs and technician data.

create extension if not exists pgcrypto;

-- Company document defaults.
alter table public.companies add column if not exists iban text;
alter table public.companies add column if not exists bic text;
alter table public.companies add column if not exists bank_name text;
alter table public.companies add column if not exists default_vat_rate numeric(5,2) not null default 19;
alter table public.companies add column if not exists payment_terms_days integer not null default 14;
alter table public.companies add column if not exists invoice_prefix text not null default 'RE';
alter table public.companies add column if not exists offer_prefix text not null default 'AG';
alter table public.companies add column if not exists delivery_prefix text not null default 'LS';
alter table public.companies add column if not exists document_footer text;
alter table public.companies add column if not exists logo_url text;

create table if not exists public.document_sequences (
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_type text not null check (doc_type in ('offer','delivery_note','invoice')),
  year integer not null,
  last_number integer not null default 0,
  primary key (company_id, doc_type, year)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id bigint not null references public.customers(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  doc_type text not null check (doc_type in ('offer','delivery_note','invoice')),
  document_number text not null,
  status text not null default 'Entwurf',
  issue_date date not null default current_date,
  due_date date,
  valid_until date,
  title text,
  intro_text text,
  notes text,
  vat_rate numeric(5,2) not null default 19,
  subtotal numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, document_number)
);

create table if not exists public.document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  position integer not null default 1,
  item_type text not null default 'service' check (item_type in ('service','material','text')),
  description text not null,
  quantity numeric(12,3) not null default 1,
  unit text not null default 'Stk.',
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists documents_company_idx on public.documents(company_id, doc_type, issue_date desc);
create index if not exists documents_customer_idx on public.documents(customer_id);
create index if not exists documents_job_idx on public.documents(job_id);
create index if not exists document_items_document_idx on public.document_items(document_id, position);

alter table public.document_sequences enable row level security;
alter table public.documents enable row level security;
alter table public.document_items enable row level security;

-- Office and owner may manage commercial documents. Workers have no document access.
drop policy if exists document_sequences_company_access on public.document_sequences;
create policy document_sequences_company_access on public.document_sequences
for all to authenticated
using (public.has_company_role(company_id,array['owner','admin']))
with check (public.has_company_role(company_id,array['owner','admin']));

drop policy if exists documents_company_access on public.documents;
create policy documents_company_access on public.documents
for all to authenticated
using (public.has_company_role(company_id,array['owner','admin']))
with check (public.has_company_role(company_id,array['owner','admin']));

drop policy if exists document_items_company_access on public.document_items;
create policy document_items_company_access on public.document_items
for all to authenticated
using (public.has_company_role(company_id,array['owner','admin']))
with check (public.has_company_role(company_id,array['owner','admin']));

-- Allocate a sequential number safely and create the document header in one transaction.
create or replace function public.create_business_document(
  p_company uuid,
  p_customer bigint,
  p_job uuid,
  p_type text,
  p_issue_date date,
  p_due_date date,
  p_valid_until date,
  p_title text,
  p_intro text,
  p_notes text,
  p_vat_rate numeric
)
returns table(id uuid, document_number text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_year integer;
  v_next integer;
  v_prefix text;
  v_number text;
  v_id uuid;
begin
  if not public.has_company_role(p_company,array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;
  if p_type not in ('offer','delivery_note','invoice') then
    raise exception 'Ungültiger Dokumenttyp';
  end if;
  if not exists(select 1 from public.customers c where c.id=p_customer and c.company_id=p_company) then
    raise exception 'Kunde gehört nicht zu dieser Firma';
  end if;
  if p_job is not null and not exists(select 1 from public.jobs j where j.id=p_job and j.company_id=p_company) then
    raise exception 'Auftrag gehört nicht zu dieser Firma';
  end if;

  v_year := extract(year from coalesce(p_issue_date,current_date));
  select case p_type
    when 'invoice' then coalesce(nullif(trim(invoice_prefix),''),'RE')
    when 'offer' then coalesce(nullif(trim(offer_prefix),''),'AG')
    else coalesce(nullif(trim(delivery_prefix),''),'LS') end
  into v_prefix from public.companies c where c.id=p_company;

  insert into public.document_sequences(company_id,doc_type,year,last_number)
  values(p_company,p_type,v_year,1)
  on conflict(company_id,doc_type,year)
  do update set last_number=public.document_sequences.last_number+1
  returning last_number into v_next;

  v_number := v_prefix || '-' || v_year::text || '-' || lpad(v_next::text,4,'0');

  insert into public.documents(company_id,customer_id,job_id,created_by,doc_type,document_number,status,issue_date,due_date,valid_until,title,intro_text,notes,vat_rate)
  values(p_company,p_customer,p_job,auth.uid(),p_type,v_number,'Entwurf',coalesce(p_issue_date,current_date),p_due_date,p_valid_until,p_title,p_intro,p_notes,coalesce(p_vat_rate,19))
  returning public.documents.id into v_id;

  return query select v_id,v_number;
end;
$$;
grant execute on function public.create_business_document(uuid,bigint,uuid,text,date,date,date,text,text,text,numeric) to authenticated;

-- Recalculate totals from positions; called after item changes.
create or replace function public.recalculate_document(p_document uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company uuid;
  v_sub numeric(12,2);
  v_rate numeric(5,2);
begin
  select company_id,vat_rate into v_company,v_rate from public.documents where id=p_document;
  if v_company is null or not public.has_company_role(v_company,array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;
  select coalesce(sum(line_total),0)::numeric(12,2) into v_sub from public.document_items where document_id=p_document;
  update public.documents
  set subtotal=v_sub,
      vat_amount=round(v_sub*coalesce(v_rate,0)/100,2),
      total_amount=round(v_sub+(v_sub*coalesce(v_rate,0)/100),2),
      updated_at=now()
  where id=p_document;
end;
$$;
grant execute on function public.recalculate_document(uuid) to authenticated;
