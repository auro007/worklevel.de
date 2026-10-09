-- WORKLEVEL V14.2 — Mitarbeiter-Profil (Stunden, Urlaub, XP, Geld, Krankheitstage)
-- Additive only. Safe to re-run. Project: xvaxlafehhetydvgldfw
-- Prerequisite: employees (V4/V6), job_time_entries, has_company_role / is_company_member

-- 1) Profile balance / rate fields on employees (xp already exists)
alter table public.employees
  add column if not exists hourly_rate numeric(10,2);

alter table public.employees
  add column if not exists vacation_days_total integer not null default 30;

alter table public.employees
  add column if not exists sick_days_year integer not null default 0;

comment on column public.employees.hourly_rate is 'Optionaler Stundensatz; NULL = Firmen-Verrechnungssatz';
comment on column public.employees.vacation_days_total is 'Jahresanspruch Urlaubstage';
comment on column public.employees.sick_days_year is 'Krankheitstage-Kontingent / Hinweiswert (Jahr); Verbrauch kommt aus employee_absences';
comment on column public.employees.xp is 'Erfahrungspunkte (manuell oder aus erledigten Aufträgen)';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_vacation_days_total_check'
  ) then
    alter table public.employees
      add constraint employees_vacation_days_total_check
      check (vacation_days_total >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'employees_sick_days_year_check'
  ) then
    alter table public.employees
      add constraint employees_sick_days_year_check
      check (sick_days_year >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'employees_hourly_rate_check'
  ) then
    alter table public.employees
      add constraint employees_hourly_rate_check
      check (hourly_rate is null or hourly_rate >= 0);
  end if;
end $$;

-- 2) Absence log (Urlaub / Krankheit)
create table if not exists public.employee_absences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  absence_type text not null,
  start_date date not null,
  end_date date not null,
  days numeric(6,1) not null default 1,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint employee_absences_type_check check (absence_type in ('urlaub', 'krankheit')),
  constraint employee_absences_dates_check check (end_date >= start_date),
  constraint employee_absences_days_check check (days > 0)
);

create index if not exists employee_absences_company_emp_idx
  on public.employee_absences(company_id, employee_id, start_date desc);

create index if not exists employee_absences_type_idx
  on public.employee_absences(company_id, absence_type, start_date desc);

comment on table public.employee_absences is 'Einfaches Urlaub-/Krankheits-Log für Mitarbeiter-Profil';

-- Keep days in sync when missing (inclusive calendar days)
create or replace function public.employee_absences_set_days()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.days is null or new.days <= 0 then
    new.days := (new.end_date - new.start_date) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists employee_absences_set_days_trg on public.employee_absences;
create trigger employee_absences_set_days_trg
  before insert or update of start_date, end_date, days
  on public.employee_absences
  for each row execute function public.employee_absences_set_days();

alter table public.employee_absences enable row level security;

drop policy if exists employee_absences_select on public.employee_absences;
drop policy if exists employee_absences_manage on public.employee_absences;
drop policy if exists employee_absences_worker_select on public.employee_absences;

-- Owner/admin: full access within company
create policy employee_absences_manage on public.employee_absences
  for all to authenticated
  using (public.has_company_role(company_id, array['owner','admin']))
  with check (public.has_company_role(company_id, array['owner','admin']));

-- Worker: read own absences (via linked employees.auth_user_id)
create policy employee_absences_worker_select on public.employee_absences
  for select to authenticated
  using (
    exists (
      select 1 from public.employees e
      where e.id = employee_id
        and e.company_id = employee_absences.company_id
        and e.auth_user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.employee_absences to authenticated;
