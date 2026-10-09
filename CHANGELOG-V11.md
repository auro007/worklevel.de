# WORKLEVEL V11 Changelog

Built on **WORKLEVEL V9** (V10 was described in the handoff but not shipped in the provided ZIP). V11 folds the intended V10 customer-offer portal into a stable MVP and tightens the core business loop.

## Stabilization
- `package.json` → `worklevel-v11` / `11.0.0`
- `START-WORKLEVEL.bat` labels updated (no stale V8 text)
- Port **3010** convention kept; Windows `npm.cmd` notes in `START-HERE.txt`
- Packaged `.env.local` scrubbed to public placeholders (use your real public Supabase keys)
- Production build verified

## Core loop (Lead → Offer → Job → Docs → Invoice → Payment)
- Dashboard workflow strip: Lead → Kunde → Angebot → Auftrag → Techniker → Rechnung
- Kunden: search by name/phone/email/address/number + quick link to Angebot
- Aufträge: richer search + quick link to Rechnung from a job
- Leads: search + **Als Kunde → Angebot** (creates cloud customer)
- Documents: search by document number / customer / phone / address; clearer loading & empty states
- Offer statuses include **Änderung angefragt**

## Customer offer portal (was missing in V9)
- Public route `/angebot/[token]` (no WORKLEVEL login)
- Office: create / copy / regenerate / revoke 30-day token link
- Customer: accept / reject / request changes + optional signature
- Office sees response + activity timeline
- **Accepted offer → one-click job conversion**

## Invoice payment basics
- Mark invoice as **Bezahlt** (status + `paid_at` / `payment_note` via RPC)
- Payment info shown in invoice preview

## SQL
- Additive, idempotent: `supabase/SETUP-WORKLEVEL-V11.sql`
- Remembers `customers.id` is **bigint**
- Qualifies PL/pgSQL `RETURNING` ids to avoid ambiguous `id`
- Does **not** require re-running V3–V9

## Intentionally not in V11
- SaaS billing / subscriptions / deployment
- Cloud Bestellungen / Material inventory (still local/demo)
- Resend credentials (optional; UI fallbacks remain)

## Known gaps
- Leads, Bestellungen, Material, Nachkalkulation remain partially local/demo
- Direct email still needs Resend env vars
- Public portal rate-limiting / GDPR production review still future work
