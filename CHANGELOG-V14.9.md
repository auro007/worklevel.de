# CHANGELOG V14.9

## 14.9.0 — Erledigte Aufträge ohne Rechnung (Dashboard)
- Dashboard (`/`): Owner/Admin sehen erledigte Aufträge **ohne** aktive Rechnung
- Filter client-seitig über geladene Jobs + `documents` (`doc_type=invoice`, nicht `Storniert`) — **kein neues SQL**
- Pro Zeile: Titel, Kunde, Datum, Link **Akte** (`/auftraege?akte=`), Button **Rechnung vorbereiten** (`prepareInvoiceFromJob`)
- Leerzustand „Alles abgerechnet“
- Docs / Chip / package **V14.9**
