# WORKLEVEL V12.5

Cloud-backed Leads (Supabase) + carries forward V12.4 security and login UX.

## Cloud Leads
- New additive SQL: `supabase/SETUP-WORKLEVEL-V12.5-LEADS.sql`
- Table `public.leads` with **uuid** PK, `company_id`, contact/address fields, `status`, `notes`, `source`, `estimated_value`, optional `converted_customer_id` (bigint → customers), timestamps.
- **RLS** via `has_company_role(company_id, ['owner','admin'])` (same office model as Lieferanten).
- Frontend `/leads`: load / create / edit / delete via Supabase; German dark/orange UI; loading / empty / error states; `formatCloudError`.
- **„Als Kunde → Angebot“**: creates a cloud customer (with address from the lead), marks lead `Gewonnen` + stores `converted_customer_id`, opens `/angebote?customer=…`.
- Converted leads show a direct **Angebot** link.
- Local/demo lead storage removed from AppData persistence.

## Carried from V12.4
- `SETUP-WORKLEVEL-V12.4-SECURITY.sql` (REVOKE dangerous SECURITY DEFINER RPCs from anon).
- Login maps `Failed to fetch` / network errors via `formatCloudError`.
- AuthProvider hang fix (timeout + catch).
- `allowedDevOrigins` in `next.config.ts`.
- BOM-safe `.env.example` (URL + publishable key only; no service role).

## Packaging
- package.json → `worklevel-v12.5` / `12.5.0`
- Run **V12.5 Leads SQL once AFTER V12.4 Security** (see START-HERE.txt).
