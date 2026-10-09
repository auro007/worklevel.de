-- WORKLEVEL V14.1 — Material catalog (Gewerk, Schlagwörter, Bild, Händler)
-- Additive only. Safe to re-run. Project: xvaxlafehhetydvgldfw
-- Prerequisite: inventory_materials + suppliers (V12) + is_company_member / has_company_role

-- 1) Catalog columns on inventory_materials
alter table public.inventory_materials
  add column if not exists trade_category text not null default 'Sonstiges';

alter table public.inventory_materials
  add column if not exists keywords text[] not null default '{}'::text[];

alter table public.inventory_materials
  add column if not exists image_path text;

comment on column public.inventory_materials.trade_category is 'Gewerk: Heizung|Sanitär|Lüftung|Klima|Sonstiges';
comment on column public.inventory_materials.keywords is 'Schlagwörter / Suchbegriffe';
comment on column public.inventory_materials.image_path is 'Storage path in bucket material-files';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_materials_trade_category_check'
  ) then
    alter table public.inventory_materials
      add constraint inventory_materials_trade_category_check
      check (trade_category in ('Heizung','Sanitär','Lüftung','Klima','Sonstiges'));
  end if;
end $$;

-- Normalize any unexpected legacy values (none expected)
update public.inventory_materials
set trade_category = 'Sonstiges'
where trade_category is null
   or trade_category not in ('Heizung','Sanitär','Lüftung','Klima','Sonstiges');

create index if not exists inventory_materials_trade_idx
  on public.inventory_materials(company_id, trade_category);

create index if not exists inventory_materials_supplier_idx
  on public.inventory_materials(company_id, supplier_id);

create index if not exists inventory_materials_keywords_gin
  on public.inventory_materials using gin (keywords);

-- 2) Private storage bucket for material images
insert into storage.buckets (id, name, public)
values ('material-files', 'material-files', false)
on conflict (id) do nothing;

-- Path convention: {company_id}/materials/{material_id}/{filename}
drop policy if exists material_files_select on storage.objects;
drop policy if exists material_files_insert on storage.objects;
drop policy if exists material_files_update on storage.objects;
drop policy if exists material_files_delete on storage.objects;

create policy material_files_select on storage.objects
for select to authenticated
using (
  bucket_id = 'material-files'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::text[]
  )
);

create policy material_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'material-files'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::text[]
  )
);

create policy material_files_update on storage.objects
for update to authenticated
using (
  bucket_id = 'material-files'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::text[]
  )
)
with check (
  bucket_id = 'material-files'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::text[]
  )
);

create policy material_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'material-files'
  and public.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','admin']::text[]
  )
);
