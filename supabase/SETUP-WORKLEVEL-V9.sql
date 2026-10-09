-- WORKLEVEL V9 - DOKUMENTVERSAND + AKTIVITÄTSPROTOKOLL
-- Run ONCE after V8 / V8.1 is already installed.
-- Keeps all existing data.

alter table public.documents add column if not exists sent_at timestamptz;
alter table public.documents add column if not exists last_sent_at timestamptz;
alter table public.documents add column if not exists sent_to_email text;
alter table public.documents add column if not exists sent_count integer not null default 0;

create table if not exists public.document_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created','sent','shared','downloaded','status_changed')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists document_events_document_idx on public.document_events(document_id, created_at desc);
create index if not exists document_events_company_idx on public.document_events(company_id, created_at desc);

alter table public.document_events enable row level security;

drop policy if exists document_events_company_access on public.document_events;
create policy document_events_company_access on public.document_events
for all to authenticated
using (public.has_company_role(company_id,array['owner','admin']))
with check (public.has_company_role(company_id,array['owner','admin']));

create or replace function public.mark_document_sent(
  p_document uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company uuid;
  v_type text;
  v_current_status text;
begin
  select d.company_id,d.doc_type,d.status
    into v_company,v_type,v_current_status
  from public.documents d
  where d.id=p_document;

  if v_company is null or not public.has_company_role(v_company,array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;

  update public.documents d
  set sent_at=coalesce(d.sent_at,now()),
      last_sent_at=now(),
      sent_to_email=lower(trim(p_email)),
      sent_count=coalesce(d.sent_count,0)+1,
      status=case
        when v_type='offer' and v_current_status='Entwurf' then 'Gesendet'
        when v_type='invoice' and v_current_status='Entwurf' then 'Offen'
        else v_current_status
      end,
      updated_at=now()
  where d.id=p_document;

  insert into public.document_events(company_id,document_id,actor_user_id,event_type,details)
  values(v_company,p_document,auth.uid(),'sent',jsonb_build_object('email',lower(trim(p_email))));
end;
$$;

grant execute on function public.mark_document_sent(uuid,text) to authenticated;

create or replace function public.log_document_event(
  p_document uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company uuid;
begin
  select d.company_id into v_company from public.documents d where d.id=p_document;
  if v_company is null or not public.has_company_role(v_company,array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;
  if p_event_type not in ('created','sent','shared','downloaded','status_changed') then
    raise exception 'Ungültiger Ereignistyp';
  end if;
  insert into public.document_events(company_id,document_id,actor_user_id,event_type,details)
  values(v_company,p_document,auth.uid(),p_event_type,coalesce(p_details,'{}'::jsonb));
end;
$$;

grant execute on function public.log_document_event(uuid,text,jsonb) to authenticated;
