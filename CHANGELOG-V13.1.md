# WORKLEVEL V13.1

Bessere deutsche PDF-Ausgabe für Angebote und Rechnungen. Behält V13.0 PWA und alle V12.x-Features. **Kein neues SQL.**

## PDF (Angebote / Rechnungen / Lieferscheine)
- Klareres Layout: Firmenkopf aus Firmendaten, Dokument-Meta rechts, Akzentlinie
- Absenderzeile + Empfängerblock (Rechnungs-/Angebotsempfänger)
- Positionstabelle mit Kopfzeile (Pos., Beschreibung, Menge, Einheit, Einzelpreis, Gesamt)
- Summenblock: Netto, MwSt. bzw. „entfällt“, Gesamtbetrag
- Kleinunternehmer-Hinweis (§ 19 Abs. 1 UStG) als hervorgehobene Box, wenn `taxation_mode = small_business`
- Zahlungsinfos (IBAN/BIC/Bank) bei Rechnungen; `document_footer` aus Firmendaten
- Fußzeile mit Firmen-/Steuerkürzeln und Seitenhinweis (`Seite x / y`)
- Kein Anspruch auf rechtliche Vollständigkeit — Arbeitsdokument, vor Versand prüfen

## Preserved
- V13.0 PWA (Manifest, SW production-only, Techniker Home-Screen-Hinweis)
- V12.9 globale Suche + Plantafel, V12.8 Techniker-UX, V12.7 Recurring, V12.6 Reminders, V12.5 Leads, V12.4 Security

## Packaging
- `package.json` → `worklevel-v13.1` / `13.1.0`
- Keine neuen Dependencies
