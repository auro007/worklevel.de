# WORKLEVEL V12.4

Security hardening for Supabase SECURITY DEFINER RPCs + login network-error UX.

## Security
- New idempotent script: `supabase/SETUP-WORKLEVEL-V12.4-SECURITY.sql`
- **REVOKE** `EXECUTE` from `anon` and `PUBLIC` on dangerous app RPCs (documents, billing, company/team, inventory, procurement, worker helpers, RLS helpers).
- **GRANT** `EXECUTE` to `authenticated` for those app RPCs so the logged-in UI keeps working.
- **Keep public (token-scoped):** `get_public_offer`, `respond_to_public_offer` — explicit `GRANT EXECUTE` to `anon` + `authenticated`.
- Trigger / internal helpers (`sync_job_material_cost`, `guard_*`, `record_initial_inventory_stock`, …) revoked from client roles.
- Does **not** drop tables or delete data. Safe to re-run.

### Revoked from anon (examples / advisor set)
`create_business_document`, `mark_invoice_paid`, `create_worklevel_company`, `owner_update_company_member`, `adjust_inventory_stock`, `receive_purchase_order`, `add_catalog_material_to_job`, `remove_job_material`, `create_company_invite`, `accept_company_invite`, `get_company_members`, `set_assigned_job_status`, `worker_add_job_material`, `worker_inventory_catalog`, `recalculate_document`, `mark_document_sent`, `log_document_event`, `create_offer_public_link`, `revoke_offer_public_link`, `create_job_from_offer`, plus RLS helpers `is_company_member`, `has_company_role`, `is_assigned_worker`, `worker_can_access_customer`, `can_access_job`.

### Kept callable by anon
`get_public_offer(text)`, `respond_to_public_offer(text,text,text,text,text)`.

## App UX
- Login/signup maps `Failed to fetch` / network errors via `formatCloudError` to a German hint about `.env.local` (URL + publishable key) and network.
- Carries forward V12.3.1: AuthProvider catch/timeout, `allowedDevOrigins`.

## Packaging
- package.json → `worklevel-v12.4` / `12.4.0`
- Run `SETUP-WORKLEVEL-V12.4-SECURITY.sql` once in Supabase SQL Editor (see START-HERE.txt).
