# WORKLEVEL V13.0

Lightweight PWA for technicians. Keeps V12.4–V12.9 features. **No new SQL.**

## PWA (Techniker)
- Web App Manifest (`public/manifest.webmanifest`): name **WORKLEVEL**, dark/orange theme (`#0b0c0e` / `#ff6a00`), `start_url` `/techniker`, `display: standalone`
- Placeholder icons under `public/icons/` (SVG + 192/512 PNG + apple-touch 180)
- Custom service worker `public/sw.js`: caches app shell / static assets so `/techniker` can open offline (live job data still needs network)
- `PwaRegister` client component in root layout — **registers SW only in production** (avoids Turbopack/dev conflicts on Next 16)
- Meta: `theme-color`, Apple `apple-mobile-web-app-capable` / status bar, viewport `viewport-fit=cover`
- On `/techniker`: small **„Zum Home-Bildschirm“** hint when not running in standalone display mode

## Preserved
- V12.9 global search + Plantafel polish
- V12.8 technician mobile UX
- V12.7 recurring, V12.6 reminders, V12.5 leads, V12.4 security
- Auth hang timeout, `allowedDevOrigins`, login error mapping
- No SaaS billing; existing SQL files remain in package

## Packaging
- `package.json` → `worklevel-v13.0` / `13.0.0`
- No new dependencies (no next-pwa)
