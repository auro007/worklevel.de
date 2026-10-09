-- Mahnungen lists every unpaid invoice the office treats as überfällig:
-- status Überfällig, or Offen with a due date before today.

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
    else greatest(0, (current_date - d.due_date))::integer
  end as days_overdue
from public.documents d
where d.doc_type = 'invoice'
  and d.paid_at is null
  and d.status not in ('Bezahlt', 'Storniert', 'Entwurf')
  and (
    d.status = 'Überfällig'
    or (d.status = 'Offen' and d.due_date is not null and d.due_date < current_date)
  );

grant select on public.overdue_open_invoices to authenticated;
