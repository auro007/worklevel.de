# WORKLEVEL V13.4 — Mahnwesen

Dedicated overdue-invoice workspace for office staff. **No new SQL** (reuses V12.6 reminders).

## UI
- `/mahnungen` list (owner/admin): customer, number, amount, due date, days overdue, reminder level, last reminder, actions
- Sidebar: **Mahnungen** near Rechnungen; chip **V13.4**
- Dashboard overdue card → `/mahnungen`
- Reminder level labels: 0 Erinnerung, 1./2./3. Mahnung
- DocumentsManager modal/titles use those labels; deep link from Mahnungen

## Packaging
- `package.json` → `worklevel-v13.4` / `13.4.0`
- No new dependencies; no new SQL
