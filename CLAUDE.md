# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Proof-of-presence attendance app (working name TBD), sold as a per-worker subscription to field and project organisations in Nigeria. Workers clock in with a face photo (smile check), GPS and an optional site photo, offline-first. Admins review flagged clock-ins against each worker's registered photo and export reports.

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
npm run test:e2e       # Playwright (tests/e2e, Pixel 7 Chromium) against a production build served by `vite preview` on [::1]:4173 (service worker active), dev Supabase from .env. Session tests need `E2E_STAFF_EMAIL`/`E2E_STAFF_PASSWORD` and the accounts test needs `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`/`E2E_ORG_SLUG` plus `SUPABASE_SECRET_KEY` in `.env`. They skip without them (as in CI)
npm run build          # typecheck then vite build -> dist/
npm run check:secrets  # fail if a Supabase secret key is in src/ or dist/ (run after build)
npm run knip           # unused files/deps/exports
npm run test:rls       # access-rule (RLS) suite against the dev project: builds 2 test orgs + 6 users, checks every role, cleans up
npx supabase db push --linked --dry-run   # then without --dry-run: apply new migrations to dev
npx supabase gen types typescript --linked > src/lib/database.types.ts   # after every schema change
SEED_ALLOW=dev node scripts/seed-dev.mjs  # demo org "Demo Construction Ltd" (idempotent; resets demo passwords)
npx supabase functions deploy <name> --use-api --no-verify-jwt   # deploy an Edge Function to dev (no Docker)
npx cap sync android   # copy dist/ into the Android project after a build
```

- Node 24 is installed through nvm in WSL. Non-interactive shells don't load it, so prefix commands with `. ~/.nvm/nvm.sh >/dev/null &&`. Otherwise `npm` resolves to the Windows install and fails on the `\\wsl.localhost` path.
- CI (`.github/workflows/ci.yml`) runs typecheck, test, build, check:secrets and lint on every push, using placeholder env values.
- **Android APKs are built in the cloud** (`.github/workflows/android.yml`, JDK 21, Capacitor 8, minSdk 24). There's no local Android SDK. Each push to `rebuild` that touches app files publishes `attendance-test.apk` to the `android-test` GitHub pre-release. It needs the repo secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `ANDROID_DEBUG_KEYSTORE_B64` (a shared debug key, so updates install over old versions without wiping offline data). App ID: `com.asejik.attendance`.
- The web app is a PWA (vite-plugin-pwa, `registerType: autoUpdate`). The service worker is registered manually in `main.tsx` and skipped on native. It precaches the app shell and `public/models/`. **Every file served from `public/` needs a file extension.** Capacitor's Android server returns index.html for extensionless paths (`src/lib/models.test.ts` guards the models).
- `.env` also holds `SUPABASE_URL` and `SUPABASE_SECRET_KEY` for server-side tooling only. The secret key bypasses RLS: use it read-only, against dev only, and **never** give it a `VITE_` prefix.
- The legacy prototype schema, policies and security findings are recorded in `supabase/legacy/README.md` (private).
- `vite` is aliased to `rolldown-vite` via `overrides` in package.json. Keep that override.
- `.env` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `src/lib/supabase.ts` throws at import time if either is missing. The current Supabase project is the **dev** environment (test data only).

## Database (new schema, M2 onwards)

The new tables live **in the same Supabase project as the legacy prototype tables** (decision: option B). Legacy `profiles`, `sites`, `attendance_logs` and the public `attendance-photos` bucket still serve the prototype on `main`. Don't touch them; they're retired after M4.

- **Tables:** `organizations` → `staff` (role `admin|supervisor|worker`, optional `user_id`), `work_sites` (named so because `sites` is legacy), `attendance_events` (id generated on the device, so uploads are idempotent), `audit_log`. Every tenant table has `organization_id`. Composite FKs keep staff and sites in the same organisation as the event.
- **RLS is deny-by-default.** anon has no privileges on the new tables. Helpers in the unexposed `private` schema (`current_staff()`, `current_org_id()`, `current_staff_role()`, `is_org_admin()`) are SECURITY DEFINER with an empty search_path. A deactivated staff member resolves to no staff record, so they see nothing.
- **The server computes evidence:** `private.attendance_event_before_insert()` overwrites distance, `within_radius`, `flags` (`outside_radius`, `low_accuracy`, `time_skew`, `no_face_photo`, `no_site_photo`, `no_location`, `no_site`, `liveness_failed`) and all review columns. Flags never reject an insert.
- **Admin writes go through RPCs:** `review_event()` and `update_org_settings()` (both audited). Clients have no UPDATE/DELETE on events. Staff rows are written only by the service role (Edge Functions, from M3).
- **Photos:** private buckets `event-photos` (`{org}/{event}/face|site.jpg`, write-once, read by admin/supervisor via signed URLs) and `reference-photos` (`{org}/{staff}.jpg`, admin only). JPEG only, 2 MB max.
- **Staff accounts (M3):**
  - Workers sign in with org slug + staff code + 6-digit PIN through the `staff-login` Edge Function. It calls `staff_pin_verify()`: bcrypt hashes in `private.staff_pins`, 5 wrong tries → 15 min lock, the same `invalid_credentials` answer for unknown org/code. It then mints a session via `generateLink` + `verifyOtp`.
  - Each worker's Auth email is `{code}@{slug}.staff.invalid`, with a random password nobody knows, so PINs can't be guessed against Auth directly.
  - `admin-staff` (actions `create`, `reset_pin`, `set_status`, `set_reference_photo`) checks that the caller is an active admin and scopes everything to their org.
  - Admins themselves use email + password and are created by the platform owner (seed/script), never through `admin-staff`.
  - Deactivation sets `staff.status` and bans the Auth user.
  - Workers accept the privacy notice via the `accept_consent()` RPC.
  - Client helpers: `src/lib/staffAuth.ts`, `src/lib/adminStaff.ts`, `src/context/useStaff.ts`.
  - These screens became the default app in M4 (paths `/`, `/consent`, `/home`; admin under `/admin/*`).
- **Migrations** live in `supabase/migrations/`, with hand-run rollbacks in `supabase/rollbacks/`. Apply to dev with `db push`. Docker is unavailable, so `db dump`, `db pull` and `test db` don't work.
- **PostgREST bulk inserts send `null` for keys missing from some rows** (not the column default). Include every key in every row.

## App architecture (M4 onwards)

- **Routes** (`src/App.tsx`): `/` login (worker PIN / admin email), `/consent`, `/home` (worker clock-in), `/reset-password`, `/diagnostics`, all inside `MobileLayout`. Admin routes `/admin/review|absent|sites|staff|reports|settings` use the wider `AdminLayout` (`src/pages/admin/`). Admins land on Review.
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
- **Offline queue** (`src/lib/queue/`): one `QueueStore` interface.
  - Web: IndexedDB (`AttendanceQueue`).
  - Native: `@capacitor/filesystem` in `Directory.Data`, as `queue/{id}/face.jpg|site.jpg|event.json`. event.json is written last, so partial writes are ignored.
  - Event ids are generated on the device. Synced records keep their metadata (photos deleted) and are pruned after 30 days.
- **Sync** (`src/lib/sync.ts`): uploads only the signed-in user's pending records.
  - Photos go to `event-photos/{org}/{event}/face|site.jpg` (a 409 "already exists" counts as success), then `attendance_events` upsert with `ignoreDuplicates`, then the server flags are read back.
  - Triggers: app start, `online` (+3 s) / Capacitor Network, app reopened, a 30 s check while anything is pending, and backoff retries (30 s → 5 min).
- **Admin (M5):**
  - Review queue (`src/lib/adminEvents.ts`) is ordered by `review_status`, then `flag_count` (a generated column), then newest. It embeds staff via the composite FK `staff!attendance_events_organization_id_staff_id_fkey`. Photos come from batched 10-minute signed URLs. Reject requires a note. Review goes through the `review_event` RPC.
  - Report logic is pure and unit-tested in `src/lib/reports.ts`: organisation-time-zone days, summary, absent list. **CSV cells are escaped against formula injection** (`= + - @` prefix → `'`). Excel export uses SheetJS (installed from the official CDN tarball `cdn.sheetjs.com`, because the npm `xlsx` is stale and vulnerable) and writes text cells, never formulas.
  - Leaflet (`react-leaflet`, OSM tiles, attribution kept) and SheetJS are lazy-loaded, so they never reach the worker bundle.
  - Sites can be placed by map tap, current location, or typed coordinates.
  - Dialogs close on Escape (`src/hooks/useEscape.ts`).
- **Test-only liveness bypass:** `import.meta.env.VITE_E2E === '1'` auto-captures in `LivenessCamera`. Playwright builds with it into `dist-e2e/`. `check:secrets` fails if the marker `E2E_LIVENESS_BYPASS` appears in `dist/`.
- **Legacy:** the prototype pages and Dexie queue were removed in M4. `src/lib/legacyCleanup.ts` deletes the old on-device DB once. Legacy DB objects (`profiles`, `sites`, `attendance_logs`, the private `attendance-photos` bucket) still serve `main` and are dropped at M6.

## Conventions (from .cursorrules)

- Offline-first: attendance writes go to IndexedDB first, then sync.
- Mobile-first Tailwind; functional components; `async/await` over `.then()`.
- Env access only via `import.meta.env.VITE_*`.
