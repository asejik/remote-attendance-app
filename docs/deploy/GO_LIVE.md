# Go-live guide (production)

Step-by-step, in order. Each step says **who** does it. Nothing here gives a developer tool write access to production: the backend is deployed by a GitHub workflow that only the owner triggers.

Target web address: **https://attendance.asejik.com**

---

## 1. Production Supabase project (owner, ~10 min, starts the $25/month bill)

1. supabase.com → **New organization** (e.g. "Attendance Production") → plan **Pro**.
2. **New project** in that organization: name `attendance-prod`, region **West EU (Ireland)**, strong database password (save it in your password manager).
3. Project Settings → **API**: note the **Project URL**, the **anon / publishable key**, and the project **reference** (the `xxxx` in `https://xxxx.supabase.co`).
4. Account → **Access Tokens** → generate a token named `github-deploy-prod`.

## 2. GitHub "production" environment (owner, ~10 min)

Repo → **Settings → Environments → New environment** → `production`.
- **Deployment protection rules:** tick **Required reviewers** and add yourself (a second confirmation before anything touches production).
- **Environment secrets:**

| Name | Value |
|---|---|
| `PROD_PROJECT_REF` | project reference from step 1.3 |
| `PROD_SUPABASE_ACCESS_TOKEN` | token from step 1.4 |
| `PROD_SUPABASE_DB_PASSWORD` | database password from step 1.2 |
| `PROD_CRON_SECRET` | a new random string, 40+ letters/digits (password manager → generate) |
| `PROD_VITE_SUPABASE_URL` | Project URL |
| `PROD_VITE_SUPABASE_ANON_KEY` | anon / publishable key |
| `PROD_SUPABASE_SECRET_KEY` | the **secret** key (Project Settings → API). Used only by the onboarding and data-request workflows. |
| `EXPORT_PASSPHRASE` | a new random passphrase, 30+ characters (password manager → generate). Encrypts data exports; keep it in your password manager. |
| `ANDROID_RELEASE_KEYSTORE_B64` | from the private repo, `docs/private/android-release/` |
| `ANDROID_RELEASE_KEYSTORE_PASSWORD` | from the same folder |

- **Environment variables:** `PROD_SITE_URL` = `https://attendance.asejik.com`, `PROD_REDIRECT_URLS` = `https://attendance.asejik.com/**,https://localhost/**`
- Optional repository secret `VITE_SENTRY_DSN` (Sentry project DSN) for error reports.

## 3. Deploy the backend (owner clicks; ~5 min)

1. The developer merges `rebuild` into `main` (step 8 can wait; production does not depend on it).
2. Actions → **Deploy production backend** → **Run workflow** → branch `main` → type `DEPLOY` → approve the environment review.
3. The run applies all migrations, deploys the three Edge Functions, sets `CRON_SECRET`, turns **public sign-up off**, sets the redirect URLs and Vault secrets. A green run = backend ready.

## 4. Email for password resets (owner, ~15 min)

First, while in Supabase (production) → **Authentication → Providers → Email** (Pro plan): turn on **Prevent use of leaked passwords**. Admin passwords must be 12+ characters (set by the deploy workflow).

Supabase's built-in mailer is limited (~2 emails/hour) and not for production.
1. resend.com → sign up (free: 3,000 emails/month, 100/day) → **Domains → Add** `asejik.com` (or a subdomain such as `mail.asejik.com`).
2. Add the DNS records Resend shows at your DNS host (where asejik.com's DNS is managed, currently Vercel) and wait until Resend shows **Verified**.
3. Supabase (production) → **Authentication → Emails → SMTP Settings** → enable custom SMTP: host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key, sender `no-reply@asejik.com`, sender name `Attendance`.

## 5. Web app on Cloudflare: see [CLOUDFLARE.md](CLOUDFLARE.md) (owner, ~20 min)

## 6. First client organisation and admin (owner, ~3 min)

Actions → **Onboard organisation (production)** → Run workflow → enter the organisation name, short code (what workers type at login, e.g. `abc`), the admin's name and email, and the settings → approve. Running it twice is harmless.
The admin then opens the app → **Organisation admin? Log in here** → **Forgot password?** to set their own password, so no password is ever sent by chat or email (needs step 4's email setup).

## 7. Android release (developer tags; owner publishes)

1. Developer sets `public/version.json` to `1.0.0` with the release link (RUNBOOK → *Releasing the Android app*), then pushes a tag `v1.0.0` → workflow **Android release APK** builds against production, signs with the release key, verifies the signature and creates a **draft** release.
2. Owner reviews and publishes the release; share the APK link with the client's workers (or via a short link).
3. **Workers with the test APK must uninstall it first** (the test and release apps are signed with different keys). Test data does not carry over.

## 8. Retire the prototype (developer, after production works)

- Drop the legacy tables, legacy bucket and legacy auth trigger on the **dev** project (DESTRUCTIVE migration, separate approval).
- Turn sign-up off on dev.
- Remove the old Vercel project (Vercel dashboard → project → Settings → Delete), since `main` now holds the new app.

## 9. Smoke test on production (owner + developer)

Log in as the client admin → add a worker (with photo) → worker logs in on a phone → clock in at the site and away from it → admin sees both in Review with photos and the right flag → download a report.
