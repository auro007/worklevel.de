# WORKLEVEL V12.9

Global search in AppShell header + Plantafel polish. Keeps V12.4 security, V12.5 leads, V12.6 reminders, V12.7 recurring, V12.8 technician mobile. **No new SQL** — run existing V12.4–V12.7 scripts only if not yet applied.

## Globale Suche (Owner / Admin)
- Sticky header search in AppShell (`Ctrl/Cmd+K`)
- Debounced (~280 ms) search across:
  - **Kunden** — Name, Telefon, E-Mail, Adresse, Kundennummer
  - **Aufträge** — Nr., Titel, Adresse, Kunde
  - **Dokumente** — Belegnummern / Titel (Angebot, Rechnung, Lieferschein via Supabase)
  - **Leads** — Name, Firma, Kontakt, Status
- German result list with type badges; click navigates to the matching list page
- **Mitarbeiter (worker):** Suche ausgeblendet

## Plantafel
- Loading state while cloud data loads
- Clearer empty week (CTA zu Aufträgen) and empty day columns („Frei / Keine Aufträge“)
- Denser plan cards (time + priority row); today highlight; mobile-friendlier column width

## Packaging / preserved
- `package.json` → `worklevel-v12.9` / `12.9.0`
- Auth hang timeout, `allowedDevOrigins`, `formatCloudError` login mapping unchanged
- No SaaS billing; V12.4–V12.7 SQL files remain in package
