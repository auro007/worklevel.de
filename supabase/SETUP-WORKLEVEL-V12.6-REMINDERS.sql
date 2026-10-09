-- =============================================================================
-- WORKLEVEL V12.6 — Invoice payment reminders (idempotent / additive)
-- =============================================================================
-- Run AFTER SETUP-WORKLEVEL-V12.5-LEADS.sql (and V12.4 Security).
-- Adds reminder tracking on documents + mark_invoice_reminded RPC + overdue view.
-- Does NOT require Resend. Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Columns on documents (mirrors sent_count / last_sent_at pattern)
-- ---------------------------------------------------------------------------
alter table public.documents add column if not exists last_reminder_at timestamptz;
alter table public.documents add column if not exists reminder_count integer not null default 0;

-- Optional dedicated history table (audit trail beyond document_events)
create table if not exists public.document_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  channel text not null default 'manual'
    check (channel in ('manual','email','mailto','copy')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists document_reminders_document_idx
  on public.document_reminders(document_id, created_at desc);
create index if not exists document_reminders_company_idx
  on public.document_reminders(company_id, created_at desc);

alter table public.document_reminders enable row level security;

drop policy if exists document_reminders_office on public.document_reminders;
create policy document_reminders_office on public.document_reminders
  for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin']))
  with check (public.has_company_role(company_id, array['owner','admin']));

grant select, insert on public.document_reminders to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Expand document_events event_type whitelist (+ log_document_event)
-- ---------------------------------------------------------------------------
alter table public.document_events drop constraint if exists document_events_event_type_check;
alter table public.document_events
  add constraint document_events_event_type_check
  check (event_type in (
    'created','sent','shared','downloaded','status_changed',
    'link_created','link_revoked','customer_response','converted_to_job',
    'payment_recorded','reminder_logged'
  ));

create or replace function public.log_document_event(
  p_document uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select d.company_id into v_company
  from public.documents d
  where d.id = p_document;

  if v_company is null or not public.has_company_role(v_company, array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;

  if p_event_type not in (
    'created','sent','shared','downloaded','status_changed',
    'link_created','link_revoked','customer_response','converted_to_job',
    'payment_recorded','reminder_logged'
  ) then
    raise exception 'Ungültiger Ereignistyp';
  end if;

  insert into public.document_events(company_id, document_id, actor_user_id, event_type, details)
  values (v_company, p_document, auth.uid(), p_event_type, coalesce(p_details, '{}'::jsonb));
end;
$$;

revoke all on function public.log_document_event(uuid, text, jsonb) from public, anon;
grant execute on function public.log_document_event(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPC: mark_invoice_reminded — owner/admin only
-- ---------------------------------------------------------------------------
create or replace function public.mark_invoice_reminded(
  p_document uuid,
  p_channel text default 'manual',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_type text;
  v_status text;
  v_due date;
  v_count integer;
  v_channel text;
begin
  v_channel := coalesce(nullif(trim(p_channel), ''), 'manual');
  if v_channel not in ('manual','email','mailto','copy') then
    v_channel := 'manual';
  end if;

  select d.company_id, d.doc_type, d.status, d.due_date, coalesce(d.reminder_count, 0)
    into v_company, v_type, v_status, v_due, v_count
  from public.documents d
  where d.id = p_document;

  if v_company is null or not public.has_company_role(v_company, array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;
  if v_type <> 'invoice' then
    raise exception 'Nur Rechnungen können gemahnt werden';
  end if;
  if v_status in ('Bezahlt', 'Storniert', 'Entwurf') then
    raise exception 'Mahnung nur für offene / überfällige Rechnungen';
  end if;

  v_count := v_count + 1;

  update public.documents d
  set last_reminder_at = now(),
      reminder_count = v_count,
      status = case
        when v_due is not null and v_due <= (timezone('Europe/Berlin', now()))::date and d.status = 'Offen' then 'Überfällig'
        else d.status
      end,
      updated_at = now()
  where d.id = p_document;

  insert into public.document_reminders(company_id, document_id, actor_user_id, channel, note)
  values (v_company, p_document, auth.uid(), v_channel, nullif(trim(coalesce(p_note, '')), ''));

  insert into public.document_events(company_id, document_id, actor_user_id, event_type, details)
  values (
    v_company, p_document, auth.uid(), 'reminder_logged',
    jsonb_build_object(
      'channel', v_channel,
      'reminder_count', v_count,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  return jsonb_build_object(
    'ok', true,
    'reminder_count', v_count,
    'last_reminder_at', now(),
    'channel', v_channel
  );
end;
$$;

revoke all on function public.mark_invoice_reminded(uuid, text, text) from public, anon;
grant execute on function public.mark_invoice_reminded(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Helper view: overdue open invoices (RLS via underlying documents)
-- ---------------------------------------------------------------------------
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
  end as days_overdue
from public.documents d
where d.doc_type = 'invoice'
  and d.paid_at is null
  and d.status not in ('Bezahlt', 'Storniert', 'Entwurf')
  and (
    d.status = 'Überfällig'
    or (d.status = 'Offen' and d.due_date is not null and d.due_date <= (timezone('Europe/Berlin', now()))::date)
  );

grant select on public.overdue_open_invoices to authenticated;

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
  set status = 'Überfällig',
      updated_at = now()
  where doc_type = 'invoice'
    and status = 'Offen'
    and paid_at is null
    and due_date is not null
    and due_date <= v_today;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.promote_overdue_invoices() from public, anon, authenticated;

-- Index to speed overdue lookups
create index if not exists documents_invoice_due_idx
  on public.documents(company_id, doc_type, status, due_date)
  where doc_type = 'invoice';

notify pgrst, 'reload schema';
