# CHANGELOG V15.1

## 15.1.0 — Public Angebot-Portal UX polish
- `/angebot/[token]`: klarerer Status nach Annehmen/Ablehnen inkl. Danke- und Nächste-Schritte-Text (DE)
- Gesperrter Zustand bei bereits beantwortetem Angebot (kein Doppel-Submit)
- Mobile Layout: Positionen als Kartenzeilen, lesbare Summenbox, Firmenname prominent
- Status-Badges (Angenommen / Abgelehnt / Änderung) farblich getrennt
- **Kein neues SQL** — nutzt weiterhin `get_public_offer` / `respond_to_public_offer`
- Docs / Chip / package **V15.1** (Chip nur eingeloggte App)
