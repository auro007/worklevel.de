# WORKLEVEL FIX4 launch verification

Verified 2026-09-26 from `C:\Users\klajd\Downloads\WORKLEVEL-V15.6.2-FIX4.zip` (328,095 bytes), extracted into `worklevel-fix4`. Project and archive AGENTS.md instructions were read. Synced sources were not modified.

## Completed

- `npm ci --no-audit --no-fund`: passed; 58 packages installed from the supplied lockfile.
- `npm run build`: passed, exit 0, Next.js 16.3.5, Node 24.21.0, npm 11.19.0. Compilation, TypeScript, and generation of all 29 static pages completed.
- No application code or database changes were needed or made.
- Sidebar source badge is `V15.6.2-FIX4`; package name is `worklevel-v15.6.2-fix4`; package version is `15.6.2-fix4`.
- Compared FIX4 with the FIX3 attachment from the referenced conversation. Only package.json, CompanyProvider.tsx, Sidebar.tsx, and the added FIX4 changelog differ. Direct-route, Lieferschein/PDF, and SQL files are unchanged.
- CompanyProvider reads auth loading, combines it with per-user company loading, and marks success, no-membership, and query-error outcomes as loaded for that user.
- The MatRow typing mentioned by the FIX4 changelog was already present in FIX3; it is not an additional FIX4 change.
- No FIX4 SQL migration is required relative to FIX3. Existing production schema was not inspected. Historical SQL instructions are not instructions to rerun migrations.
- Production server started successfully at http://127.0.0.1:3024.
- HTTP 200: /login, /kunden, /auftraege, /rechnungen, /material, /bestellungen, /onboarding, /lieferscheine, /api/email-status.
- Unauthenticated POST /api/send-document returned 401.
- Browser rendered the login form; signed-out navigation to /kunden redirected to /login.

## Limits and remaining blocker

The build ran without production environment variables. This verifies compilation, not a working Supabase connection. No .env.local or Vercel project link exists in this extracted project; relevant environment variables were absent from the process. The existing Vercel/Supabase project identities and launch domain are still needed.

Authenticated direct-route retention, a real new user without membership reaching onboarding, and the AU-2026-0007 Lieferschein/PDF values (6266, Metal, 1 Stk. each, no 99/250 units) were not rerun against live data. Prior passing fixes are preserved by file comparison, not newly certified through a live regression run.

The supplied package-lock.json still labels its root package 15.6.0/worklevel-v15.6. Installation and build succeed; it has been left unchanged to avoid unrelated edits.

## Prepared deployment requirements

1. Identify and use the existing Vercel project and Supabase project; confirm the production domain.
2. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the intended deployment environment before the Vercel build. Use the publishable key, never a service-role secret in public variables.
3. If direct document email is required, configure server-only `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. Sending test email requires an explicit recipient/instruction.
4. Build and deploy this source as Next.js with `npm run build`. Do not upload the locally built .next directory as a production release: it was built without production public variables.
5. Set Supabase Auth Site URL to the production origin and review exact allowed production redirects; login/signup here use Supabase password authentication.
6. Verify the authenticated routes, onboarding, Lieferschein/PDF regression, and email configuration status on the deployed URL before admitting beta customers.

References: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

No cloud deployment or database mutation has been performed.

## Supabase project identified

The user supplied `https://xvaxlafehhetydvgldfw.supabase.co`. Saved it as NEXT_PUBLIC_SUPABASE_URL in the ignored worklevel-fix4/.env.local file. The publishable key is still missing. The project's dashboard redirects to sign-in in the available browser; project configuration has not yet been inspected. Vercel project and domain remain unconfirmed. The passing build above predates this environment file and must be rebuilt once configuration is complete.

## Latest progress: configured build passes

Supabase dashboard access is now available. The project reports Healthy. Retrieved the existing default publishable key (no secret key revealed) and stored it in ignored `.env.local`.

- Re-ran `npm run build` with `.env.local`: exit 0, TypeScript passed, all 29 static pages generated.
- Read-only `/auth/v1/settings` request using the configured publishable key returned HTTP 200. Email authentication is enabled, signup is enabled, and email confirmation is required.
- OpenAPI schema discovery at `/rest/v1/` rejected the publishable key with “Secret API key required.” Required database objects remain unverified; no privileged key was retrieved to bypass this restriction.
- Auth Site URL is still `http://localhost:3000`; no redirect URLs are configured. This must be updated to the confirmed production address before launch.
- Vercel dashboard currently redirects to login. Waiting for Vercel sign-in, project identity, and production domain.
- No cloud settings, database contents, or schema were changed. No deployment performed. Authenticated app regression tests remain pending.

## Domain and hosting account confirmed

User confirmed `worklevel.de` as the production domain. Intended canonical URL: `https://worklevel.de`.

The signed-in Vercel scope is `klajdizeka-7075`; its dashboard shows no existing projects (Deploy your first project). Netcup's domain list shows `worklevel.de` with a clock indicator and `Sobald aktiv`, without DNS controls. Domain activation and DNS setup remain pending. Keep Supabase's existing Auth URL unchanged until the production deployment and domain are ready, then switch to the canonical HTTPS URL.

Latest domain check: Netcup now shows worklevel.de with renewal date 26.09.2027 and a management link instead of the pending clock. Registration appears active. Opening its detail control did not expose DNS settings in the available browser, so no DNS changes were made. Vercel CLI 60.1.3 is installed; CLI device sign-in is in progress. Browser Vercel sign-in alone does not authenticate the CLI.

## Production deployment completed

- Vercel CLI sign-in succeeded. Created and linked `klajdizeka-7075/worklevel`.
- Configured the two NEXT_PUBLIC_SUPABASE variables for Production only.
- Deployed source to production: https://worklevel-97b7ja3ki-klajdizeka-7075.vercel.app
- Deployment ID: dpl_CHMJJ5w59bZetqaL7MyoguajZvBM. Status READY. Remote build completed in 35 seconds; Next.js 16.3.5, TypeScript and 29 static pages passed.
- Attached worklevel.de to the Vercel project. This is an alias assignment, not proof of working public DNS.
- Live HTTP checks returned 200 for login, the five requested direct routes, onboarding, Lieferschein, and email status. Unauthenticated send-document returned 401. Browser login form rendered.
- Domain verification failed: root A record still points to 46.38.243.234. Vercel recommends replacing web root A records with two @ A records: 216.198.79.1 and 64.29.17.1. Preserve unrelated MX/TXT/mail records. No DNS changes made yet.
- Shared Netcup browser still shows the domain list despite user reporting DNS page open; requested the DNS page address. Supabase Auth Site URL remains localhost until domain routing is ready.
- Follow-up: domain details are now visible, but automated selection of CloudDNS leaves the Nameserver form displayed. User was asked to select CloudDNS manually. No DNS or nameserver edits made.
- Vercel production error-log query for the last hour returned no matching logs; this is a limited smoke check, not an authenticated regression certification.

## Custom domain launch completed

- Netcup CloudDNS update succeeded: replaced the default parking A record with @ A 216.198.79.1 and added @ A 64.29.17.1, both TTL 3600. These were the only records; no email records or nameservers changed.
- Vercel domain verification returned configured-correctly, ownership verified, and both expected A values.
- Requested SSL certificate after initial HTTPS failure; Vercel confirmed successful issuance.
- https://worklevel.de/login now renders the WORKLEVEL login form over HTTPS.
- Supabase Auth Site URL changed from localhost to https://worklevel.de; dashboard confirmed successful save. Existing password/signup flow uses this default and does not supply a separate redirectTo URL.
- Authenticated direct-route, membership-free onboarding, and Lieferschein/PDF regression tests still require a signed-in app session. No database migration or database content change performed.
