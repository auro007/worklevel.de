# WORKLEVEL V13.3

Handwerker-ERP (Next.js + Supabase). This package is **V13.3**.

## What's new
- Sidebar version chip **V13.3** near logout
- Dashboard **Schnellstart** (owner/admin): Lead → Angebot → Auftrag → Techniker → Rechnung → Wiederkehrend
- Consolidated `START-HERE.txt` + `WORKLEVEL-CURRENT.md` (cumulative V12.4–V13.3)
- Keeps V13.2 photo compress, V13.1 PDF, V13.0 PWA, V12.9–V12.4 features
- **No new SQL** for V13.3

## Quick start
1. Copy `.env.example` → `.env.local` (public Supabase keys only)
2. Apply SQL in order (see `START-HERE.txt` / `WORKLEVEL-CURRENT.md`) if not yet done:
   - `SETUP-WORKLEVEL-V12.sql` (once)
   - `SETUP-WORKLEVEL-V12.4-SECURITY.sql`
   - `SETUP-WORKLEVEL-V12.5-LEADS.sql`
   - `SETUP-WORKLEVEL-V12.6-REMINDERS.sql`
   - `SETUP-WORKLEVEL-V12.7-RECURRING.sql`
3. `npm install && npm run build` (or `START-WORKLEVEL.bat`)

## Docs
- `WORKLEVEL-CURRENT.md` — current-state guide
- `START-HERE.txt` — Windows Kurzanleitung
- `CHANGELOG-V13.3.md` — this release
- `APPLY-V13.3.txt` — note: no new SQL
- `PRODUCT-ROADMAP.md` — what's next
