begin;
create table public.job_travel_entries (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 job_id uuid not null references public.jobs(id),
 employee_id uuid not null references public.employees(id),
 owner_id uuid not null references auth.users(id),
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 check (ended_at is null or ended_at >= started_at)
);
create unique index job_travel_one_running_employee on public.job_travel_entries(employee_id) where ended_at is null;
create index job_travel_company_employee on public.job_travel_entries(company_id,employee_id,started_at);
alter table public.job_travel_entries enable row level security;
create policy travel_read on public.job_travel_entries for select to authenticated using (
 public.has_company_role(company_id,array['owner','admin']) or public.is_assigned_worker(job_id)
);
revoke all on public.job_travel_entries from anon, authenticated;
grant select on public.job_travel_entries to authenticated;

-- One transaction closes travel and starts work. Existing work records are unchanged.
create function public.transition_job_timer(p_job uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.jobs%rowtype; t timestamptz := now();
begin
 if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
 select * into j from public.jobs where id=p_job for update;
 if not found or not (public.has_company_role(j.company_id,array['owner','admin']) or public.is_assigned_worker(p_job)) then
   raise exception 'Keine Berechtigung';
 end if;
 if j.employee_id is null then raise exception 'Bitte zuerst einen Mitarbeiter zuweisen'; end if;
 perform pg_advisory_xact_lock(hashtextextended(j.employee_id::text,0));
 if j.status in ('Erledigt','Storniert') then raise exception 'Auftrag ist bereits abgeschlossen'; end if;
 if p_action='travel' then
   if exists(select 1 from public.job_time_entries where employee_id=j.employee_id and ended_at is null) then
     raise exception 'Bitte die laufende Arbeitszeit zuerst pausieren';
   end if;
   if exists(select 1 from public.job_travel_entries where employee_id=j.employee_id and ended_at is null and job_id<>p_job) then
     raise exception 'Es läuft bereits eine Fahrt zu einem anderen Auftrag';
   end if;
   insert into public.job_travel_entries(company_id,job_id,employee_id,owner_id,started_at)
    values(j.company_id,j.id,j.employee_id,auth.uid(),t)
    on conflict (employee_id) where ended_at is null do nothing;
 elsif p_action='work' then
   if exists(select 1 from public.job_time_entries where employee_id=j.employee_id and ended_at is null and job_id<>p_job)
      or exists(select 1 from public.job_travel_entries where employee_id=j.employee_id and ended_at is null and job_id<>p_job) then
     raise exception 'Es läuft bereits eine Zeit für einen anderen Auftrag';
   end if;
   update public.job_travel_entries set ended_at=t where job_id=p_job and employee_id=j.employee_id and ended_at is null;
   if not exists(select 1 from public.job_time_entries where employee_id=j.employee_id and ended_at is null) then
     insert into public.job_time_entries(owner_id,company_id,job_id,employee_id,started_at)
       values(auth.uid(),j.company_id,j.id,j.employee_id,t);
   end if;
   update public.jobs set status='In Arbeit',updated_at=t where id=p_job;
 else raise exception 'Ungültige Aktion';
 end if;
end;
$$;
revoke all on function public.transition_job_timer(uuid,text) from public,anon;
grant execute on function public.transition_job_timer(uuid,text) to authenticated;
commit;
