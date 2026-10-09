-- WORKLEVEL V12.2.1 HOTFIX
-- Fixes: record "new" has no field "supplier_id" on databases upgraded from an older V12 schema.
-- Safe/additive: no tables or business data are deleted.

-- V12.2.1 schema reconciliation for databases that already had older V12 tables.
-- CREATE TABLE IF NOT EXISTS does not add new columns to an existing table, so ensure
-- every column used by the current app/triggers exists before creating the triggers.
alter table public.suppliers add column if not exists contact_name text;
alter table public.suppliers add column if not exists street text;
alter table public.suppliers add column if not exists postal_code text;
alter table public.suppliers add column if not exists city text;
alter table public.suppliers add column if not exists phone text;
alter table public.suppliers add column if not exists email text;
alter table public.suppliers add column if not exists payment_terms_days integer not null default 14;
alter table public.suppliers add column if not exists notes text;
alter table public.suppliers add column if not exists active boolean not null default true;
alter table public.suppliers add column if not exists updated_at timestamptz not null default now();

alter table public.inventory_materials add column if not exists sku text;
alter table public.inventory_materials add column if not exists unit text not null default 'Stk.';
alter table public.inventory_materials add column if not exists purchase_price numeric(12,2) not null default 0;
alter table public.inventory_materials add column if not exists sales_price numeric(12,2) not null default 0;
alter table public.inventory_materials add column if not exists stock numeric(14,3) not null default 0;
alter table public.inventory_materials add column if not exists min_stock numeric(14,3) not null default 0;
alter table public.inventory_materials add column if not exists supplier_id uuid;
alter table public.inventory_materials add column if not exists active boolean not null default true;
alter table public.inventory_materials add column if not exists updated_at timestamptz not null default now();

alter table public.purchase_orders add column if not exists supplier_id uuid;
alter table public.purchase_orders add column if not exists order_date date not null default current_date;
alter table public.purchase_orders add column if not exists expected_date date;
alter table public.purchase_orders add column if not exists status text not null default 'Entwurf';
alter table public.purchase_orders add column if not exists shipping_cost numeric(12,2) not null default 0;
alter table public.purchase_orders add column if not exists notes text;
alter table public.purchase_orders add column if not exists created_by uuid;
alter table public.purchase_orders add column if not exists updated_at timestamptz not null default now();

alter table public.purchase_order_items add column if not exists material_id uuid;
alter table public.purchase_order_items add column if not exists description text;
alter table public.purchase_order_items add column if not exists unit text not null default 'Stk.';
alter table public.purchase_order_items add column if not exists quantity numeric(14,3) not null default 1;
alter table public.purchase_order_items add column if not exists received_quantity numeric(14,3) not null default 0;
alter table public.purchase_order_items add column if not exists unit_price numeric(12,2) not null default 0;

alter table public.inventory_movements add column if not exists movement_type text;
alter table public.inventory_movements add column if not exists quantity numeric(14,3);
alter table public.inventory_movements add column if not exists purchase_order_id uuid;
alter table public.inventory_movements add column if not exists job_id uuid;
alter table public.inventory_movements add column if not exists note text;
alter table public.inventory_movements add column if not exists actor_user_id uuid;


-- 1) Enforce same-company links inside procurement/inventory.
-- Dedicated trigger functions are used instead of one generic NEW record function.
-- This avoids field-resolution problems on installations upgraded from older schemas.
create or replace function public.guard_inventory_material_company()
returns trigger language plpgsql set search_path=public as $$
declare v_company uuid;
begin
  if new.supplier_id is not null then
    select company_id into v_company from public.suppliers where id=new.supplier_id;
    if v_company is null or v_company is distinct from new.company_id then raise exception 'Lieferant gehört nicht zu dieser Firma'; end if;
  end if;
  return new;
end $$;

create or replace function public.guard_purchase_order_company()
returns trigger language plpgsql set search_path=public as $$
declare v_company uuid;
begin
  if new.supplier_id is not null then
    select company_id into v_company from public.suppliers where id=new.supplier_id;
    if v_company is null or v_company is distinct from new.company_id then raise exception 'Lieferant gehört nicht zu dieser Firma'; end if;
  end if;
  return new;
end $$;

create or replace function public.guard_purchase_order_item_company()
returns trigger language plpgsql set search_path=public as $$
declare v_company uuid;
begin
  select company_id into v_company from public.purchase_orders where id=new.purchase_order_id;
  if v_company is null or v_company is distinct from new.company_id then raise exception 'Bestellung gehört nicht zu dieser Firma'; end if;
  if new.material_id is not null then
    select company_id into v_company from public.inventory_materials where id=new.material_id;
    if v_company is null or v_company is distinct from new.company_id then raise exception 'Material gehört nicht zu dieser Firma'; end if;
  end if;
  return new;
end $$;

create or replace function public.guard_inventory_movement_company()
returns trigger language plpgsql set search_path=public as $$
declare v_company uuid;
begin
  select company_id into v_company from public.inventory_materials where id=new.material_id;
  if v_company is null or v_company is distinct from new.company_id then raise exception 'Lagerbewegung/Material gehören nicht zur gleichen Firma'; end if;
  if new.purchase_order_id is not null then
    select company_id into v_company from public.purchase_orders where id=new.purchase_order_id;
    if v_company is null or v_company is distinct from new.company_id then raise exception 'Lagerbewegung/Bestellung gehören nicht zur gleichen Firma'; end if;
  end if;
  if new.job_id is not null then
    select company_id into v_company from public.jobs where id=new.job_id;
    if v_company is null or v_company is distinct from new.company_id then raise exception 'Lagerbewegung/Auftrag gehören nicht zur gleichen Firma'; end if;
  end if;
  return new;
end $$;

drop trigger if exists inventory_materials_company_guard on public.inventory_materials;
create trigger inventory_materials_company_guard before insert or update on public.inventory_materials
for each row execute function public.guard_inventory_material_company();
drop trigger if exists purchase_orders_company_guard on public.purchase_orders;
create trigger purchase_orders_company_guard before insert or update on public.purchase_orders
for each row execute function public.guard_purchase_order_company();
drop trigger if exists purchase_order_items_company_guard on public.purchase_order_items;
create trigger purchase_order_items_company_guard before insert or update on public.purchase_order_items
for each row execute function public.guard_purchase_order_item_company();
drop trigger if exists inventory_movements_company_guard on public.inventory_movements;
create trigger inventory_movements_company_guard before insert or update on public.inventory_movements
for each row execute function public.guard_inventory_movement_company();

