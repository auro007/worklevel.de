-- Creates disposable fixtures in a transaction; never commits test records.
begin;
do $$
declare c record; customer bigint; employee uuid; job uuid;
begin
 select id,owner_user_id into c from public.companies where exists(select 1 from public.customers x where x.company_id=companies.id) limit 1;
 if c.id is null then raise exception 'Test requires a company and customer'; end if;
 select id into customer from public.customers where company_id=c.id limit 1;
 insert into public.employees(owner_id,company_id,name) values(c.owner_user_id,c.id,'TEMP TIMER TEST - ROLLBACK') returning id into employee;
 insert into public.jobs(owner_id,company_id,customer_id,employee_id,title,job_number,job_date)
 values(c.owner_user_id,c.id,customer,employee,'TEMP TIMER TEST - ROLLBACK','TEST-'||gen_random_uuid(),current_date) returning id into job;
 perform set_config('request.jwt.claim.sub',c.owner_user_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',c.owner_user_id,'role','authenticated')::text,true);
 perform public.transition_job_timer(job,'travel');
 perform public.transition_job_timer(job,'travel');
 if (select count(*) from public.job_travel_entries where job_id=job)<>1 then raise exception 'Duplicate travel entry'; end if;
 perform public.transition_job_timer(job,'work');
 perform public.transition_job_timer(job,'work');
 if (select count(*) from public.job_time_entries where job_id=job)<>1 then raise exception 'Duplicate work entry'; end if;
 if not exists(select 1 from public.job_travel_entries t join public.job_time_entries w on w.job_id=t.job_id where t.job_id=job and t.ended_at=w.started_at) then raise exception 'Travel/work boundary mismatch'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 perform set_config('request.jwt.claims','{}',true);
 begin
  perform public.transition_job_timer(job,'work');
  raise exception 'Unauthorized timer accepted';
 exception when others then
  if sqlerrm not in ('Keine Berechtigung','Anmeldung erforderlich') then raise; end if;
 end;
end;
$$;
rollback;
select 'Travel idempotency, atomic transition and unauthorized access tests passed; fixtures rolled back' as result;
