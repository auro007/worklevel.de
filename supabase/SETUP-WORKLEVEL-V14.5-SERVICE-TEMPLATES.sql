-- =============================================================================
-- WORKLEVEL V14.5 — Wartung service templates (XP + € on recurring templates)
-- =============================================================================
-- Additive + idempotent. Prerequisite: SETUP-WORKLEVEL-V12.7-RECURRING.sql
-- (and V14.4 invoice-from-job if using suggested_price on invoices).
-- Extends recurring_job_templates with default_xp / default_price (EUR).
-- Jobs get xp_reward + suggested_price copied when generated from a template.
-- Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Template defaults (Plantafel sketch: Wartung · 15 XP · 20 €)
-- ---------------------------------------------------------------------------
alter table public.recurring_job_templates
  add column if not exists default_xp integer not null default 15;

alter table public.recurring_job_templates
  add column if not exists default_price numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recurring_job_templates_default_xp_check'
  ) then
    alter table public.recurring_job_templates
      add constraint recurring_job_templates_default_xp_check
      check (default_xp >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'recurring_job_templates_default_price_check'
  ) then
    alter table public.recurring_job_templates
      add constraint recurring_job_templates_default_price_check
      check (default_price >= 0);
  end if;
end $$;

comment on column public.recurring_job_templates.default_xp is
  'V14.5: XP granted to assignee when a job from this template is completed';
comment on column public.recurring_job_templates.default_price is
  'V14.5: Suggested flat EUR price for offer/invoice line (Wartungspauschale)';

-- ---------------------------------------------------------------------------
-- 2) Job snapshot fields (copied from template on generate)
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column if not exists xp_reward integer;

alter table public.jobs
  add column if not exists suggested_price numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_xp_reward_check'
  ) then
    alter table public.jobs
      add constraint jobs_xp_reward_check
      check (xp_reward is null or xp_reward >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_suggested_price_check'
  ) then
    alter table public.jobs
      add constraint jobs_suggested_price_check
      check (suggested_price is null or suggested_price >= 0);
  end if;
end $$;

comment on column public.jobs.xp_reward is
  'V14.5: XP to award on Erledigt (from template default_xp); null → app fallback 50';
comment on column public.jobs.suggested_price is
  'V14.5: Flat EUR suggestion for invoice/offer when no time/material booked';

-- ---------------------------------------------------------------------------
-- 3) generate_due_recurring_jobs — copy XP + price onto new jobs
-- ---------------------------------------------------------------------------
create or replace function public.generate_due_recurring_jobs(
  p_company_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_job_id uuid;
  v_job_number text;
  v_year integer;
  v_count integer;
  v_address text;
  v_run_date date;
  v_next date;
  v_created integer := 0;
  v_templates integer := 0;
  v_customer public.customers%rowtype;
  v_max_per_template integer := 12;
  v_loop integer;
  v_created_ids uuid[] := '{}';
  v_cadence_label text;
  v_xp integer;
  v_price numeric(12,2);
begin
  if p_company_id is not null then
    if not public.has_company_role(p_company_id, array['owner','admin']) then
      raise exception 'Keine Berechtigung';
    end if;
  elsif not exists (
    select 1 from public.company_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','admin')
  ) then
    raise exception 'Keine Berechtigung';
  end if;

  for r in
    select t.*
    from public.recurring_job_templates t
    where t.active = true
      and t.next_run_date <= current_date
      and (
        (p_company_id is not null and t.company_id = p_company_id)
        or (p_company_id is null and public.has_company_role(t.company_id, array['owner','admin']))
      )
    order by t.next_run_date, t.created_at
    for update of t
  loop
    v_templates := v_templates + 1;
    v_run_date := r.next_run_date;
    v_loop := 0;

    select cust.* into v_customer
    from public.customers cust
    where cust.id = r.customer_id and cust.company_id = r.company_id;

    if not found then
      continue;
    end if;

    v_address := trim(both from concat_ws(', ',
      nullif(v_customer.street, ''),
      trim(both from concat_ws(' ', nullif(v_customer.postal_code,''), nullif(v_customer.city,'')))
    ));

    v_cadence_label := case r.cadence
      when 'weekly' then 'wöchentlich'
      when 'biweekly' then 'alle 2 Wochen'
      else 'monatlich'
    end;

    v_xp := greatest(coalesce(r.default_xp, 15), 0);
    v_price := greatest(coalesce(r.default_price, 0), 0);

    while v_run_date <= current_date and v_loop < v_max_per_template loop
      v_loop := v_loop + 1;
      v_year := extract(year from v_run_date)::integer;

      select count(*)::integer into v_count
      from public.jobs j
      where j.company_id = r.company_id
        and extract(year from coalesce(j.job_date, current_date)) = v_year;

      v_job_number := 'AU-' || v_year::text || '-' || lpad((v_count + 1)::text, 4, '0');

      insert into public.jobs(
        owner_id, company_id, job_number, title, customer_id, employee_id,
        job_date, job_time, status, priority, address, description,
        estimated_hours, material_cost, recurring_template_id,
        xp_reward, suggested_price
      ) values (
        coalesce(auth.uid(), r.owner_id),
        r.company_id,
        v_job_number,
        r.title,
        r.customer_id,
        r.default_assignee,
        v_run_date,
        coalesce(r.default_time, '08:00'::time),
        'Geplant',
        coalesce(nullif(r.default_priority, ''), 'Normal'),
        nullif(v_address, ''),
        concat_ws(E'\n\n',
          'Wiederkehrend · ' || v_cadence_label || ' · Vorlage ' || left(r.id::text, 8),
          nullif(r.description, ''),
          nullif(r.notes, ''),
          case when v_price > 0 then 'Pauschale: ' || trim(to_char(v_price, '999999990.99')) || ' €' else null end
        ),
        coalesce(r.estimated_hours, 2),
        0,
        r.id,
        v_xp,
        case when v_price > 0 then v_price else null end
      )
      returning public.jobs.id into v_job_id;

      v_created := v_created + 1;
      v_created_ids := array_append(v_created_ids, v_job_id);

      v_next := public.advance_recurring_next_run(v_run_date, r.cadence, r.interval_days);
      v_run_date := v_next;
    end loop;

    update public.recurring_job_templates t
    set next_run_date = v_run_date,
        updated_at = now()
    where t.id = r.id;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'templates_processed', v_templates,
    'jobs_created', v_created,
    'job_ids', to_jsonb(v_created_ids)
  );
end;
$$;

revoke all on function public.generate_due_recurring_jobs(uuid) from public, anon;
grant execute on function public.generate_due_recurring_jobs(uuid) to authenticated;

comment on function public.generate_due_recurring_jobs(uuid) is
  'V14.5: Create due jobs from recurring templates; copies default_xp → xp_reward and default_price → suggested_price.';

-- ---------------------------------------------------------------------------
-- 4) create_invoice_from_job — use suggested_price as flat service when idle
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice_from_job(p_job uuid)
returns table(id uuid, document_number text, already_existed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs%rowtype;
  v_company public.companies%rowtype;
  v_existing_id uuid;
  v_existing_number text;
  v_year integer;
  v_next integer;
  v_prefix text;
  v_number text;
  v_doc_id uuid;
  v_vat numeric(5,2);
  v_tax_mode text;
  v_tax_note text;
  v_due date;
  v_hours numeric(12,3);
  v_rate numeric(10,2);
  v_pos integer := 0;
  v_mat record;
  v_price numeric(12,2);
  v_qty numeric(12,3);
  v_line numeric(12,2);
  v_has_line boolean := false;
  v_intro text;
  v_suggest numeric(12,2);
  v_small_note text :=
    'Steuerbefreiung für Kleinunternehmer nach § 19 Abs. 1 UStG. Es wird keine Umsatzsteuer berechnet.';
begin
  if p_job is null then
    raise exception 'Auftrag fehlt';
  end if;

  select j.* into v_job from public.jobs j where j.id = p_job;
  if not found then
    raise exception 'Auftrag nicht gefunden';
  end if;

  if not public.has_company_role(v_job.company_id, array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;

  if v_job.customer_id is null then
    raise exception 'Auftrag hat keinen Kunden';
  end if;

  select d.id, d.document_number
    into v_existing_id, v_existing_number
  from public.documents d
  where d.job_id = v_job.id
    and d.doc_type = 'invoice'
    and d.status is distinct from 'Storniert'
  order by d.created_at asc
  limit 1;

  if v_existing_id is not null then
    return query select v_existing_id, v_existing_number, true;
    return;
  end if;

  select c.* into v_company from public.companies c where c.id = v_job.company_id;
  if not found then
    raise exception 'Firma nicht gefunden';
  end if;

  v_tax_mode := coalesce(nullif(trim(v_company.taxation_mode), ''), 'standard');
  if v_tax_mode = 'small_business' then
    v_vat := 0;
    v_tax_note := v_small_note;
  else
    v_vat := coalesce(v_company.default_vat_rate, 19);
    v_tax_note := null;
  end if;

  v_due := current_date + coalesce(v_company.payment_terms_days, 14);
  v_rate := coalesce(v_company.hourly_rate, 0);
  v_year := extract(year from current_date)::integer;
  v_prefix := coalesce(nullif(trim(v_company.invoice_prefix), ''), 'RE');
  v_suggest := coalesce(v_job.suggested_price, 0);

  insert into public.document_sequences(company_id, doc_type, year, last_number)
  values (v_job.company_id, 'invoice', v_year, 1)
  on conflict (company_id, doc_type, year)
  do update set last_number = public.document_sequences.last_number + 1
  returning last_number into v_next;

  v_number := v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 4, '0');
  v_intro := 'Erstellt aus Auftrag ' || coalesce(v_job.job_number, v_job.id::text);

  insert into public.documents(
    company_id, customer_id, job_id, created_by, doc_type, document_number, status,
    issue_date, due_date, title, intro_text, notes, vat_rate,
    taxation_mode, tax_note
  ) values (
    v_job.company_id,
    v_job.customer_id,
    v_job.id,
    auth.uid(),
    'invoice',
    v_number,
    'Entwurf',
    current_date,
    v_due,
    coalesce(nullif(trim(v_job.title), ''), 'Rechnung'),
    v_intro,
    nullif(trim(coalesce(v_job.description, '')), ''),
    v_vat,
    v_tax_mode,
    v_tax_note
  )
  returning public.documents.id into v_doc_id;

  -- Labor from closed time entries
  select coalesce(
    round((sum(extract(epoch from (t.ended_at - t.started_at))) / 3600.0)::numeric, 2),
    0
  )
  into v_hours
  from public.job_time_entries t
  where t.job_id = v_job.id
    and t.ended_at is not null
    and t.started_at is not null
    and t.ended_at > t.started_at;

  if coalesce(v_hours, 0) > 0 and v_rate >= 0 then
    v_pos := v_pos + 1;
    v_line := round(v_hours * v_rate, 2);
    insert into public.document_items(
      document_id, company_id, position, item_type, description,
      quantity, unit, unit_price, line_total
    ) values (
      v_doc_id, v_job.company_id, v_pos, 'service',
      'Arbeitszeit – ' || coalesce(nullif(trim(v_job.title), ''), 'Auftrag'),
      v_hours, 'Std.', v_rate, v_line
    );
    v_has_line := true;
  end if;

  -- Materials
  for v_mat in
    select
      jm.material_name,
      jm.quantity,
      jm.unit,
      jm.unit_price,
      jm.inventory_material_id,
      im.sales_price
    from public.job_materials jm
    left join public.inventory_materials im
      on im.id = jm.inventory_material_id
     and im.company_id = v_job.company_id
    where jm.job_id = v_job.id
    order by jm.created_at asc
  loop
    v_qty := coalesce(v_mat.quantity, 0);
    if v_qty <= 0 then
      continue;
    end if;
    if coalesce(v_mat.sales_price, 0) > 0 then
      v_price := v_mat.sales_price;
    else
      v_price := coalesce(v_mat.unit_price, 0);
    end if;
    v_pos := v_pos + 1;
    v_line := round(v_qty * v_price, 2);
    insert into public.document_items(
      document_id, company_id, position, item_type, description,
      quantity, unit, unit_price, line_total
    ) values (
      v_doc_id, v_job.company_id, v_pos, 'material',
      coalesce(nullif(trim(v_mat.material_name), ''), 'Material'),
      v_qty,
      coalesce(nullif(trim(v_mat.unit), ''), 'Stk.'),
      v_price,
      v_line
    );
    v_has_line := true;
  end loop;

  -- V14.5: Wartungspauschale from template when nothing booked yet
  if not v_has_line and v_suggest > 0 then
    v_pos := 1;
    v_line := round(v_suggest, 2);
    insert into public.document_items(
      document_id, company_id, position, item_type, description,
      quantity, unit, unit_price, line_total
    ) values (
      v_doc_id, v_job.company_id, v_pos, 'service',
      coalesce(nullif(trim(v_job.title), ''), 'Wartung'),
      1, 'Pauschale', v_suggest, v_line
    );
    v_has_line := true;
  end if;

  -- Fallback: estimated hours × rate
  if not v_has_line then
    v_hours := greatest(coalesce(v_job.estimated_hours, 0), 1);
    v_pos := 1;
    v_line := round(v_hours * v_rate, 2);
    insert into public.document_items(
      document_id, company_id, position, item_type, description,
      quantity, unit, unit_price, line_total
    ) values (
      v_doc_id, v_job.company_id, v_pos, 'service',
      coalesce(nullif(trim(v_job.title), ''), 'Leistung'),
      v_hours, 'Std.', v_rate, v_line
    );
  end if;

  update public.documents d
  set
    subtotal = coalesce((select sum(di.line_total) from public.document_items di where di.document_id = v_doc_id), 0),
    vat_amount = round(
      coalesce((select sum(di.line_total) from public.document_items di where di.document_id = v_doc_id), 0)
      * coalesce(v_vat, 0) / 100, 2
    ),
    total_amount = round(
      coalesce((select sum(di.line_total) from public.document_items di where di.document_id = v_doc_id), 0)
      * (1 + coalesce(v_vat, 0) / 100), 2
    ),
    updated_at = now()
  where d.id = v_doc_id;

  insert into public.document_events(company_id, document_id, actor_user_id, event_type, details)
  values (
    v_job.company_id,
    v_doc_id,
    auth.uid(),
    'created',
    jsonb_build_object(
      'doc_type', 'invoice',
      'source', 'create_invoice_from_job',
      'job_id', v_job.id,
      'job_number', v_job.job_number,
      'suggested_price', v_suggest
    )
  );

  return query select v_doc_id, v_number, false;
end;
$$;

comment on function public.create_invoice_from_job(uuid) is
  'V14.5: Draft invoice from job; uses suggested_price as flat Wartung line when no time/material.';

grant execute on function public.create_invoice_from_job(uuid) to authenticated;

notify pgrst, 'reload schema';
