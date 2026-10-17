# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**SiteProof**: a proof-of-presence attendance app, sold as a per-worker subscription to field and project organisations in Nigeria. Workers clock in with a face photo (smile check), GPS and an optional site photo, offline-first. Admins review flagged clock-ins against each worker's registered photo and export reports.

- **Owner:** asejik (solo builder directing AI coding tools). Clients licence the product and own their data.
- **Rigor level: STRICT.** The app handles face photos (sensitive under the Nigeria Data Protection Act 2023) and precise worker locations.
- **Plan:** `docs/PROJECT_PLAN.md` is the source of truth for scope, data model, access rules and milestones. Background: `docs/IDEA_BRIEF.md`. Progress log: `docs/PROGRESS.md`.
- **Private files (the repo is public):** these paths are symlinks into the sibling private repo `../remote-attendance-private` (GitHub `asejik/remote-attendance-private`), recreated with `scripts/link-private-docs.sh`, and gitignored here. Commit changes to them **in the private repo**: `docs/PROJECT_PLAN.md`, `docs/PROGRESS.md`, `docs/IDEA_BRIEF.md`, `docs/CLIENT_QUESTIONS.md`, `docs/client/`, `supabase/legacy/`, `docs/private/`. Never commit client names, locations, pricing, business plans or details of unfixed vulnerabilities. If a file needs them, put it in a gitignored path.
- **Current state:** the December 2025 prototype (single-organisation, described below) is being rebuilt on the same stack, milestone by milestone (M0 → M7 in the plan).

## Permanent rules (P07-A)

Every task follows the safe change protocol in [docs/prompts/P07_SAFE_CHANGE.md](docs/prompts/P07_SAFE_CHANGE.md): plan → **stop for approval** → implement → verify → report → update `docs/PROGRESS.md`.

- Check the working tree is clean before starting. If not, ask for a checkpoint commit first.
- Run and report the baseline (typecheck, lint, build, tests) before changing anything. Never hide or silently fix existing failures.
- Make only the approved changes. If the same error survives two fix attempts, stop and explain.
- Database changes: inspect the live schema read-only first. Write migrations as files in `supabase/migrations/`, labelled ADDITIVE or DESTRUCTIVE, with a rollback script. Apply to **dev only** unless explicitly told otherwise. Regenerate types after every schema change.
- Never give any tool write access to the production database.
- Never delete code silently. List unused-code findings for approval.
- No secrets in the client bundle: only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` may appear in `src/`. The service-role key lives only in Edge Function secrets.
- Every table gets RLS (deny by default) and an `organization_id` if tenant-owned. Photos go in private buckets under `{org_id}/{event_id}/...` paths and are served by short-lived signed URLs. No names or user IDs in file paths.
- The smile check is a liveness deterrent, not identity verification. Don't describe it as "biometric security" in UI or copy.
- The user has given permission to run and test the app in a browser during verification.

## Commands

```bash
npm run dev            # Vite dev server
npm run typecheck      # tsc -b (noUnusedLocals/Parameters on)
npm run lint           # ESLint
npm test               # Vitest unit tests (src/**/*.test.ts, node env + fake-indexeddb)
npx vitest run src/lib/db.test.ts -t "PENDING"   # single test file / name
npm run test:e2e       # Playwright (tests/e2e, Pixel 7 Chromium) against a production build served by `vite preview` on [::1]:4173 (service worker active), dev Supabase from .env. Session tests need `E2E_STAFF_EMAIL`/`E2E_STAFF_PASSWORD`; the admin and accounts tests need `SUPABASE_SECRET_KEY` (they create throwaway admins with two-step login; `E2E_ORG_SLUG`, default `demo`) in `.env`. They skip without them (as in CI)
npm run build          # typecheck then vite build -> dist/
npm run check:secrets  # fail if a Supabase secret key is in src/ or dist/ (run after build)
npm run check:migrations  # names, rollback files, and (CI, BASE_SHA) new migrations sort after existing ones
npm run check:workflows   # workflows with manual inputs must mask them first (Actions logs are public)
npm run knip           # unused files/deps/exports
npm run test:rls       # access-rule (RLS) suite against the dev project: builds 2 test orgs + 6 users, checks every role, cleans up
npx supabase db push --linked --dry-run   # then without --dry-run: apply new migrations to dev
npx supabase gen types typescript --linked > src/lib/database.types.ts   # after every schema change
SEED_ALLOW=dev node scripts/seed-dev.mjs  # demo org "Demo Construction Ltd" (idempotent; --reset-passwords / --reset-pins to change existing logins)
npx supabase functions deploy <name> --use-api --no-verify-jwt   # deploy an Edge Function to dev (no Docker)
npx cap sync android   # copy dist/ into the Android project after a build
```

- Node 24 is installed through nvm in WSL. Non-interactive shells don't load it, so prefix commands with `. ~/.nvm/nvm.sh >/dev/null &&`. Otherwise `npm` resolves to the Windows install and fails on the `\\wsl.localhost` path.
- CI (`.github/workflows/ci.yml`) runs typecheck, test, build, check:secrets, lint, check:workflows and check:migrations on every push, using placeholder env values.
- **`db-fresh.yml`** proves production can be built from nothing. On changes to `supabase/`, `tests/rls/` and related files, it starts an empty local Supabase in Docker on the runner, checks that every migration applied, serves the Edge Functions, runs `test:rls` with `REQUIRE_RLS_TESTS=1` (it fails if anything skips), and runs the onboarding script.
- **CI logs:** `GITHUB_LOGS_TOKEN` in `.env` is a read-only, fine-grained token (Actions read on this repo only). Use it as `Authorization: Bearer` with `GET /repos/asejik/remote-attendance-app/actions/jobs/{id}/logs` to read failing runs.
- **Android APKs are built in the cloud** (`.github/workflows/android.yml`, JDK 21, Capacitor 8, minSdk 24). There's no local Android SDK. Each push to `rebuild` that touches app files publishes `siteproof-test.apk` to the `android-test` GitHub pre-release. It needs the repo secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `ANDROID_DEBUG_KEYSTORE_B64` (a shared debug key, so updates install over old versions without wiping offline data). App ID: `com.asejik.siteproof` (changed from `com.asejik.attendance` on 2026-10-17, before any real release; an old test APK must be uninstalled first).
- The web app is a PWA (vite-plugin-pwa, `registerType: autoUpdate`). The service worker is registered manually in `main.tsx` and skipped on native. It precaches the app shell and `public/models/`. **Every file served from `public/` needs a file extension.** Capacitor's Android server returns index.html for extensionless paths (`src/lib/models.test.ts` guards the models).
- `.env` also holds `SUPABASE_URL` and `SUPABASE_SECRET_KEY` for server-side tooling only. The secret key bypasses RLS: use it read-only, against dev only, and **never** give it a `VITE_` prefix.
- The legacy prototype schema, policies and security findings are recorded in `supabase/legacy/README.md` (private).
- `vite` is aliased to `rolldown-vite` via `overrides` in package.json. Keep that override.
- `.env` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (every variable is listed in `.env.example`). `src/lib/supabase.ts` throws at import time if either is missing. The current Supabase project is the **dev** environment (test data only).

## Database (new schema, M2 onwards)

The new tables live **in the same Supabase project as the legacy prototype tables** (decision: option B). Legacy `profiles`, `sites`, `attendance_logs` and the `attendance-photos` bucket (made private in M4) still serve the prototype on `main`. Don't touch them; they're dropped at go-live (`docs/deploy/GO_LIVE.md` step 8).

- **Tables:** `organizations` → `staff` (role `admin|supervisor|worker`, optional `user_id`), `work_sites` (named so because `sites` is legacy), `attendance_events` (id generated on the device, so uploads are idempotent), `audit_log`. Every tenant table has `organization_id`. Composite FKs keep staff and sites in the same organisation as the event.
- **RLS is deny-by-default.** anon has no privileges on the new tables. Helpers in the unexposed `private` schema (`current_staff()`, `current_org_id()`, `current_staff_role()`, `is_org_admin()`) are SECURITY DEFINER with an empty search_path. A deactivated staff member resolves to no staff record, so they see nothing.
- **The server computes evidence:** `private.attendance_event_before_insert()` overwrites distance, `within_radius`, `flags` (`outside_radius`, `low_accuracy`, `time_skew`, `no_face_photo`, `no_site_photo`, `no_location`, `no_site`, `liveness_failed`, `recorded_by_other` when `captured_by` isn't the worker's own login; Review shows who) and all review columns. Flags never reject an insert.
- **Admin writes go through RPCs:** `review_event()` and `update_org_settings()` (both audited). Clients have no UPDATE/DELETE on events. Staff rows are written only by the service role (Edge Functions, from M3).
- **Photos:** private buckets `event-photos` (`{org}/{event}/face|site.jpg`, write-once, read by admin/supervisor via signed URLs) and `reference-photos` (`{org}/{staff}.jpg`, admin only). JPEG only, 2 MB max. **Thumbnails** (P02, migration `20261015160000`): `face_thumb.jpg` / `site_thumb.jpg` / `{staff}_thumb.jpg` (320 px, ~10 KB) sit next to each photo. `sync.ts` makes them from the queued photo at upload (best effort, never blocks the record); admin lists show them via `signListPhotos` (falls back to the full photo for older records) and fetch the full photo only when opened. Retention and data-request delete them with their photo (`thumbPathOf` convention, duplicated in the purge function and script).
- **Photo links** (`src/lib/photoUrls.ts`): signed for 10 minutes and reused until a minute before expiry, so returning to a screen uses the browser cache; a photo that fails to load is re-signed once; `forgetPhoto` after replacing a reference photo; cleared on sign-out. Never re-sign photos on a timer (it re-downloads every photo on the page).
- **Staff accounts (M3):**
  - Workers sign in with org slug + staff code + 6-digit PIN through the `staff-login` Edge Function. It calls `staff_pin_verify()`: bcrypt hashes in `private.staff_pins`, 5 wrong tries → lock for 15 min, then 1 h, then 24 h on repeat lockouts within a day (migration `20261015120000`). Unknown org/code, wrong PIN and locked account all get the same `invalid_credentials` 401. It then mints a session via `generateLink` + `verifyOtp`.
  - Per-address throttle: failures from one IP (`cf-connecting-ip`, stored as an HMAC) are counted in `private.login_throttle`; `LOGIN_THROTTLE_LIMIT` (default 30, dev secret 100 so test runs don't block the dev machine) failures in 15 min block that address for `LOGIN_THROTTLE_BLOCK_MINUTES` (15) → `too_many_attempts` 429, reported to Sentry.
  - Each worker's Auth email is `{code}@{slug}.staff.invalid`, with a random password nobody knows, so PINs can't be guessed against Auth directly.
  - `admin-staff` (actions `create`, `update` (name, phone, role; not the staff code), `reset_pin`, `set_status`, `set_reference_photo`) checks that the caller is an active admin and scopes everything to their org.
  - Admins themselves use email + password and are created by the platform owner (seed/script), never through `admin-staff`.
  - **Admins need two-step login** (TOTP, Supabase MFA; migration `20261015150000`): `private.current_staff_role()` returns no role for an admin whose session isn't AAL2, so every admin policy and RPC refuses them, and `admin-staff` answers `mfa_required`. The app sends them to `/admin/verify` (set up the authenticator app, or enter the code); the password-reset screen asks for the code too (Supabase requires AAL2 to change a password). Tests: `tests/support/totp.ts` + `tests/support/mfa.ts` (RLS fixtures enrol admins; the accounts E2E goes through the real set-up screen). Supabase refuses a check whose challenge and verify requests arrive from different IPs (`mfa_ip_address_mismatch`); `verifyTotp` and the test helper retry it. Recovery is by the owner (RUNBOOK).
  - **Wrong-code lock** (migration `20261015170000`; Supabase limits guesses per IP only): pg_cron `lock-guessed-admins` every 5 min counts unverified `auth.mfa_challenges`; 20 in 24 h → a row in `private.admin_lockouts`, so `current_staff_role()` gives no role (even after a right code) and `admin-staff` answers `mfa_locked`; `/admin/verify` shows "Admin access locked" (`my_admin_lockout()`); audited; the nightly purge run reports new locks to Sentry. The owner unlocks with one SQL statement (RUNBOOK).
  - Password-only admin sessions can't read sites either; clock-ins are accepted only from staff who accepted the privacy notice (migration `20261015180000`).
  - Deactivation sets `staff.status` and bans the Auth user.
  - Workers accept the privacy notice via the `accept_consent()` RPC.
  - Client helpers: `src/lib/staffAuth.ts`, `src/lib/adminStaff.ts`, `src/context/useStaff.ts`.
  - These screens became the default app in M4 (paths `/`, `/consent`, `/home`; admin under `/admin/*`).
- **Migrations** live in `supabase/migrations/`, with hand-run rollbacks in `supabase/rollbacks/`. **Name a new migration with a timestamp later than the newest existing file** (some are dated ahead of the calendar, so `supabase migration new` can sort too early); `check:migrations` enforces this in CI. Apply to dev with `db push`. Docker is unavailable locally, so `db dump`, `db pull` and `test db` don't work here (the `db-fresh` CI job runs Docker on GitHub instead).
- **PostgREST bulk inserts send `null` for keys missing from some rows** (not the column default). Include every key in every row.

## App architecture (M4 onwards)

- **Routes** (`src/App.tsx`): `/` login (worker PIN / admin email), `/consent`, `/home` (worker clock-in), `/reset-password`, `/privacy` (public notice), `/diagnostics`, all inside `MobileLayout`. Admin pages are lazy-loaded.
- **Privacy notice:** `ConsentPage` (accepted via `accept_consent(p_version)`, audited) and `PrivacyPage`. Raise `PRIVACY_NOTICE_VERSION` in `src/lib/support.ts` when the wording changes in substance: workers accept it again when next online. Wording changes need the client's and counsel's approval.
- **Admin routes** `/admin/review|absent|sites|staff|reports|settings` use the wider `AdminLayout` (`src/pages/admin/`; tabs wrap to two rows on phones). Admins land on Review.
  - `StaffRoute` gates each route by role and consent.
  - `useStaff` loads the user's staff record and organisation, cached in localStorage so offline reopen works. A network error falls back to the cache; a definite "no record" clears it.
- **Clock-in** (`src/pages/WorkerHomePage.tsx`), in order:
  1. Site, org settings and recent server events are read from cache, then refreshed.
  2. GPS fix (Capacitor Geolocation).
  3. Block-mode geofence check (`src/lib/geo.ts`, same formula as the server).
  4. `LivenessCamera`: a smile auto-captures; after 20 s "take photo without smile check" → `liveness_passed=false`.
  5. Optional site photo (`site_photo_required`), shrunk by `shrinkPhoto`.
  6. `queue.add`.

  Clock in vs out comes from the newest of the local queue and the server's recent events.
- **Request time limit** (`src/lib/fetchTimeout.ts`, the Supabase client's `global.fetch`): 30 s for every request, 120 s for photo uploads. A request with no answer fails like a dropped connection, so screens show their "check your connection" message instead of loading forever, and sync retries. `sync.ts` treats timeouts as network errors (not refusals, not reported).
- **Offline queue** (`src/lib/queue/`): one `QueueStore` interface.
  - Web: IndexedDB (`AttendanceQueue`).
  - Native: `@capacitor/filesystem` in `Directory.Data`, as `queue/{id}/face.jpg|site.jpg|event.json`. event.json is written last, so partial writes are ignored.
  - Event ids are generated on the device. Synced records keep their metadata (photos deleted) and are pruned after 30 days.
- **Sync** (`src/lib/sync.ts`): uploads only the signed-in user's pending records.
  - Photos go to `event-photos/{org}/{event}/face|site.jpg` (a 409 "already exists" counts as success), then `attendance_events` upsert with `ignoreDuplicates`, then the server flags are read back.
  - Triggers: app start, `online` (+3 s) / Capacitor Network, app reopened, a 30 s check while anything is pending, and backoff retries (30 s → 5 min).
- **Admin (M5):**
  - Review queue (`src/lib/adminEvents.ts`) is ordered by `review_status`, then `flag_count` (a generated column), then newest. Reviews update the card in place (no reload); "Approve N without flags" approves the page's unflagged pending clock-ins one RPC each; photos show as thumbnails with shared, reused links (see **Photo links** above). It embeds staff via the composite FK `staff!attendance_events_organization_id_staff_id_fkey`. Photos come from batched 10-minute signed URLs. Reject requires a note. Review goes through the `review_event` RPC.
  - Report logic is pure and unit-tested in `src/lib/reports.ts`: organisation-time-zone days, summary, absent list. **CSV cells are escaped against formula injection** (`= + - @` prefix → `'`). Excel export uses SheetJS (installed from the official CDN tarball `cdn.sheetjs.com`, because the npm `xlsx` is stale and vulnerable) and writes text cells, never formulas.
  - Leaflet (`react-leaflet`, OSM tiles, attribution kept) and SheetJS are lazy-loaded, so they never reach the worker bundle.
  - Sites can be placed by map tap, current location, or typed coordinates.
  - Dialogs close on Escape (`src/hooks/useEscape.ts`). Lists reload through `useLatestOnly` so a slow earlier load can't overwrite a newer one.
- **Test-only liveness bypass:** `import.meta.env.VITE_E2E === '1'` auto-captures in `LivenessCamera`. Playwright builds with it into `dist-e2e/`. `check:secrets` fails if the marker `E2E_LIVENESS_BYPASS` appears in `dist/`.
- **Legacy:** the prototype pages and Dexie queue were removed in M4. `src/lib/legacyCleanup.ts` deletes the old on-device DB once. Legacy DB objects (`profiles`, `sites`, `attendance_logs`, the private `attendance-photos` bucket) still serve `main` and are dropped at go-live (GO_LIVE step 8).

## Production and deployment (M6)

- **Rule: no developer tool has production credentials.** Production lives only in the GitHub `production` environment (required reviewer: the owner). Everything that touches prod is a workflow the owner triggers:
  - `deploy-prod.yml`: migrations, the 3 Edge Functions, `CRON_SECRET`, and auth/Vault settings via `scripts/configure-supabase.mjs` (signup off, 12-character passwords, TOTP, 30-day session inactivity timeout: a Pro setting, `SESSION_INACTIVITY_HOURS=0` on Free).
  - `onboard-org.yml` → `scripts/onboard-org.mjs`: a new organisation plus its first admin.
  - `data-request.yml` → `scripts/data-request.mjs`: export (encrypted artifact, `EXPORT_PASSPHRASE`) or delete one organisation or one worker. Deletion is a dry run unless `CONFIRM` repeats the target. Tested by `tests/rls/data-request.test.ts`.
  - `android-release.yml`: on a `v*.*.*` tag, a release-key-signed APK as a draft release.
- **Guides:**
  - `docs/deploy/GO_LIVE.md`: the step-by-step order.
  - `docs/deploy/CLOUDFLARE.md`: hosting at `siteproof.asejik.com` with `wrangler.jsonc` (static assets + SPA fallback).
  - `docs/deploy/RUNBOOK.md`: operations, breach response, data requests.
- **Security headers** live in `public/_headers` (CSP etc.). `vite preview` applies the same headers, and `tests/e2e/fixtures.ts` fails any E2E test that logs a CSP violation. Use `dataUrlToBlob`, never `fetch(data:...)`. Adding an external host means updating the CSP.
- **Organisation suspension** (migration `20261015100000`): the owner sets `organizations.status = 'suspended'` (stamped `suspended_at`, audited). Admins become read-only (sites, reviews, settings, admin-staff refused; reads and exports work). Workers can sign in and clock in for 7 days, then are refused (`private.org_accepts_clockins`). The UI mirrors it in `src/lib/support.ts` (also `SUPPORT_EMAIL`).
- **Audit:** `work_sites` inserts/updates are audited by trigger with before/after values; organisation status changes too.
- **API surface (P04):** `pg_graphql` is dropped (unused). Signed-in users can't read `organizations.seats`/`price_per_seat_ngn` (column grants, migration `20261015140000`). Edge Functions answer CORS only for the app's origins (`_shared/http.ts` `withCors`; defaults: `https://siteproof.asejik.com`, `https://localhost` (Android), local dev/preview; secret `ALLOWED_ORIGINS` adds more, dev has the Vercel preview). HSTS is in `public/_headers`.
- **Photo retention:**
  - The `purge-expired-photos` Edge Function is called daily at 02:15 UTC by pg_cron, using `x-cron-secret` (Vault `project_url`/`cron_secret`, plus function secret `CRON_SECRET`, also in local `.env` for tests).
  - Service-role-only SQL helpers are in migration `20261015090000`.
  - Tested by `tests/rls/retention.test.ts`.
- **Build flags:**
  - `VITE_ENABLE_DIAGNOSTICS=1` (test APK only): shows `/diagnostics`.
  - `VITE_SENTRY_DSN`: enables Sentry (`src/lib/monitoring.ts`, PII stripped). Upload refusals are reported by `sync.ts` (code/status only).
  - Edge Functions: secrets `SENTRY_DSN` + `SENTRY_ENVIRONMENT` enable `_shared/sentry.ts` (errors via `logError`, and the purge job's Sentry Cron check-in). Dev uses `development`.
  - Android native crashes: `io.sentry:sentry-android-core` (Java/Kotlin crashes, freezes), configured by manifest meta-data (no screenshots, view hierarchy or PII); the DSN comes from env `SENTRY_DSN` at Gradle time (empty = off).
  - Release APK only: `VITE_APP_VERSION` (tag) + `VITE_UPDATE_URL` (`{site}/version.json`) turn on the update notice (`src/lib/appUpdate.ts`).
  - `VITE_MAP_TILE_URL` / `VITE_MAP_ATTRIBUTION`: the map tile provider.
- **Lazy chunks:** the face camera (face-api), diagnostics, the site map (Leaflet) and Excel export (SheetJS) are loaded on demand. Keep heavy libraries out of the main bundle.
- **Android signing:**
  - Debug/test APK: the shared debug key (`ANDROID_DEBUG_KEYSTORE_B64`).
  - Release: the release key, kept in the private repo (`docs/private/android-release/`) plus offline. Gradle reads `RELEASE_KEYSTORE*`, `VERSION_CODE` and `VERSION_NAME` from the environment.
  - **Brand** (SiteProof, deep teal `#0F6B63`, icon "photo at a place": a pin whose head is a camera lens): `scripts/generate-brand-assets.mjs` draws every icon and the link-preview image (`public/og-image.png`) from one SVG; then `npx @capacitor/assets generate --android` (flags in the script header) makes the Android launcher icons and splash. The adaptive icon XMLs add a `<monochrome>` layer for Android 13 themed icons (re-add it if the tool rewrites them). Tailwind colour `brand` (+ `brand-50/100/700/900`, `src/index.css`) is the app's primary colour; no Tailwind blue remains.
- **Search and link previews (P08):** a private app, so every response says `noindex, nofollow` (meta in `index.html` + `X-Robots-Tag` in `public/_headers`); `public/robots.txt` allows crawling so crawlers can read that; no sitemap. Open Graph/Twitter tags in `index.html` use absolute `https://siteproof.asejik.com/` URLs and `public/og-image.png` (not precached). Smoke E2E checks all of this.

## Conventions (from .cursorrules)

- Offline-first: attendance writes go to IndexedDB first, then sync.
- Mobile-first Tailwind; functional components; `async/await` over `.then()`.
- Env access only via `import.meta.env.VITE_*`.
