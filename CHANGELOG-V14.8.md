# CHANGELOG V14.8

## 14.8.0 — Lieferscheine aus Akte / Material
- **Auftragsakte**: Materialpositionen anzeigen + Button **Lieferschein erstellen**
- Client-Helper `prepareDeliveryNoteFromJob` nutzt bestehendes `create_business_document` (`delivery_note`) + `job_materials` — **kein neues SQL**
- Idempotent: vorhandener Lieferschein zum Auftrag wird geöffnet
- `/lieferscheine`: Leerzustand mit Hinweis zur Akte, Banner, Auftrag übernimmt Material zuerst
- Docs / Chip / package **V14.8**
