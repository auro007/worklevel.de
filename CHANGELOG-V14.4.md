# CHANGELOG V14.4

## 14.4.0 — Rechnung vorbereiten aus Auftrag
- One-Tap **„Rechnung vorbereiten“** für erledigte Aufträge (Büro/Inhaber)
- RPC `create_invoice_from_job`: Entwurf mit Material- + Arbeitszeit-Positionen, `job_id` verknüpft
- Idempotent: bestehende Rechnung zum Auftrag wird geöffnet statt doppelt angelegt
- Redirect zur Rechnungsvorschau (`/rechnungen?doc=…`)
- Techniker (Worker): nach Abschluss Hinweis „Büro erstellt Rechnung“ — kein Create
- SQL: `SETUP-WORKLEVEL-V14.4-INVOICE-FROM-JOB.sql` (additiv)
- Sidebar-Chip **V14.4**
