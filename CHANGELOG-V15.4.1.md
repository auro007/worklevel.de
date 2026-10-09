# WORKLEVEL V15.4.1

## Fix
- Restored the existing WORKLEVEL Supabase public client configuration in `.env.local`.
- Fixes the login error saying Supabase is not configured after extracting a fresh release ZIP.
- Keeps the V15.4 expected-delivery-date improvements unchanged.

## Release packaging rule
Future local test ZIPs must retain `.env.local` with the existing public Supabase URL and publishable key. Secret/server keys must never be packaged.
