# WORKLEVEL V13.2

Client-seitige Foto-Komprimierung im Techniker-Modus vor dem Upload. Behält V13.1 PDF-Verbesserungen und V13.0 PWA. **Kein neues SQL.**

## Fotos (Techniker)
- Vor dem Upload nach Supabase Storage (`job-files`): längste Kante max. ~1600 px, JPEG-Qualität ~0.72
- Kleine JPEG/WebP unter ~450 KB und ohne Resize werden nicht unnötig neu kodiert
- Deutsche Statusanzeige: „Foto wird komprimiert…“ / „Foto wird hochgeladen…“
- Fehler über `formatCloudError` (inkl. Hinweise zu Dateigröße / Storage-Bucket / Policies)
- Unterschriften-Flow unverändert (PNG, upsert); Signatur-Fehler ebenfalls über `formatCloudError`

## Preserved
- V13.1 deutsche PDF-Ausgabe (Angebote/Rechnungen/Lieferscheine)
- V13.0 PWA (Manifest, SW production-only, Techniker Home-Screen-Hinweis)
- V12.9 globale Suche + Plantafel, V12.8 Techniker-UX, V12.7 Recurring, V12.6 Reminders, V12.5 Leads, V12.4 Security

## Packaging
- `package.json` → `worklevel-v13.2` / `13.2.0`
- Neue Hilfsdatei: `src/lib/compressImage.ts` (keine neuen npm-Dependencies)
