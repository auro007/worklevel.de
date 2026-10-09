-- WORKLEVEL V15.5 - accepted offer -> job planned materials
-- Additive / idempotent. Does NOT touch stock and does NOT create actual job_materials.

create table if not exists public.job_planned_materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  source_document_id uuid references public.documents(id) on delete set null,
  source_document_item_id uuid references public.document_items(id) on delete set null,
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null default 'Stk.',
  quoted_unit_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(job_id, source_document_item_id)
);

create index if not exists job_planned_materials_job_idx on public.job_planned_materials(job_id, created_at);
alter table public.job_planned_materials enable row level security;

drop policy if exists job_planned_materials_select on public.job_planned_materials;
create policy job_planned_materials_select on public.job_planned_materials
for select to authenticated
using (public.has_company_role(company_id,array['owner','admin']) or public.is_assigned_worker(job_id));

drop policy if exists job_planned_materials_manage on public.job_planned_materials;
create policy job_planned_materials_manage on public.job_planned_materials
for all to authenticated
using (public.has_company_role(company_id,array['owner','admin']))
with check (public.has_company_role(company_id,array['owner','admin']));

-- Backfill already converted offers (safe to run repeatedly).
insert into public.job_planned_materials(
  company_id, job_id, source_document_id, source_document_item_id,
  description, quantity, unit, quoted_unit_price
)
select d.company_id, d.converted_job_id, d.id, di.id,
       di.description, di.quantity, di.unit, di.unit_price
from public.documents d
join public.document_items di on di.document_id=d.id and di.company_id=d.company_id
where d.doc_type='offer'
  and d.converted_job_id is not null
  and di.item_type='material'
on conflict (job_id, source_document_item_id) do nothing;

-- Replace conversion function: same behavior as V11 plus planned-material copy.
create or replace function public.create_job_from_offer(p_document uuid)
returns table(id uuid, job_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
  v_customer public.customers%rowtype;
  v_job_id uuid;
  v_job_number text;
  v_year integer;
  v_count integer;
  v_address text;
begin
  select d.* into v_doc from public.documents d where d.id=p_document;
  if not found then raise exception 'Dokument nicht gefunden'; end if;
  if not public.has_company_role(v_doc.company_id,array['owner','admin']) then raise exception 'Keine Berechtigung'; end if;
  if v_doc.doc_type <> 'offer' then raise exception 'Nur Angebote können in Aufträge umgewandelt werden'; end if;
  if v_doc.status <> 'Angenommen' then raise exception 'Nur angenommene Angebote können umgewandelt werden'; end if;

  if v_doc.converted_job_id is not null then
    insert into public.job_planned_materials(company_id,job_id,source_document_id,source_document_item_id,description,quantity,unit,quoted_unit_price)
    select v_doc.company_id,v_doc.converted_job_id,v_doc.id,di.id,di.description,di.quantity,di.unit,di.unit_price
    from public.document_items di
    where di.document_id=v_doc.id and di.company_id=v_doc.company_id and di.item_type='material'
    on conflict (job_id,source_document_item_id) do nothing;
    return query select j.id,j.job_number from public.jobs j where j.id=v_doc.converted_job_id;
    return;
  end if;

  select cust.* into v_customer from public.customers cust
  where cust.id=v_doc.customer_id and cust.company_id=v_doc.company_id;
  if not found then raise exception 'Kunde nicht gefunden'; end if;

  v_year := extract(year from current_date)::integer;
  select count(*)::integer into v_count from public.jobs j
  where j.company_id=v_doc.company_id and extract(year from j.job_date)=v_year;
  v_job_number := 'AU-'||v_year::text||'-'||lpad((v_count+1)::text,4,'0');
  v_address := trim(both from concat_ws(', ',nullif(v_customer.street,''),trim(both from concat_ws(' ',nullif(v_customer.postal_code,''),nullif(v_customer.city,'')))));

  insert into public.jobs(owner_id,company_id,job_number,title,customer_id,job_date,job_time,status,priority,address,description,estimated_hours,material_cost)
  values(auth.uid(),v_doc.company_id,v_job_number,coalesce(nullif(trim(v_doc.title),''),'Auftrag aus '||v_doc.document_number),v_doc.customer_id,current_date,'08:00','Geplant','Normal',nullif(v_address,''),concat_ws(E'\n\n','Erstellt aus Angebot '||v_doc.document_number,nullif(v_doc.intro_text,''),nullif(v_doc.notes,'')),0,0)
  returning public.jobs.id into v_job_id;

  insert into public.job_planned_materials(company_id,job_id,source_document_id,source_document_item_id,description,quantity,unit,quoted_unit_price)
  select v_doc.company_id,v_job_id,v_doc.id,di.id,di.description,di.quantity,di.unit,di.unit_price
  from public.document_items di
  where di.document_id=v_doc.id and di.company_id=v_doc.company_id and di.item_type='material'
  on conflict (job_id,source_document_item_id) do nothing;

  update public.documents d set converted_job_id=v_job_id,updated_at=now() where d.id=v_doc.id;
  insert into public.document_events(company_id,document_id,actor_user_id,event_type,details)
  values(v_doc.company_id,v_doc.id,auth.uid(),'converted_to_job',jsonb_build_object('job_id',v_job_id,'job_number',v_job_number));
  return query select v_job_id,v_job_number;
end;
$$;

grant execute on function public.create_job_from_offer(uuid) to authenticated;
