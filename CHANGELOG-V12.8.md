# WORKLEVEL V12.8

Technician mobile UX + consistent German empty/loading states. Keeps V12.4 security, V12.5 leads, V12.6 reminders, V12.7 recurring. **No new SQL** — run existing V12.4–V12.7 scripts only if not yet applied.

## Techniker (`/techniker`)
- Mobile-first **Heute → Auftrag → Start / Pause / Fertig** flow
- Large tap cards for today’s jobs and open jobs
- Clearer status badges; sticky primary action bar with safe-area padding
- Better empty states: no jobs today / no open jobs / no selection
- Worker role: still no prices/costs on material stats or lines

## Empty / loading polish
- Shared `EmptyState` + `LoadingState` components (German copy + spinner)
- Applied on Kunden, Aufträge, Angebote/Rechnungen (DocumentsManager), Leads, Wiederkehrend, Material, Bestellungen, Lieferanten, Dashboard

## CSS
- V12.8 helpers: safe-area padding, full-width buttons, tech job cards, sticky actions

## Packaging / preserved fixes
- `package.json` → `worklevel-v12.8` / `12.8.0`
- AuthProvider 8s hang timeout, `allowedDevOrigins`, `formatCloudError` login mapping unchanged
- No SaaS billing; V12.4–V12.7 SQL files remain in package
