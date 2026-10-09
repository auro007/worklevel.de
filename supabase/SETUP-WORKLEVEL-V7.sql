-- WORKLEVEL V7 - STRICT ROLES + WORKER-SAFE OPERATIONS
-- Run this ONCE in Supabase > SQL Editor after WORKLEVEL V6 is working.
-- Keeps all existing companies, members, customers, employees, jobs and technician data.

create extension if not exists pgcrypto;

-- 1) Invitation generator: compatible with Supabase projects where gen_random_bytes is unavailable.
create or replace function public.create_company_invite(
  p_company uuid,
  p_email text,
  p_role text default 'worker'
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text := lower(trim(p_role));
  v_email text := lower(trim(p_email));
  v_code text;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Ungültige E-Mail-Adresse';
  end if;
  if v_role not in ('owner','admin','worker') then
    raise exception 'Ungültige Rolle';
  end if;
  if not public.has_company_role(p_company,array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;
  if v_role='owner' and not public.has_company_role(p_company,array['owner']) then
    raise exception 'Nur der Chef kann einen weiteren Inhaber einladen';
  end if;
  if exists(
    select 1
    from public.company_members m
    join auth.users u on u.id=m.user_id
    where m.company_id=p_company
      and lower(u.email)=v_email
      and m.status='active'
  ) then
    raise exception 'Dieses Konto gehört bereits zur Firma';
  end if;

  delete from public.company_invites
  where company_id=p_company and lower(email)=v_email and accepted_at is null;

  loop
    v_code := 'WL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    exit when not exists(select 1 from public.company_invites where code=v_code);
  end loop;

  insert into public.company_invites(company_id,email,role,code,created_by)
  values(p_company,v_email,v_role,v_code,auth.uid());
  return v_code;
end;
$$;
grant execute on function public.create_company_invite(uuid,text,text) to authenticated;

-- 2) Only the owner may change an existing member's role/status.
create or replace function public.owner_update_company_member(
  p_company uuid,
  p_user uuid,
  p_role text,
  p_status text default 'active'
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text := lower(trim(p_role));
  v_status text := lower(trim(p_status));
  v_current_role text;
begin
  if not public.has_company_role(p_company,array['owner']) then
    raise exception 'Nur der Chef darf Rollen und Zugänge ändern';
  end if;
  if v_role not in ('owner','admin','worker') then raise exception 'Ungültige Rolle'; end if;
  if v_status not in ('active','disabled') then raise exception 'Ungültiger Status'; end if;

  select role into v_current_role
  from public.company_members
  where company_id=p_company and user_id=p_user;
  if not found then raise exception 'Mitglied nicht gefunden'; end if;

  if p_user=auth.uid() and v_status='disabled' then
    raise exception 'Du kannst deinen eigenen Zugang nicht deaktivieren';
  end if;

  if v_current_role='owner' and v_role<>'owner' then
    if (select count(*) from public.company_members where company_id=p_company and role='owner' and status='active') <= 1 then
      raise exception 'Die Firma muss mindestens einen aktiven Chef behalten';
    end if;
  end if;

  update public.company_members
  set role=v_role,status=v_status
  where company_id=p_company and user_id=p_user;
end;
$$;
grant execute on function public.owner_update_company_member(uuid,uuid,text,text) to authenticated;

-- 3) Worker material entry: technician can record quantity/unit but cannot set purchase/sales prices.
create or replace function public.worker_add_job_material(
  p_job uuid,
  p_name text,
  p_quantity numeric,
  p_unit text default 'Stk.'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_company uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.is_assigned_worker(p_job) then raise exception 'Dieser Auftrag ist dir nicht zugewiesen'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Materialname fehlt'; end if;
  if coalesce(p_quantity,0) <= 0 then raise exception 'Menge muss größer als 0 sein'; end if;

  select company_id into v_company from public.jobs where id=p_job;
  insert into public.job_materials(owner_id,company_id,job_id,material_name,quantity,unit,unit_price)
  values(v_user,v_company,p_job,trim(p_name),p_quantity,coalesce(nullif(trim(p_unit),''),'Stk.'),0)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.worker_add_job_material(uuid,text,numeric,text) to authenticated;

-- 4) Tighten job_materials. Office/owner have full access; worker may read assigned-job materials.
-- Worker writes go through worker_add_job_material(), not direct table inserts.
drop policy if exists job_materials_company_access on public.job_materials;
drop policy if exists job_materials_company_select on public.job_materials;
drop policy if exists job_materials_company_manage on public.job_materials;
create policy job_materials_company_select
on public.job_materials for select to authenticated
using (
  public.has_company_role(company_id,array['owner','admin'])
  or public.is_assigned_worker(job_id)
);
create policy job_materials_company_manage
on public.job_materials for all to authenticated
using (public.has_company_role(company_id,array['owner','admin']))
with check (public.has_company_role(company_id,array['owner','admin']));

-- 5) Other technician records stay available to office/admin and the assigned worker.
-- Recreate explicitly to make the intended V7 permission model clear.
do $$
declare t text;
begin
  foreach t in array array['job_time_entries','job_notes','job_photos','job_signatures'] loop
    execute format('drop policy if exists %I on public.%I', t||'_company_access', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_company_role(company_id,array[''owner'',''admin'']) or public.is_assigned_worker(job_id)) with check (public.has_company_role(company_id,array[''owner'',''admin'']) or public.is_assigned_worker(job_id))',
      t||'_company_access', t
    );
  end loop;
end $$;

-- 6) Explicitly keep company master data out of worker hands.
drop policy if exists companies_admin_update on public.companies;
create policy companies_admin_update
on public.companies for update to authenticated
using (public.has_company_role(id,array['owner','admin']))
with check (public.has_company_role(id,array['owner','admin']));

-- Existing RLS from V6 continues to enforce:
-- owner/admin: customers, employees, all jobs
-- worker: own employee record, assigned jobs, only customers linked to assigned jobs
-- worker: job status changes only through set_assigned_job_status()
