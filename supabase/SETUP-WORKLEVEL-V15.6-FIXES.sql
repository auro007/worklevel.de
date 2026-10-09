-- WORKLEVEL V15.6 - tested bug fixes
-- Additive/idempotent. No destructive reset. Historical document/job snapshots are not rewritten.

alter table public.job_planned_materials add column if not exists consumed_at timestamptz;
alter table public.job_planned_materials add column if not exists consumed_job_material_id uuid references public.job_materials(id) on delete set null;

create or replace function public.consume_planned_job_material(p_planned uuid, p_material uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_plan public.job_planned_materials%rowtype;
  v_mat public.inventory_materials%rowtype;
  v_employee uuid;
  v_jm uuid;
begin
  select * into v_plan from public.job_planned_materials where id=p_planned for update;
  if v_plan.id is null then raise exception 'Geplantes Material nicht gefunden'; end if;
  if v_plan.consumed_at is not null then return v_plan.consumed_job_material_id; end if;

  select employee_id into v_employee from public.jobs where id=v_plan.job_id and company_id=v_plan.company_id;
  if not public.has_company_role(v_plan.company_id,array['owner','admin']) then
    if not public.has_company_role(v_plan.company_id,array['worker'])
       or not exists(select 1 from public.employees e where e.id=v_employee and e.auth_user_id=auth.uid())
    then raise exception 'Keine Berechtigung'; end if;
  end if;

  select * into v_mat from public.inventory_materials
  where id=p_material and company_id=v_plan.company_id and active for update;
  if v_mat.id is null then raise exception 'Lagermaterial nicht gefunden'; end if;
  if v_mat.stock < v_plan.quantity then raise exception 'Nicht genügend Lagerbestand'; end if;

  update public.inventory_materials set stock=stock-v_plan.quantity,updated_at=now() where id=v_mat.id;
  insert into public.inventory_movements(company_id,material_id,movement_type,quantity,job_id,note,actor_user_id)
  values(v_plan.company_id,v_mat.id,'job_usage',-v_plan.quantity,v_plan.job_id,'Geplantes Angebotsmaterial verwendet',auth.uid());
  insert into public.job_materials(owner_id,company_id,job_id,inventory_material_id,material_name,quantity,unit,unit_price)
  values(auth.uid(),v_plan.company_id,v_plan.job_id,v_mat.id,v_mat.name,v_plan.quantity,v_mat.unit,v_mat.purchase_price)
  returning id into v_jm;
  update public.job_planned_materials set consumed_at=now(),consumed_job_material_id=v_jm where id=v_plan.id;
  perform public.sync_job_material_cost(v_plan.job_id);
  return v_jm;
end $$;

revoke all on function public.consume_planned_job_material(uuid,uuid) from public, anon;
grant execute on function public.consume_planned_job_material(uuid,uuid) to authenticated;

-- Repair only clearly malformed CURRENT material-master units found during V15.5 testing.
-- Legal/historical document_items and job_materials are deliberately left unchanged.
update public.inventory_materials
set unit='Stk.', updated_at=now()
where unit ~ '^\\s*[0-9]+([.,][0-9]+)?\\s*$'
   or unit ~* '^\\s*stk\\.?[0-9]+([.,][0-9]+)?\\s*$';
