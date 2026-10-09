# WORKLEVEL V12.3

Cloud-first dashboard and procurement UX hardening for non-developer ZIP workflow.

## Changes
- Removed all legacy demo dashboard/invoice figures (no more 5045,60 € fake totals from `demo.ts`).
- Dashboard **Offene Rechnungen** now reads live Supabase `documents` (doc_type=invoice, status Offen/Überfällig); shows 0,00 € / empty hint when none.
- `demo.ts` is empty cloud-first defaults; localStorage no longer restores legacy invoices/orders/materials.
- German `formatCloudError()` helper for common Supabase/SQL errors (especially `supplier_id` / missing SQL).
- Lieferanten, Material, Bestellungen (inkl. Wareneingang) and Nachkalkulation: loading states, empty states, German error messages.
- package.json → `worklevel-v12.3` / `12.3.0`; START-WORKLEVEL.bat labels updated to V12.3.
- START-HERE.txt: short German Windows steps (.env.local public keys, SETUP-WORKLEVEL-V12.sql, HOTFIX-V12.2.2-TRIGGER-CLEANUP.sql, bat → localhost:3010).
- Packaged `.env.local` contains only public-key placeholders (no secrets).

## Preserved
- Offer portal (`/angebot/[token]`)
- Mark-as-paid on invoices
- Multi-company RLS model
- Bigint customers
- Dark/orange German UI
- Worker restrictions
