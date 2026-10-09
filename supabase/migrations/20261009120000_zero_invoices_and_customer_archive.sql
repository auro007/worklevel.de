-- 0 € invoices are not overdue. Customers can be archived instead of deleted.

alter table public.customers add column if not exists archived boolean not null default false;

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
    and coalesce(total_amount, 0) <= 0;

  update public.documents
  set status = 'Überfällig',
      updated_at = now()
  where doc_type = 'invoice'
    and status = 'Offen'
    and paid_at is null
    and coalesce(total_amount, 0) > 0
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
  end as days_overdue
from public.documents d
where d.doc_type = 'invoice'
  and d.paid_at is null
  and coalesce(d.total_amount, 0) > 0
  and d.status not in ('Bezahlt', 'Storniert', 'Entwurf')
  and (
    d.status = 'Überfällig'
    or (
      d.status = 'Offen'
      and d.due_date is not null
      and d.due_date <= (timezone('Europe/Berlin', now()))::date
    )
  );

grant select on public.overdue_open_invoices to authenticated;
