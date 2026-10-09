-- WORKLEVEL V8 HOTFIX - fixes: column reference "id" is ambiguous
-- Safe to run after SETUP-WORKLEVEL-V8.sql. Existing data is kept.

create or replace function public.create_business_document(
  p_company uuid,
  p_customer bigint,
  p_job uuid,
  p_type text,
  p_issue_date date,
  p_due_date date,
  p_valid_until date,
  p_title text,
  p_intro text,
  p_notes text,
  p_vat_rate numeric
)
returns table(id uuid, document_number text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_year integer;
  v_next integer;
  v_prefix text;
  v_number text;
  v_id uuid;
begin
  if not public.has_company_role(p_company,array['owner','admin']) then
    raise exception 'Keine Berechtigung';
  end if;
  if p_type not in ('offer','delivery_note','invoice') then
    raise exception 'Ungültiger Dokumenttyp';
  end if;
  if not exists(
    select 1
    from public.customers c
    where c.id = p_customer
      and c.company_id = p_company
  ) then
    raise exception 'Kunde gehört nicht zu dieser Firma';
  end if;
  if p_job is not null and not exists(
    select 1
    from public.jobs j
    where j.id = p_job
      and j.company_id = p_company
  ) then
    raise exception 'Auftrag gehört nicht zu dieser Firma';
  end if;

  v_year := extract(year from coalesce(p_issue_date,current_date));

  select case p_type
    when 'invoice' then coalesce(nullif(trim(c.invoice_prefix),''),'RE')
    when 'offer' then coalesce(nullif(trim(c.offer_prefix),''),'AG')
    else coalesce(nullif(trim(c.delivery_prefix),''),'LS')
  end
  into v_prefix
  from public.companies c
  where c.id = p_company;

  insert into public.document_sequences(company_id,doc_type,year,last_number)
  values(p_company,p_type,v_year,1)
  on conflict(company_id,doc_type,year)
  do update set last_number=public.document_sequences.last_number+1
  returning last_number into v_next;

  v_number := v_prefix || '-' || v_year::text || '-' || lpad(v_next::text,4,'0');

  insert into public.documents(
    company_id,customer_id,job_id,created_by,doc_type,document_number,status,
    issue_date,due_date,valid_until,title,intro_text,notes,vat_rate
  )
  values(
    p_company,p_customer,p_job,auth.uid(),p_type,v_number,'Entwurf',
    coalesce(p_issue_date,current_date),p_due_date,p_valid_until,p_title,p_intro,p_notes,coalesce(p_vat_rate,19)
  )
  returning public.documents.id into v_id;

  return query select v_id, v_number;
end;
$$;

grant execute on function public.create_business_document(uuid,bigint,uuid,text,date,date,date,text,text,text,numeric) to authenticated;
