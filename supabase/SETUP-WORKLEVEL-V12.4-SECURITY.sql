-- =============================================================================
-- WORKLEVEL V12.4 — SECURITY HARDENING (idempotent)
-- =============================================================================
-- Purpose:
--   Supabase advisors warn that SECURITY DEFINER RPCs inherit EXECUTE for
--   PUBLIC by default, so the anon role can call dangerous functions.
--   This script:
--     1) REVOKE ALL … FROM PUBLIC, anon on app / helper / trigger functions
--     2) GRANT EXECUTE … TO authenticated where the logged-in app needs it
--     3) Explicitly GRANT EXECUTE on token-scoped public offer RPCs TO anon
--        AND authenticated (intentional public customer flow)
--
-- Safe to re-run. Does NOT drop tables or delete data.
-- Missing functions are skipped (EXCEPTION WHEN undefined_function).
-- Run once in Supabase → SQL Editor after SETUP-WORKLEVEL-V12.sql.
-- =============================================================================

create or replace function public._wl_sec_revoke(p_sig text)
returns void
language plpgsql
as $$
begin
  execute format('revoke all on function %s from public', p_sig);
  execute format('revoke all on function %s from anon', p_sig);
exception
  when undefined_function then null;
  when undefined_object then null;
end;
$$;

create or replace function public._wl_sec_grant_auth(p_sig text)
returns void
language plpgsql
as $$
begin
  execute format('grant execute on function %s to authenticated', p_sig);
exception
  when undefined_function then null;
  when undefined_object then null;
end;
$$;

create or replace function public._wl_sec_grant_anon_auth(p_sig text)
returns void
language plpgsql
as $$
begin
  execute format('grant execute on function %s to anon, authenticated', p_sig);
exception
  when undefined_function then null;
  when undefined_object then null;
end;
$$;

create or replace function public._wl_sec_revoke_clients(p_sig text)
returns void
language plpgsql
as $$
-- Triggers / internal helpers: no client roles should EXECUTE
begin
  execute format('revoke all on function %s from public', p_sig);
  execute format('revoke all on function %s from anon', p_sig);
  execute format('revoke all on function %s from authenticated', p_sig);
exception
  when undefined_function then null;
  when undefined_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- A) Dangerous / app SECURITY DEFINER RPCs — revoke PUBLIC+anon, grant auth
--    (functions typically flagged by Supabase "function_search_path_mutable"
--     / "security_definer_search_path" / "exposed to anon" advisors)
-- ---------------------------------------------------------------------------
do $$
declare
  sigs text[] := array[
    -- company / team
    'public.create_worklevel_company(text)',
    'public.accept_company_invite(text)',
    'public.get_company_members(uuid)',
    'public.create_company_invite(uuid,text,text)',
    'public.owner_update_company_member(uuid,uuid,text,text)',
    -- jobs / worker
    'public.set_assigned_job_status(uuid,text)',
    'public.worker_add_job_material(uuid,text,numeric,text)',
    'public.worker_inventory_catalog()',
    'public.add_catalog_material_to_job(uuid,uuid,numeric)',
    'public.remove_job_material(uuid)',
    -- documents / billing
    'public.create_business_document(uuid,bigint,uuid,text,date,date,date,text,text,text,numeric)',
    'public.recalculate_document(uuid)',
    'public.mark_document_sent(uuid,text)',
    'public.log_document_event(uuid,text,jsonb)',
    'public.create_offer_public_link(uuid,integer)',
    'public.revoke_offer_public_link(uuid)',
    'public.create_job_from_offer(uuid)',
    'public.mark_invoice_paid(uuid,text)',
    -- inventory / procurement
    'public.adjust_inventory_stock(uuid,numeric,text)',
    'public.receive_purchase_order(uuid,jsonb)',
    -- RLS helper RPCs (SECURITY DEFINER) — authenticated only
    'public.is_company_member(uuid)',
    'public.has_company_role(uuid,text[])',
    'public.is_assigned_worker(uuid)',
    'public.worker_can_access_customer(bigint)',
    'public.can_access_job(uuid)'
  ];
  s text;
begin
  foreach s in array sigs loop
    perform public._wl_sec_revoke(s);
    perform public._wl_sec_grant_auth(s);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- B) Internal-only helpers / triggers — revoke from PUBLIC, anon, authenticated
-- ---------------------------------------------------------------------------
do $$
declare
  sigs text[] := array[
    'public.sync_job_material_cost(uuid)',
    'public.guard_inventory_material_company()',
    'public.guard_purchase_order_company()',
    'public.guard_purchase_order_item_company()',
    'public.guard_inventory_movement_company()',
    'public.record_initial_inventory_stock()',
    'public.recalculate_job_material_cost_trigger()',
    'public.enforce_procurement_company_links()'
  ];
  s text;
begin
  foreach s in array sigs loop
    perform public._wl_sec_revoke_clients(s);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- C) Intentional public (token-scoped) offer RPCs — keep callable by anon
-- ---------------------------------------------------------------------------
do $$
begin
  perform public._wl_sec_revoke('public.get_public_offer(text)');
  perform public._wl_sec_grant_anon_auth('public.get_public_offer(text)');

  perform public._wl_sec_revoke('public.respond_to_public_offer(text,text,text,text,text)');
  perform public._wl_sec_grant_anon_auth('public.respond_to_public_offer(text,text,text,text,text)');
end;
$$;

-- ---------------------------------------------------------------------------
-- D) Drop temporary helpers (leave no extra attack surface)
-- ---------------------------------------------------------------------------
drop function if exists public._wl_sec_revoke(text);
drop function if exists public._wl_sec_grant_auth(text);
drop function if exists public._wl_sec_grant_anon_auth(text);
drop function if exists public._wl_sec_revoke_clients(text);

-- ---------------------------------------------------------------------------
-- E) Quick verification (optional read-only report)
-- ---------------------------------------------------------------------------
-- SELECT n.nspname, p.proname,
--        pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
--        p.prosecdef AS security_definer,
--        array_agg(DISTINCT a.grantee::regrole::text ORDER BY a.grantee::regrole::text)
--          FILTER (WHERE a.privilege_type = 'EXECUTE') AS execute_grantees
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- LEFT JOIN information_schema.routine_privileges a
--   ON a.specific_schema = n.nspname AND a.specific_name = p.proname || '_' || p.oid
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'create_business_document','mark_invoice_paid','create_worklevel_company',
--     'owner_update_company_member','adjust_inventory_stock','receive_purchase_order',
--     'add_catalog_material_to_job','get_public_offer','respond_to_public_offer'
--   )
-- GROUP BY 1,2,3,4
-- ORDER BY 2;

select 'WORKLEVEL V12.4 security grants applied' as status;
