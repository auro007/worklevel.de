-- WORKLEVEL V11
-- Additive / idempotent migration for an EXISTING Supabase project that already runs V7–V9.
-- Do NOT re-run V3–V9 from scratch. This script only adds V11 features.
--
-- Adds:
--   * Public customer offer portal (token links, accept/reject/request changes, signature)
--   * Offer → Job conversion
--   * Invoice payment basics (paid_at / payment_note)
--   * Extra document activity events
--
-- Important: customers.id is bigint in the live database. Do not change that here.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Document columns for portal, conversion and payments
-- ---------------------------------------------------------------------------
alter table public.documents add column if not exists converted_job_id uuid references public.jobs(id) on delete set null;
alter table public.documents add column if not exists customer_response_at timestamptz;
alter table public.documents add column if not exists customer_response_name text;
alter table public.documents add column if not exists customer_response_message text;
alter table public.documents add column if not exists paid_at timestamptz;
alter table public.documents add column if not exists payment_note text;

create index if not exists documents_converted_job_idx on public.documents(converted_job_id);

-- Expand allowed document_events types (drop/recreate check if present)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'document_events_event_type_check'
      and conrelid = 'public.document_events'::regclass
  ) then
    alter table public.document_events drop constraint document_events_event_type_check;
  end if;
exception when undefined_table then
  null;
end $$;

alter table public.document_events drop constraint if exists document_events_event_type_check;
alter table public.document_events
  add constraint document_events_event_type_check
  check (event_type in (
    'created','sent','shared','downloaded','status_changed',
    'link_created','link_revoked','customer_response','converted_to_job','payment_recorded'
  ));

-- ---------------------------------------------------------------------------
-- Offer public links
-- ---------------------------------------------------------------------------
create table if not exists public.offer_public_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_opened_at timestamptz
);

create index if not exists offer_public_links_document_idx
  on public.offer_public_links(document_id, created_at desc);
create index if not exists offer_public_links_token_idx
  on public.offer_public_links(token);

alter table public.offer_public_links enable row level security;

drop policy if exists offer_public_links_company_access on public.offer_public_links;
create policy offer_public_links_company_access on public.offer_public_links
for all to authenticated
using (public.has_company_role(company_id, array['owner','admin']))
with check (public.has_company_role(company_id, array['owner','admin']));

-- ---------------------------------------------------------------------------
-- Customer responses
-- ---------------------------------------------------------------------------
create table if not exists public.offer_customer_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  link_id uuid references public.offer_public_links(id) on delete set null,
  action text not null check (action in ('accept','reject','request_change')),
  customer_name text,
  customer_message text,
  signature_data text,
  created_at timestamptz not null default now()
);

create index if not exists offer_customer_responses_document_idx
  on public.offer_customer_responses(document_id, created_at desc);

alter table public.offer_customer_responses enable row level security;

drop policy if exists offer_customer_responses_company_access on public.offer_customer_responses;
create policy offer_customer_responses_company_access on public.offer_customer_responses
for all to authenticated
using (public.has_company_role(company_id, array['owner','admin']))
with check (public.has_company_role(company_id, array['owner','admin']));

-- No direct anon table access. Public flow goes only through SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- Helper: log document event (office) – keep V9 signature, allow new types
-- ---------------------------------------------------------------------------
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
    'link_created','link_revoked','customer_response','converted_to_job','payment_recorded'
  ) then
    raise exception 'Ungültiger Ereignistyp';
  end if;

  insert into public.document_events(company_id, document_id, actor_user_id, event_type, details)
  values (v_company, p_document, auth.uid(), p_event_type, coalesce(p_details, '{}'::jsonb));
end;
$$;

grant execute on function public.log_document_event(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Create / regenerate public offer link
-- ---------------------------------------------------------------------------
create or replace function public.create_offer_public_link(
  p_document uuid,
  p_days integer default 30
)
returns table(id uuid, token text, expires_at timestamptz, public_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_type text;
  v_token text;
  v_expires timestamptz;
  v_id uuid;
  v_days integer;
begin
  select d.company_id, d.doc_type
    into v_company, v_type
  from public.documents d
  where d.id = p_document;

  if v_company is null or not public.has_company_role(v_company, array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;
  if v_type is distinct from 'offer' then
    raise exception 'Kundenlink nur für Angebote';
  end if;

  v_days := greatest(coalesce(p_days, 30), 1);

  -- Revoke any previous active links for this offer
  update public.offer_public_links opl
  set revoked_at = now()
  where opl.document_id = p_document
    and opl.revoked_at is null;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(days => v_days);

  insert into public.offer_public_links(company_id, document_id, token, expires_at, created_by)
  values (v_company, p_document, v_token, v_expires, auth.uid())
  returning public.offer_public_links.id into v_id;

  -- Move Entwurf → Gesendet when a customer link is created
  update public.documents d
  set status = case when d.status = 'Entwurf' then 'Gesendet' else d.status end,
      updated_at = now()
  where d.id = p_document;

  insert into public.document_events(company_id, document_id, actor_user_id, event_type, details)
  values (
    v_company, p_document, auth.uid(), 'link_created',
    jsonb_build_object('expires_at', v_expires, 'days', v_days)
  );

  return query
  select v_id, v_token, v_expires, ('/angebot/' || v_token)::text;
end;
$$;

grant execute on function public.create_offer_public_link(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Revoke active public link
-- ---------------------------------------------------------------------------
create or replace function public.revoke_offer_public_link(p_document uuid)
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

  update public.offer_public_links opl
  set revoked_at = now()
  where opl.document_id = p_document
    and opl.revoked_at is null;

  insert into public.document_events(company_id, document_id, actor_user_id, event_type, details)
  values (v_company, p_document, auth.uid(), 'link_revoked', '{}'::jsonb);
end;
$$;

grant execute on function public.revoke_offer_public_link(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public: get offer by token (anon + authenticated)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_offer(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.offer_public_links%rowtype;
  v_doc public.documents%rowtype;
  v_company public.companies%rowtype;
  v_customer_name text;
  v_items jsonb;
  v_status text;
begin
  if p_token is null or length(trim(p_token)) < 20 then
    return jsonb_build_object('ok', false, 'error', 'Ungültiger Link');
  end if;

  select opl.* into v_link
  from public.offer_public_links opl
  where opl.token = trim(p_token)
  order by opl.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Link nicht gefunden');
  end if;

  if v_link.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Dieser Link wurde zurückgezogen');
  end if;

  if v_link.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'Dieser Link ist abgelaufen');
  end if;

  select d.* into v_doc
  from public.documents d
  where d.id = v_link.document_id;

  if not found or v_doc.doc_type <> 'offer' then
    return jsonb_build_object('ok', false, 'error', 'Angebot nicht gefunden');
  end if;

  select c.* into v_company
  from public.companies c
  where c.id = v_doc.company_id;

  select cust.company_name into v_customer_name
  from public.customers cust
  where cust.id = v_doc.customer_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'position', di.position,
      'item_type', di.item_type,
      'description', di.description,
      'quantity', di.quantity,
      'unit', di.unit,
      'unit_price', di.unit_price,
      'line_total', di.line_total
    ) order by di.position
  ), '[]'::jsonb)
  into v_items
  from public.document_items di
  where di.document_id = v_doc.id;

  update public.offer_public_links opl
  set last_opened_at = now()
  where opl.id = v_link.id;

  v_status := case
    when v_doc.status in ('Angenommen','Abgelehnt','Änderung angefragt') then 'responded'
    else 'open'
  end;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'link', jsonb_build_object(
      'expires_at', v_link.expires_at
    ),
    'company', jsonb_build_object(
      'name', v_company.name,
      'street', v_company.street,
      'postal_code', v_company.postal_code,
      'city', v_company.city,
      'phone', v_company.phone,
      'email', v_company.email,
      'logo_url', v_company.logo_url,
      'document_footer', v_company.document_footer
    ),
    'customer_name', v_customer_name,
    'document', jsonb_build_object(
      'id', v_doc.id,
      'document_number', v_doc.document_number,
      'status', v_doc.status,
      'issue_date', v_doc.issue_date,
      'valid_until', v_doc.valid_until,
      'title', v_doc.title,
      'intro_text', v_doc.intro_text,
      'notes', v_doc.notes,
      'vat_rate', v_doc.vat_rate,
      'taxation_mode', v_doc.taxation_mode,
      'tax_note', v_doc.tax_note,
      'subtotal', v_doc.subtotal,
      'vat_amount', v_doc.vat_amount,
      'total_amount', v_doc.total_amount,
      'customer_response_at', v_doc.customer_response_at,
      'customer_response_name', v_doc.customer_response_name,
      'customer_response_message', v_doc.customer_response_message
    ),
    'items', v_items
  );
end;
$$;

grant execute on function public.get_public_offer(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public: respond to offer
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_public_offer(
  p_token text,
  p_action text,
  p_customer_name text default null,
  p_customer_message text default null,
  p_signature_data text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.offer_public_links%rowtype;
  v_doc public.documents%rowtype;
  v_new_status text;
begin
  if p_action not in ('accept','reject','request_change') then
    return jsonb_build_object('ok', false, 'error', 'Ungültige Aktion');
  end if;

  select opl.* into v_link
  from public.offer_public_links opl
  where opl.token = trim(p_token)
    and opl.revoked_at is null
  order by opl.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Link nicht gefunden oder ungültig');
  end if;

  if v_link.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'Dieser Link ist abgelaufen');
  end if;

  select d.* into v_doc
  from public.documents d
  where d.id = v_link.document_id
    and d.doc_type = 'offer';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Angebot nicht gefunden');
  end if;

  if v_doc.status in ('Angenommen','Abgelehnt') then
    return jsonb_build_object('ok', false, 'error', 'Dieses Angebot wurde bereits beantwortet');
  end if;

  v_new_status := case p_action
    when 'accept' then 'Angenommen'
    when 'reject' then 'Abgelehnt'
    else 'Änderung angefragt'
  end;

  insert into public.offer_customer_responses(
    company_id, document_id, link_id, action, customer_name, customer_message, signature_data
  ) values (
    v_doc.company_id, v_doc.id, v_link.id, p_action,
    nullif(trim(coalesce(p_customer_name,'')), ''),
    nullif(trim(coalesce(p_customer_message,'')), ''),
    nullif(p_signature_data, '')
  );

  update public.documents d
  set status = v_new_status,
      customer_response_at = now(),
      customer_response_name = nullif(trim(coalesce(p_customer_name,'')), ''),
      customer_response_message = nullif(trim(coalesce(p_customer_message,'')), ''),
      updated_at = now()
  where d.id = v_doc.id;

  insert into public.document_events(company_id, document_id, actor_user_id, event_type, details)
  values (
    v_doc.company_id, v_doc.id, null, 'customer_response',
    jsonb_build_object(
      'action', p_action,
      'status', v_new_status,
      'customer_name', nullif(trim(coalesce(p_customer_name,'')), '')
    )
  );

  return jsonb_build_object('ok', true, 'status', v_new_status);
end;
$$;

grant execute on function public.respond_to_public_offer(text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Convert accepted offer → job
-- ---------------------------------------------------------------------------
create or replace function public.create_job_from_offer(p_document uuid)
returns table(id uuid, job_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
  v_customer public.customers%rowtype;
  v_job_id uuid;
  v_job_number text;
  v_year integer;
  v_count integer;
  v_address text;
begin
  select d.* into v_doc
  from public.documents d
  where d.id = p_document;

  if not found then
    raise exception 'Dokument nicht gefunden';
  end if;

  if not public.has_company_role(v_doc.company_id, array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;

  if v_doc.doc_type <> 'offer' then
    raise exception 'Nur Angebote können in Aufträge umgewandelt werden';
  end if;

  if v_doc.status <> 'Angenommen' then
    raise exception 'Nur angenommene Angebote können umgewandelt werden';
  end if;

  if v_doc.converted_job_id is not null then
    return query
    select j.id, j.job_number
    from public.jobs j
    where j.id = v_doc.converted_job_id;
    return;
  end if;

  select cust.* into v_customer
  from public.customers cust
  where cust.id = v_doc.customer_id
    and cust.company_id = v_doc.company_id;

  if not found then
    raise exception 'Kunde nicht gefunden';
  end if;

  v_year := extract(year from current_date)::integer;
  select count(*)::integer into v_count
  from public.jobs j
  where j.company_id = v_doc.company_id
    and extract(year from j.job_date) = v_year;

  v_job_number := 'AU-' || v_year::text || '-' || lpad((v_count + 1)::text, 4, '0');
  v_address := trim(both from concat_ws(', ',
    nullif(v_customer.street, ''),
    trim(both from concat_ws(' ', nullif(v_customer.postal_code,''), nullif(v_customer.city,'')))
  ));

  insert into public.jobs(
    owner_id, company_id, job_number, title, customer_id,
    job_date, job_time, status, priority, address, description,
    estimated_hours, material_cost
  ) values (
    auth.uid(),
    v_doc.company_id,
    v_job_number,
    coalesce(nullif(trim(v_doc.title), ''), 'Auftrag aus ' || v_doc.document_number),
    v_doc.customer_id,
    current_date,
    '08:00',
    'Geplant',
    'Normal',
    nullif(v_address, ''),
    concat_ws(E'\n\n',
      'Erstellt aus Angebot ' || v_doc.document_number,
      nullif(v_doc.intro_text, ''),
      nullif(v_doc.notes, '')
    ),
    0,
    0
  )
  returning public.jobs.id into v_job_id;

  update public.documents d
  set converted_job_id = v_job_id,
      updated_at = now()
  where d.id = v_doc.id;

  insert into public.document_events(company_id, document_id, actor_user_id, event_type, details)
  values (
    v_doc.company_id, v_doc.id, auth.uid(), 'converted_to_job',
    jsonb_build_object('job_id', v_job_id, 'job_number', v_job_number)
  );

  return query select v_job_id, v_job_number;
end;
$$;

grant execute on function public.create_job_from_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Invoice payment helper
-- ---------------------------------------------------------------------------
create or replace function public.mark_invoice_paid(
  p_document uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_type text;
begin
  select d.company_id, d.doc_type
    into v_company, v_type
  from public.documents d
  where d.id = p_document;

  if v_company is null or not public.has_company_role(v_company, array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;
  if v_type <> 'invoice' then
    raise exception 'Nur Rechnungen können als bezahlt markiert werden';
  end if;

  update public.documents d
  set status = 'Bezahlt',
      paid_at = coalesce(d.paid_at, now()),
      payment_note = nullif(trim(coalesce(p_note,'')), ''),
      updated_at = now()
  where d.id = p_document;

  insert into public.document_events(company_id, document_id, actor_user_id, event_type, details)
  values (
    v_company, p_document, auth.uid(), 'payment_recorded',
    jsonb_build_object('note', nullif(trim(coalesce(p_note,'')), ''))
  );
end;
$$;

grant execute on function public.mark_invoice_paid(uuid, text) to authenticated;

-- Done. No destructive changes.
