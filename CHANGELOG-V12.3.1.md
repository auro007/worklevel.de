# WORKLEVEL V12.3.1

Hotfix for AppShell hang on “WORKLEVEL wird geladen...”.

## Fixes
- `AuthProvider.tsx`: `getSession()` now uses `.then` / `.catch` / `.finally`; always clears loading; optional 8s safety timeout so a stuck promise cannot freeze the UI forever.
- `next.config.ts`: `allowedDevOrigins: ['127.0.0.1', 'localhost']` so Next.js 16 no longer blocks cross-origin HMR/dev assets when opening via 127.0.0.1.

## Packaging
- package.json → `worklevel-v12.3.1` / `12.3.1`
- START-WORKLEVEL.bat / START-HERE.txt labels updated to V12.3.1
