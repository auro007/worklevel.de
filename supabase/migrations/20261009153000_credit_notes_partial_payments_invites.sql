-- Credit notes, partial payments, invitation protocol, and the stored bank-name typo.

alter table public.documents
  add column if not exists amount_paid numeric(12,2) not null default 0,
  add column if not exists corrects_document_id uuid null references public.documents(id) on delete set null;

alter table public.documents drop constraint if exists documents_amount_paid_nonneg;
alter table public.documents
  add constraint documents_amount_paid_nonneg check (amount_paid >= 0);

create index if not exists documents_corrects_document_idx
  on public.documents (corrects_document_id)
  where corrects_document_id is not null;

create or replace function public.promote_overdue_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  v_today date := (timezone('Europe/Berlin', now()))::date;
begin
  update public.documents
  set status = 'Offen',
      updated_at = now()
  where doc_type = 'invoice'
    and status = 'Überfällig'
    and paid_at is null
    and coalesce(total_amount, 0) - coalesce(amount_paid, 0) <= 0;

  update public.documents
  set status = 'Überfällig',
      updated_at = now()
  where doc_type = 'invoice'
    and status = 'Offen'
    and paid_at is null
    and coalesce(total_amount, 0) - coalesce(amount_paid, 0) > 0
    and due_date is not null
    and due_date <= v_today;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.promote_overdue_invoices() from public, anon, authenticated;

create or replace view public.overdue_open_invoices
with (security_invoker = true)
as
select
  d.id,
  d.company_id,
  d.customer_id,
  d.document_number,
  d.status,
  d.issue_date,
  d.due_date,
  d.total_amount,
  d.last_reminder_at,
  d.reminder_count,
  d.sent_to_email,
  case
    when d.due_date is null then 0
    else greatest(0, ((timezone('Europe/Berlin', now()))::date - d.due_date))::integer
  end as days_overdue,
  d.amount_paid,
  greatest(0, coalesce(d.total_amount, 0) - coalesce(d.amount_paid, 0)) as open_amount
from public.documents d
where d.doc_type = 'invoice'
  and d.paid_at is null
  and d.status not in ('Bezahlt', 'Storniert', 'Entwurf', 'Stornorechnung')
  and coalesce(d.total_amount, 0) - coalesce(d.amount_paid, 0) > 0
  and (
    d.status = 'Überfällig'
    or (
      d.status = 'Offen'
      and d.due_date is not null
      and d.due_date <= (timezone('Europe/Berlin', now()))::date
    )
  );

grant select on public.overdue_open_invoices to authenticated;

create table if not exists public.company_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null,
  to_email text not null,
  subject text not null,
  body text not null,
  provider text,
  provider_id text,
  created_at timestamptz not null default now(),
  constraint company_messages_kind_check check (kind in ('invite'))
);

create index if not exists company_messages_company_idx
  on public.company_messages (company_id, created_at desc);

alter table public.company_messages enable row level security;

drop policy if exists company_messages_office on public.company_messages;
create policy company_messages_office
  on public.company_messages
  for all
  to authenticated
  using (public.has_company_role(company_id, array['owner','admin']))
  with check (public.has_company_role(company_id, array['owner','admin']));

revoke all on public.company_messages from public, anon;
grant select, insert, update, delete on public.company_messages to authenticated;
grant all on public.company_messages to service_role;

update public.companies
set bank_name = 'Trade Republic'
where id = '0a792929-8800-4807-9266-f71f9560ab55'
  and lower(replace(bank_name, ' ', '')) = 'tarderepublic';
