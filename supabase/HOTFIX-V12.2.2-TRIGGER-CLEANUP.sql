-- WORKLEVEL V12.2.2 STABILITY HOTFIX
-- Purpose: remove any leftover generic procurement trigger that can raise
-- "record NEW has no field supplier_id" and recreate only table-specific guards.
-- Safe/additive for existing WORKLEVEL data. No business rows are deleted.

begin;

-- Ensure every column used by the current procurement code exists first.
alter table public.inventory_materials add column if not exists supplier_id uuid;
alter table public.purchase_orders add column if not exists supplier_id uuid;
alter table public.purchase_order_items add column if not exists material_id uuid;
alter table public.inventory_movements add column if not exists purchase_order_id uuid;
alter table public.inventory_movements add column if not exists job_id uuid;

-- Remove ALL triggers still attached to the obsolete generic trigger function,
-- even if an older build created them under an unexpected trigger name.
do $$
declare r record;
begin
  for r in
    select n.nspname as schema_name,
           c.relname as table_name,
           t.tgname as trigger_name
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace pn on pn.oid=p.pronamespace
    where not t.tgisinternal
      and pn.nspname='public'
      and p.proname='enforce_procurement_company_links'
  loop
    execute format('drop trigger if exists %I on %I.%I', r.trigger_name, r.schema_name, r.table_name);
  end loop;
end $$;

-- The old generic function is no longer used.
drop function if exists public.enforce_procurement_company_links() cascade;

-- Recreate dedicated functions. Each one references only columns that exist
-- on its own table, so NEW can never be asked for another table's field.
create or replace function public.guard_inventory_material_company()
returns trigger language plpgsql set search_path=public as $$
declare v_company uuid;
begin
  if new.supplier_id is not null then
    select company_id into v_company from public.suppliers where id=new.supplier_id;
    if v_company is null or v_company is distinct from new.company_id then
      raise exception 'Lieferant gehört nicht zu dieser Firma';
    end if;
  end if;
  return new;
end $$;

create or replace function public.guard_purchase_order_company()
returns trigger language plpgsql set search_path=public as $$
declare v_company uuid;
begin
  if new.supplier_id is not null then
    select company_id into v_company from public.suppliers where id=new.supplier_id;
    if v_company is null or v_company is distinct from new.company_id then
      raise exception 'Lieferant gehört nicht zu dieser Firma';
    end if;
  end if;
  return new;
end $$;

create or replace function public.guard_purchase_order_item_company()
returns trigger language plpgsql set search_path=public as $$
declare v_company uuid;
begin
  select company_id into v_company from public.purchase_orders where id=new.purchase_order_id;
  if v_company is null or v_company is distinct from new.company_id then
    raise exception 'Bestellung gehört nicht zu dieser Firma';
  end if;
  if new.material_id is not null then
    select company_id into v_company from public.inventory_materials where id=new.material_id;
    if v_company is null or v_company is distinct from new.company_id then
      raise exception 'Material gehört nicht zu dieser Firma';
    end if;
  end if;
  return new;
end $$;

create or replace function public.guard_inventory_movement_company()
returns trigger language plpgsql set search_path=public as $$
declare v_company uuid;
begin
  select company_id into v_company from public.inventory_materials where id=new.material_id;
  if v_company is null or v_company is distinct from new.company_id then
    raise exception 'Lagerbewegung/Material gehören nicht zur gleichen Firma';
  end if;
  if new.purchase_order_id is not null then
    select company_id into v_company from public.purchase_orders where id=new.purchase_order_id;
    if v_company is null or v_company is distinct from new.company_id then
      raise exception 'Lagerbewegung/Bestellung gehören nicht zur gleichen Firma';
    end if;
  end if;
  if new.job_id is not null then
    select company_id into v_company from public.jobs where id=new.job_id;
    if v_company is null or v_company is distinct from new.company_id then
      raise exception 'Lagerbewegung/Auftrag gehören nicht zur gleichen Firma';
    end if;
  end if;
  return new;
end $$;

-- Remove both expected and potential leftover guard names on the four tables,
-- then install one known-good trigger per table.
drop trigger if exists inventory_materials_company_guard on public.inventory_materials;
drop trigger if exists purchase_orders_company_guard on public.purchase_orders;
drop trigger if exists purchase_order_items_company_guard on public.purchase_order_items;
drop trigger if exists inventory_movements_company_guard on public.inventory_movements;

create trigger inventory_materials_company_guard
before insert or update on public.inventory_materials
for each row execute function public.guard_inventory_material_company();

create trigger purchase_orders_company_guard
before insert or update on public.purchase_orders
for each row execute function public.guard_purchase_order_company();

create trigger purchase_order_items_company_guard
before insert or update on public.purchase_order_items
for each row execute function public.guard_purchase_order_item_company();

create trigger inventory_movements_company_guard
before insert or update on public.inventory_movements
for each row execute function public.guard_inventory_movement_company();

-- Verification: fail the migration immediately if the obsolete function is still
-- attached to any non-internal trigger.
do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace n on n.oid=p.pronamespace
    where not t.tgisinternal
      and n.nspname='public'
      and p.proname='enforce_procurement_company_links'
  ) then
    raise exception 'V12.2.2 verification failed: obsolete procurement trigger is still attached';
  end if;
end $$;

commit;

-- Optional verification result shown by Supabase after the script succeeds.
select c.relname as table_name, t.tgname as trigger_name, p.proname as function_name
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace cn on cn.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal
  and cn.nspname='public'
  and c.relname in ('inventory_materials','purchase_orders','purchase_order_items','inventory_movements')
  and t.tgname like '%company_guard'
order by c.relname, t.tgname;
