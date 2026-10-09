-- =============================================================================
-- WORKLEVEL V12.7 — Recurring service jobs (Reinigung / Hausmeister)
-- =============================================================================
-- Run AFTER SETUP-WORKLEVEL-V12.6-REMINDERS.sql (and V12.4 / V12.5).
-- Additive + idempotent. RLS: owner/admin only via has_company_role.
-- Safe to re-run.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Templates
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_job_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  customer_id bigint not null references public.customers(id) on delete cascade,
  title text not null,
  description text,
  cadence text not null default 'monthly'
    check (cadence in ('weekly','biweekly','monthly')),
  interval_days integer
    check (interval_days is null or interval_days > 0),
  next_run_date date not null default current_date,
  active boolean not null default true,
  default_assignee uuid references public.employees(id) on delete set null,
  default_time time without time zone not null default '08:00',
  default_priority text not null default 'Normal'
    check (default_priority in ('Normal','Hoch','Notfall')),
  estimated_hours numeric(8,2) not null default 2,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recurring_job_templates add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.recurring_job_templates add column if not exists description text;
alter table public.recurring_job_templates add column if not exists cadence text;
alter table public.recurring_job_templates add column if not exists interval_days integer;
alter table public.recurring_job_templates add column if not exists next_run_date date;
alter table public.recurring_job_templates add column if not exists active boolean;
alter table public.recurring_job_templates add column if not exists default_assignee uuid;
alter table public.recurring_job_templates add column if not exists default_time time without time zone;
alter table public.recurring_job_templates add column if not exists default_priority text;
alter table public.recurring_job_templates add column if not exists estimated_hours numeric(8,2);
alter table public.recurring_job_templates add column if not exists notes text;
alter table public.recurring_job_templates add column if not exists updated_at timestamptz;

create index if not exists recurring_job_templates_company_idx
  on public.recurring_job_templates(company_id, active, next_run_date);
create index if not exists recurring_job_templates_due_idx
  on public.recurring_job_templates(company_id, next_run_date)
  where active = true;

alter table public.recurring_job_templates enable row level security;

drop policy if exists recurring_job_templates_office on public.recurring_job_templates;
create policy recurring_job_templates_office on public.recurring_job_templates
  for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin']))
  with check (public.has_company_role(company_id, array['owner','admin']));

grant select, insert, update, delete on public.recurring_job_templates to authenticated;

alter table public.jobs add column if not exists recurring_template_id uuid
  references public.recurring_job_templates(id) on delete set null;
create index if not exists jobs_recurring_template_idx
  on public.jobs(recurring_template_id)
  where recurring_template_id is not null;

create or replace function public.touch_recurring_job_templates_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists recurring_job_templates_touch_updated_at on public.recurring_job_templates;
create trigger recurring_job_templates_touch_updated_at
  before update on public.recurring_job_templates
  for each row execute function public.touch_recurring_job_templates_updated_at();

revoke all on function public.touch_recurring_job_templates_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Advance helper
-- ---------------------------------------------------------------------------
create or replace function public.advance_recurring_next_run(
  p_from date,
  p_cadence text,
  p_interval_days integer default null
)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_next date;
begin
  if p_interval_days is not null and p_interval_days > 0 then
    v_next := (p_from + make_interval(days => p_interval_days))::date;
  else
    case coalesce(p_cadence, 'monthly')
      when 'weekly' then v_next := (p_from + interval '7 days')::date;
      when 'biweekly' then v_next := (p_from + interval '14 days')::date;
      else v_next := (p_from + interval '1 month')::date;
    end case;
  end if;
  if v_next <= p_from then
    v_next := (p_from + interval '1 day')::date;
  end if;
  return v_next;
end;
$$;

revoke all on function public.advance_recurring_next_run(date, text, integer) from public, anon;
grant execute on function public.advance_recurring_next_run(date, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Optional RPC: create_recurring_template
-- ---------------------------------------------------------------------------
create or replace function public.create_recurring_template(
  p_company_id uuid,
  p_customer_id bigint,
  p_title text,
  p_description text default null,
  p_cadence text default 'monthly',
  p_interval_days integer default null,
  p_next_run_date date default current_date,
  p_default_assignee uuid default null,
  p_notes text default null,
  p_default_time time default '08:00',
  p_estimated_hours numeric default 2,
  p_default_priority text default 'Normal'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cadence text;
  v_priority text;
  v_customer_company uuid;
begin
  if p_company_id is null or not public.has_company_role(p_company_id, array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;

  v_cadence := coalesce(nullif(trim(p_cadence), ''), 'monthly');
  if v_cadence not in ('weekly','biweekly','monthly') then
    raise exception 'Ungültiger Rhythmus (weekly/biweekly/monthly)';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Titel erforderlich';
  end if;

  v_priority := coalesce(nullif(trim(p_default_priority), ''), 'Normal');
  if v_priority not in ('Normal','Hoch','Notfall') then
    v_priority := 'Normal';
  end if;

  select c.company_id into v_customer_company
  from public.customers c
  where c.id = p_customer_id;

  if v_customer_company is null or v_customer_company <> p_company_id then
    raise exception 'Kunde gehört nicht zu dieser Firma';
  end if;

  if p_default_assignee is not null and not exists (
    select 1 from public.employees e
    where e.id = p_default_assignee and e.company_id = p_company_id
  ) then
    raise exception 'Mitarbeiter gehört nicht zu dieser Firma';
  end if;

  insert into public.recurring_job_templates(
    company_id, owner_id, customer_id, title, description,
    cadence, interval_days, next_run_date, active,
    default_assignee, default_time, default_priority, estimated_hours, notes
  ) values (
    p_company_id, auth.uid(), p_customer_id, trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    v_cadence,
    case when p_interval_days is not null and p_interval_days > 0 then p_interval_days else null end,
    coalesce(p_next_run_date, current_date),
    true,
    p_default_assignee,
    coalesce(p_default_time, '08:00'::time),
    v_priority,
    coalesce(p_estimated_hours, 2),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_recurring_template(uuid, bigint, text, text, text, integer, date, uuid, text, time, numeric, text) from public, anon;
grant execute on function public.create_recurring_template(uuid, bigint, text, text, text, integer, date, uuid, text, time, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPC: generate_due_recurring_jobs — owner/admin
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
        estimated_hours, material_cost, recurring_template_id
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
          nullif(r.notes, '')
        ),
        coalesce(r.estimated_hours, 2),
        0,
        r.id
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

notify pgrst, 'reload schema';
