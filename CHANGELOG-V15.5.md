# WORKLEVEL V15.5

## Fix: angenommenes Angebot → Auftrag
- Materialpositionen aus einem angenommenen Angebot werden jetzt als **geplantes Material** am Auftrag gespeichert.
- Geplantes Material reduziert den Lagerbestand **nicht**.
- Geplantes Material zählt **nicht** als Ist-Material in der Nachkalkulation.
- Bereits umgewandelte Angebote werden durch die Migration idempotent nachgezogen.
- Auftragsakte zeigt geplantes Angebotsmaterial getrennt vom tatsächlich verwendeten Material.

## Datenbank
Einmal `supabase/SETUP-WORKLEVEL-V15.5-OFFER-JOB-MATERIAL-PLAN.sql` im Supabase SQL Editor ausführen.
