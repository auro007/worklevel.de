-- WORKLEVEL V14.0 — Field workflow: checklist + photo category
-- Additive only. Safe to re-run. Project: xvaxlafehhetydvgldfw
-- Prerequisite: V5/V6 job_time_entries + job_photos (already used by /techniker)

-- 1) Checklist on jobs (jsonb array of {id,label,done})
alter table public.jobs
  add column if not exists checklist jsonb not null default '[]'::jsonb;

comment on column public.jobs.checklist is 'Field checklist items: [{id,label,done}, ...]';

-- 2) Photo category (vorher / nachher / sonst) — caption stays free text
alter table public.job_photos
  add column if not exists category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'job_photos_category_check'
  ) then
    alter table public.job_photos
      add constraint job_photos_category_check
      check (category is null or category in ('vorher','nachher','sonst'));
  end if;
end $$;

create index if not exists job_photos_job_category_idx
  on public.job_photos(job_id, category);

-- 3) Worker may update checklist on assigned jobs (status still via set_assigned_job_status)
create or replace function public.set_assigned_job_checklist(p_job uuid, p_checklist jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_checklist is null or jsonb_typeof(p_checklist) <> 'array' then
    raise exception 'Checkliste muss ein JSON-Array sein';
  end if;
  if not public.is_assigned_worker(p_job) then
    raise exception 'Dieser Auftrag ist dir nicht zugewiesen';
  end if;
  update public.jobs
    set checklist = p_checklist,
        updated_at = now()
  where id = p_job;
end;
$$;

revoke all on function public.set_assigned_job_checklist(uuid, jsonb) from public;
revoke all on function public.set_assigned_job_checklist(uuid, jsonb) from anon;
grant execute on function public.set_assigned_job_checklist(uuid, jsonb) to authenticated;

-- Owners/admins already update jobs via jobs_company_manage; workers use the RPC above.
