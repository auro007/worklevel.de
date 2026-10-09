# WORKLEVEL — aktueller Stand V15.6.2.2

**Package:** `worklevel-v15.6.1` / `15.6.1` · Chip **V15.6.2.2**

## Neu in V15.6.2.2
Batch-Fix aus dem gemeinsamen V15.5 Praxistest:
- Bestellungen öffnen zuverlässig und scrollen zur Detailansicht
- geplantes Angebotsmaterial in der Techniker-Ansicht; tatsächliche Verwendung wird bewusst bestätigt und erst dann aus Lager/Nachkalkulation gebucht
- Vorher-/Nachher-Foto-Checkliste folgt echten Fotos; Abschluss verlangt echte Vorher- und Nachher-Fotos
- Mengeneinheiten werden validiert; klar fehlerhafte aktuelle Material-Stammdaten werden per Migration bereinigt
- lokale Datumsauswertung für überfällige Bestellungen
- F5-Routenwiederherstellung gehärtet

**SQL:** `supabase/SETUP-WORKLEVEL-V15.6.2.2-FIXES.sql` einmal ausführen. Additiv/idempotent; kein Reset.

## Vorher (V15.3)
**Büro Heute-Übersicht** (`/heute`) · **kein neues SQL**:
- Tagesaufträge auf einen Blick, gruppiert nach Status / Mitarbeiter
- Schnelllinks Akte · Plantafel · Techniker
- Zähler nicht zugewiesen heute (Scheduling-Lücke nach Plantafel)

## Vorher (V15.2)
Techniker PWA / offline polish.

## Kernmodule
Kunden (+ Objekte), Fehlercodes, Geräte, Aufträge (**Akte** → Lieferschein/Rechnung), Plantafel, **Heute**, Techniker (PWA),
Mitarbeiter-Profil, Angebote (**Portal** + **→ Auftrag**)/Rechnungen, Lieferanten, Bestellungen, Material & Lager,
Lieferscheine, Nachkalkulation, Leads, Mahnungen, Versand, Wiederkehrend (Wartung XP/€),
Vorlagen, Firmendaten, Globale Suche, Dashboard Geldpfad (Angebot→Auftrag, Erledigt→Rechnung).

## Apply
Siehe `APPLY-V15.3.txt` — **no SQL**. Prod-Projekt: `xvaxlafehhetydvgldfw`.
