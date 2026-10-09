-- WORKLEVEL V14.4 — One-tap draft invoice from finished job
-- Additive. Prerequisite: documents/document_items (V8), job_materials/job_time_entries (V5/V6),
-- create_business_document / recalculate_document, has_company_role, companies.hourly_rate.
-- Safe to re-run.

-- Fast lookup: existing invoice for a job
create index if not exists documents_job_invoice_idx
  on public.documents(job_id, doc_type)
  where job_id is not null and doc_type = 'invoice';

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

  -- Idempotent: open existing non-cancelled invoice for this job
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

  -- Materials: prefer inventory sales_price when linked and > 0, else job unit_price
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

  -- Fallback: estimated hours × rate when nothing booked
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

  -- Totals (inline so we do not depend on auth context quirks inside nested RPC)
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
      'job_number', v_job.job_number
    )
  );

  return query select v_doc_id, v_number, false;
end;
$$;

comment on function public.create_invoice_from_job(uuid) is
  'V14.4: Draft invoice from job materials + booked hours; idempotent per job.';

grant execute on function public.create_invoice_from_job(uuid) to authenticated;
