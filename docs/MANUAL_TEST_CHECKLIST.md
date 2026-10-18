# Manual test checklist

What a person has to check by hand: a real phone, the camera, GPS, being outdoors, emails, and how things look. Everything else (access rules, sync, reports, flags, offline queue, accessibility scans) is covered by the automated tests (`npm test`, `npm run test:rls`, `npm run test:e2e`).

**When:** before a client demo, before each release APK, and after go-live (section 5). Tick items **☑ with the date**. Anything that fails: note what you saw and tell me.

Rewritten 2026-10-17 for SiteProof. The older milestone-by-milestone lists are in git history.

---

## 1. Before you start

**Links**

| What | Where |
|---|---|
| Test app for Android (dev data) | [Download siteproof-test.apk](https://github.com/asejik/remote-attendance-app/releases/download/android-test/siteproof-test.apk) · [release page](https://github.com/asejik/remote-attendance-app/releases/tag/android-test) |
| Web app (dev data) | [Preview of `rebuild`](https://remote-attendance-app-git-rebuild-asejiks-projects.vercel.app) (sign in to Vercel when asked) or locally: `npm run dev` → http://localhost:5173 |
| Logins (organisation `demo`) | [`docs/private/TEST_ACCOUNTS.md`](private/TEST_ACCOUNTS.md) (private repo): demo admin email/password; workers `WRK-01`, `WRK-02`, supervisor `SUP-01` and their PINs |
| Dev database | [Supabase dashboard](https://supabase.com/dashboard/project/zcndgbyovxzppgmrimgs): Table Editor, Authentication → Users, SQL Editor |
| Error reports and cron monitor | [Sentry](https://sentry.io) → Issues, Insights → Crons |
| CI, APK builds, owner workflows | [GitHub Actions](https://github.com/asejik/remote-attendance-app/actions) |
| How-tos | [RUNBOOK](deploy/RUNBOOK.md) · [GO_LIVE](deploy/GO_LIVE.md) · [Design guide](DESIGN.md) |

**Setup**
- ☐ On the phone, **uninstall the old "Attendance" test app** if it's there. SiteProof has a new app ID, so Android treats it as a different app. Then install `siteproof-test.apk`, allowing "install unknown apps" for your browser.
- ☐ Install **Google Authenticator** or **Microsoft Authenticator** on your phone for admin logins (section 3.1).

---

## 2. Worker app (Android phone)

### 2.1 Install and log in
- ☐ The home screen shows **SiteProof** with the teal pin-and-lens icon; the splash screen is teal. On Android 13+ with *themed icons* on, the icon follows the phone's colours.
- ☐ **Update notice:** with this build installed, push any app change (or ask me to) and wait for the new APK (about 10 minutes, see [GitHub Actions](https://github.com/asejik/remote-attendance-app/actions)). Reopen the app: a bar says **A new version of SiteProof is available (build N)**. **Download** opens the browser and downloads the APK; installing it keeps your data, and the bar goes away. **Later** hides it until the next build.
- ☐ Log in with organisation `demo`, staff code `WRK-01` and its PIN. On first login, or when the notice has changed, the privacy notice appears. **I understand and agree** → the worker home with your name.
- ☐ Close the app fully and reopen it, online and in airplane mode: the teal screen with the icon and **SiteProof** name, then straight to the home screen. **The login form never flashes.**
- ☐ Logged out and offline, try to log in: a clear "can't reach the server" message, no endless spinner.
- ☐ Wrong PIN: the message says how many tries are left (4, 3, 2, 1). On the 5th wrong PIN: **"This account is locked … Try again after HH:MM"**, and even the right PIN is refused until then. The admin resets the PIN (Staff → key icon): the new PIN works at once.

### 2.2 Clock in and out (online)
- ☐ Choose your site with the **large site buttons**: the chosen one turns teal with a tick.
- ☐ Tap the teal **Clock in** button (the demo organisation asks for a site photo, so there are 3 steps):
  - "Getting your location…" shows the step chips and ring.
  - The camera shows **Step 2 of 3 · Face photo**; smiling takes the photo automatically.
  - **Photo of the site** shows step 3 in amber → **Open camera** → take the photo. (**Cancel** here saves nothing.)
- ☐ In poor light, after about 20 seconds **Take photo without smile check** appears and works. Review later shows "No smile check".
- ☐ The **proof slip** appears with:
  - time, date, site, distance and GPS accuracy;
  - your code and both photos;
  - an **ON SITE** stamp when you're at the site;
  - "Saved on this phone" → **"Sent to your organisation"** within seconds.

  **Done** returns home.
- ☐ Home now says **Clocked in** with the time and site. The button turns dark: **Clock out**. Recent clock-ins list the times in one column with "Uploaded".
- ☐ Site photo off (admin → Settings → untick *Require a site photo*): the next clock-in has only 2 steps (*Step 2 of 2*). Tick it again afterwards.
- ☐ Far from the site (more than its radius): the slip shows **AWAY** with the distance, and Recent clock-ins / Review show *Outside site*.

### 2.3 Offline (the core promise)
- ☐ Airplane mode on → clock out. The slip says **"Waiting to send"**. Home shows *Offline* and **"1 waiting to upload · Oldest: … ago"**.
- ☐ **Restart the phone** (still in airplane mode). Open the app: the record is still waiting.
- ☐ Airplane mode off and keep the app open: it uploads by itself within about a minute, with no tapping. The box changes to **All records uploaded**, with a **Sync now** button you can tap at any time.
- ☐ Logging out with records waiting asks for confirmation first. Logging out offline really logs you out (you stay logged out when the network returns).
- ☐ On a very weak signal: clock-ins still save at once and upload later; nothing spins forever.

### 2.4 When the server says no
- ☐ Admin **deactivates** the worker while they're still logged in. The worker clocks in: within about a minute **"1 record not accepted"** appears with the reason, and the row says *Not accepted*. Reactivate, tap **Try again**: *All records uploaded*.
- ☐ **Rejected by the admin:** the admin rejects one of the worker's clock-ins with a reason. On the phone, tap **Sync now** (or reopen the app): a red notice says it was rejected, with the reason, and the row in Recent clock-ins says *Rejected*. An approved one says *Approved*. The **×** closes the notice, and it stays closed after a new clock-in or reopening the app.
- ☐ **Block mode** (admin → Settings → *Block*): a clock-in far from the site is refused before any photo, with the distance shown. Set it back to *Allow and flag*.

### 2.5 Real conditions
- ☐ **Outdoors in bright sun:** text and buttons are readable; site buttons and the clock button work with a dusty or gloved finger.
- ☐ **Largest font size** (phone settings → display → font size): the home screen still fits, with no sideways scrolling.
- ☐ **On a low-end phone:** a whole clock-in (location, smile, save) takes about 20 seconds or less.

---

## 3. Admin (laptop, and once on a phone)

### 3.1 Log in and two-step login
- ☐ **Organisation admin? Log in here** → demo admin email and password. First time: **Set up two-step login** shows a QR code. Scan it with the authenticator: the entry is named **SiteProof**. Type the code → you land on **Overview**.
- ☐ Log out and in again: only the 6-digit code is asked. A wrong code says so. Several logins in a row, including on mobile data, all work.
- ☐ **Forgot password?** sends an email; its link opens *Choose a new password* and asks for your code. (The dev mailer allows about 2 emails an hour.)
- ☐ Laptop: F12 → Network → set to *Offline* just after pressing **Log in**: within about 30 seconds, "Couldn't reach the server…", and the button works again.
- ☐ *(Optional)* **Wrong-code lock:** with a throwaway admin, about 20 wrong codes → within 5 minutes even the right code shows **Admin access locked**. Unlock with [RUNBOOK: Admin locked out after wrong codes](deploy/RUNBOOK.md#admin-locked-out-after-wrong-codes).

### 3.2 Overview
- ☐ Today's date with **Present (N of total)**, **On site now**, **Absent** and **Needs review**. Each worker shows their status (On site now / Clocked out / No clock-out / Absent), site, first in, last out and hours. On a laptop it's a table; on a phone, one card per person with no sideways scrolling.
- ☐ Tap a count (for example **Absent**): only those people show. Tap it again, or **show everyone**, to see all.
- ☐ Tap a person's name: their clock-ins for the day open with photos, flags and review state. **Open in Review** shows the same records in Review.
- ☐ The ‹ › arrows and the date box show earlier days. A night shift (in before midnight, out after) shows on the day it started, with its hours.
- ☐ Search by name or code, and filter by site and role.

### 3.3 Review
- ☐ Today's clock-ins: flagged ones first (amber border, plain-word flags such as *Outside site (2.2 km)*, *Weak GPS*, *Recorded by …*). On a laptop the cards sit two per row.
- ☐ Photos show at once (small previews). Tap one: the full photo opens; Escape or a tap closes it.
- ☐ **Reject** without a reason is refused. With a reason the card leaves *Needs review* and a message explains it is kept under **Status → Rejected** (nothing is deleted). **Approve** works the same way, instantly, without reloading the others.
- ☐ **Refresh** (top right) loads clock-ins that arrived since the page opened.
- ☐ **Approve N without flags** approves only the unflagged ones; flagged ones stay.
- ☐ Filters (dates, worker, site, status, flagged only) work. **Map** opens the clock-in location.
- ☐ On a phone, all six tabs show as two rows, with no sideways scrolling.

### 3.4 Staff
- ☐ **Add worker:** the photo area is a clear **Take or choose photo** box (on a phone it opens the **back** camera). Next comes **adjust the crop**: the chosen photo shows in the frame; drag the face into the oval and zoom; **Use photo** shows a preview with **Change photo**. After saving, the organisation code, staff code and PIN are shown once.
- ☐ The pencil icon: change the name, switch to Supervisor, add a phone, then save. The list updates; the staff code is unchanged and still logs in.
- ☐ Tap a photo circle to replace a reference photo: the same crop step, then the new photo shows straight away.
- ☐ Deactivate (person-x icon): that worker's next login says the account is deactivated. Reactivate restores it.

### 3.5 Sites, Reports, Settings
- ☐ **Sites → Add site** three ways: tap the map, *Use my current location* (on a phone at the site), typed coordinates. The radius slider changes the circle. Edit a site; deactivate one, and it disappears from the workers' site buttons.
- ☐ **Reports:** Excel and CSV for this month open in Excel or Google Sheets, with Nigerian times and a per-worker summary.
- ☐ **Night shift:** clock in late evening and out after midnight. The Reports summary shows 1 day present with the hours, and Overview shows it as clocked out on the day it started.
- ☐ **Settings:** each change shows *Saved* and takes effect on workers' phones the next time they connect.

---

## 4. Owner operations (dev rehearsal)

- ☐ **Suspension** ([RUNBOOK](deploy/RUNBOOK.md#suspending-an-organisation-for-example-unpaid-invoice)): Supabase → Table Editor → `organizations` → demo → status `suspended`.
  - Admins see a red banner; Review and Reports still work; saving says changes are turned off.
  - Workers can still clock in (7-day grace).

  Set it back to `active`.
- ☐ **Audit trail:** after editing a site or a worker, SQL Editor: `select action, details, at from audit_log order by id desc limit 5;` shows who changed what, with before/after values.
- ☐ **Data export rehearsal** ([RUNBOOK](deploy/RUNBOOK.md#a-worker-or-client-asks-for-their-data)):
  ```bash
  ACTION=export ORG_SLUG=demo STAFF_CODE=WRK-02 node scripts/data-request.mjs
  ```
  It writes that worker's records and photos to `data-export/`. Never run `delete` on demo by accident; without `CONFIRM` it's only a dry run.
- ☐ **Crash reporting:** open the test app once. Sentry → Releases or Sessions shows `com.asejik.siteproof`, environment `test-apk`.
- ☑ **Sentry alert for the nightly photo purge:** monitor `purge-expired-photos` with the "Nightly photo purge failed" alert; test email received (2026-10-17).
- ☑ **EXPORT_PASSPHRASE** set in the GitHub `production` environment (2026-10-17).

---

## 5. After go-live (production)

Do these once [GO_LIVE](deploy/GO_LIVE.md) is complete.

- ☐ [siteproof.asejik.com](https://siteproof.asejik.com) loads the login screen, and [siteproof.asejik.com/robots.txt](https://siteproof.asejik.com/robots.txt) shows plain text.
- ☐ Laptop: F12 → Network → reload: the page has a `content-security-policy` header. Login, photos and the Sites map all work.
- ☐ Send `https://siteproof.asejik.com` to yourself on WhatsApp: a teal **SiteProof** card appears. If not, [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) → paste the URL → *Scrape Again*.
- ☐ **Release APK** ([RUNBOOK: Releasing the Android app](deploy/RUNBOOK.md#releasing-the-android-app)): the `v1.0.0` APK installs (after uninstalling the test app) and talks to production. Repeat sections 2.1–2.3 with a real worker account.
- ☐ **Update notice:** raise `latest` in `public/version.json` above the installed version, then reopen the app: *A new version is available* with **Update**. Raise `minimum` above it: the bar turns red, and clock-in still works.
- ☐ **The next morning:** Supabase (production) → Integrations → Cron shows `purge-expired-photos` succeeded, and Sentry → Crons shows a **production** check-in.
- ☐ The client's first admin completes two-step login, and their first workers clock in at a real site.
- ☐ Lawyer's review of the privacy notice, consent screen and DPA done (owner).
