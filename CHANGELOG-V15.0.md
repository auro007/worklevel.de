# CHANGELOG V15.0

## 15.0.0 — Angebot angenommen → Auftrag (Geldpfad-Politur)
- `/angebote`: klare Büro-CTA **„Auftrag aus Angebot“** wenn Status **Angenommen** und noch kein Auftrag
- Bestehender Auftrag: Link zur Akte / Plantafel / Techniker statt Duplikat (`create_job_from_offer` idempotent)
- Nach Create: Auftrag in der **Auftragsakte** öffnen; optional **Plantafel** planen (`/plantafel?job=`)
- Listen-Schnellaktion + Banner „ohne Auftrag“; Statuswechsel auf Angenommen öffnet Preview mit CTA
- Dashboard: Karte **Angenommene Angebote ohne Auftrag** (Owner/Admin)
- Helper `src/lib/createJobFromOffer.ts` — **kein neues SQL**
- Docs / Chip / package **V15.0**
