# WORKLEVEL Product Roadmap (after V11)

## V15.4 (current)
- Bestellungen: erwartetes Lieferdatum anlegen/bearbeiten + Überfällig-Hinweis
- Dark-UI Date-Picker polish; no new SQL

## V15.3
- Office Heute overview (`/heute`): today’s jobs by status / assignee
- Quick links Akte · Plantafel · Techniker; unassigned-today count
- No new SQL

## V15.2
- Techniker PWA / offline polish (manifest, SW shell, offline banner)
- Read-only offline; no fake writes; no new SQL

## V15.1
- Public Angebot-Portal UX polish (/angebot/[token])
- Thank-you / next-steps after accept/reject; locked state; mobile totals
- No new SQL

## V15.0
- Angebot angenommen → Auftrag (create_job_from_offer UI polish)
- Dashboard pending accepted offers; /plantafel?job= deep-link
- No new SQL

## V14.9
- Dashboard: Erledigte Aufträge ohne Rechnung (billing gap)
- prepareInvoiceFromJob + /auftraege?akte= deep-link
- No new SQL (client filter jobs + documents)

## V14.8
- Lieferschein from Auftragsakte / job_materials via create_business_document
- Clearer /lieferscheine empty state; materials-first import
- No new SQL

## V14.7
- Office Auftragsakte on /auftraege: time, checklist, photos → billing
- Reuse job_time_entries, jobs.checklist, job-files signed URLs, create_invoice_from_job
- No new SQL

## V14.6
- Stabilization polish after V13.4–V14.5 feature burst
- Dashboard Schnellstart secondary shortcuts (Mahnungen, Versand, Vorlagen, Fehlercodes, Geräte, Wiederkehrend)
- Global search: error_codes, site_devices, document_templates, customer_sites
- No new SQL

## V14.5

- Wartung service templates: default_xp + default_price on recurring_job_templates
- /wiederkehrend cards with XP + € badges (Plantafel sketch)
- Jobs copy xp_reward / suggested_price; invoice uses flat price when idle
- SQL: SETUP-WORKLEVEL-V14.5-SERVICE-TEMPLATES.sql (additive)

## V14.4
- One-tap Rechnung vorbereiten from finished job (create_invoice_from_job)
- SQL: SETUP-WORKLEVEL-V14.4-INVOICE-FROM-JOB.sql (additive)

## V14.3
- Fehlercodes + Geräte-Pläne (Kundendienst)
- SQL: SETUP-WORKLEVEL-V14.3-SERVICE-CODES-PLANS.sql (additive)

## V14.2
- Mitarbeiter-Profil: Stunden, Urlaub, XP, Geld-Hinweis, Krankheitstage
- employee_absences + employees.hourly_rate / vacation_days_total / sick_days_year
- SQL: SETUP-WORKLEVEL-V14.2-EMPLOYEE-PROFILE.sql (additive)

## V14.1
- Material catalogs: trade (Heizung/Sanitär/Lüftung/Klima), keywords, images, Händler filter/group
- SQL: SETUP-WORKLEVEL-V14.1-MATERIAL-CATALOG.sql (additive)

## V14.0
- Field workflow: Zeit, Ankunft, Fotos vorher/nachher, Checkliste
- SQL: SETUP-WORKLEVEL-V14.0-FIELD-TIME.sql

## V13.9
- Better Nachkalkulation: revenue vs material vs labor vs margin %, filters, warnings, drill-down (no new SQL)

## V13.8
- Document templates (Vorbemerkungen/Nachbemerkungen, Fertige Vorlagen)

## V13.7
- Plantafel day hour-grid: columns = active workers, rows = hours (08–17)
- Unassigned counter + assign modal; reuse jobs/employees fields; no new SQL

## V13.6
- Customer sites (`customer_sites`): Haus 1/2/… with Mieter vs. customer billing address
- Jobs pick Objekt/Einsatzort; Techniker shows both addresses
- Optional Einsatzort on offer/invoice preview & PDF

## Done in V13.5
- Versandprotokoll `/versand` + Resend-Status (GET, keine Secrets)
- Firmendaten/Versand: Anleitung RESEND_* in `.env.local`
- DocumentsManager: Provider-ID im Log; kein neues SQL

## Done in V13.4
- Mahnungen-Seite, Stufenlabels, Deep-Link remind=1

## Done in V13.3
- Sidebar version chip; Dashboard Schnellstart; START-HERE / WORKLEVEL-CURRENT

## Done in V13.2–V13.0
- Photo compress, PDF polish, PWA

## Done in V12.9–V12.5
- Global search, Techniker mobile UX, recurring, reminders, leads, security
