# CHANGELOG V14.5

## 14.5.0 — Wartung Service-Vorlagen (XP + €)
- `/wiederkehrend`: Vorlagen-Karten wie Plantafel-Skizze — **Wartung** + Beschreibung + **15 XP** + **20 €**
- `recurring_job_templates.default_xp` / `default_price` (Owner/Admin setzen)
- Beim Erzeugen: Kopie auf Auftrag als `xp_reward` + `suggested_price`
- Abschluss „Erledigt“: XP aus Vorlage (sonst Fallback +50)
- Rechnung vorbereiten: ohne Zeit/Material → Pauschale aus `suggested_price`
- SQL: `SETUP-WORKLEVEL-V14.5-SERVICE-TEMPLATES.sql` (additiv)
- Sidebar-Chip **V14.5**
