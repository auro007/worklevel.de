# CHANGELOG V14.2

## 14.2.0 — Mitarbeiter-Profil
- Profil-Ansicht (Owner/Admin) unter `/mitarbeiter` → **Profil**
- **Stunden schon** aus `job_time_entries` (Fallback: geschätzte Auftragsstunden)
- **Urlaub**: Anspruch (`vacation_days_total`) + Verbrauch aus `employee_absences`
- **Krankheitstage**: Log + Jahres-Summe
- **XP**: editierbar; +50 XP wenn Auftrag erstmals auf „Erledigt“
- **Geld**-Hinweis: persönlicher oder Firmen-Stundensatz × Stunden (kein Payroll)
- Tabelle `employee_absences` (urlaub|krankheit) inkl. RLS
- Techniker: leichter Profil-Streifen (Stunden diese Woche, XP, Urlaub)
- SQL: `SETUP-WORKLEVEL-V14.2-EMPLOYEE-PROFILE.sql` (additiv)
- Sidebar-Chip **V14.2**
