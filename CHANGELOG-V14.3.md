# CHANGELOG V14.3

## 14.3.0 — Kundendienst: Fehlercodes + Geräte-Pläne
- **Fehlercodes**-Katalog (`error_codes`): Code, Titel, Beschreibung, Gewerk, aktiv
- Office-CRUD unter `/fehlercodes` mit Suche/Filter
- Techniker: Nachschlagen und optional an Auftrag anhängen (`jobs.error_code_id`)
- Worker-RPC `set_assigned_job_error_code`
- **Geräte-Pläne** (`site_devices`): Name, Typ, Serie/Modell, Notizen, Plan-URL/Datei
- Office-CRUD unter `/geraete`; Verknüpfung Kunde + optional Objekt
- Aufträge können Gerät + Fehlercode wählen
- Techniker sieht Geräte/Pläne am Einsatzort
- Storage-Bucket `device-plans`
- SQL: `SETUP-WORKLEVEL-V14.3-SERVICE-CODES-PLANS.sql` (additiv)
- Sidebar-Chip **V14.3**
