# Manual Test Checklist

Things to click through yourself. Each task adds its steps here, newest first. For the final test run, work through every section that is still marked ☐ and tick each one off (☑) with the date.

**Setup:** open a WSL terminal in the project folder and run `npm run dev`, then open http://localhost:5173. On a phone, use the installed Android app once it exists (from M1).

---

## P03 audit fixes (2026-10-14)
- ☐ Demo worker PIN login: organisation `demo`, staff code `WRK-01`, PIN from `docs/private/TEST_ACCOUNTS.md`.
- ☐ Worker: deactivate a worker (admin → Staff), then on that worker's phone clock in while still logged in. Within about a minute the screen shows **"1 record not accepted"** with a reason, the history row says *Not accepted*, and the status stays CLOCKED OUT. Reactivate the worker, tap **Try again**: *All records uploaded*. (If Sentry is on, an *Upload refused by the server* issue appears.)
- ☐ Admin → Sites: change a site's radius. (Owner, Supabase SQL: `select action, details from audit_log where action like '%site%' order by id desc limit 3;` shows the before/after.)
- ☐ Suspension (dev, Supabase table editor → organizations → demo → status `suspended`): admin sees the red banner, Review/Reports still work, saving Settings says *Changes are turned off…*. Worker can still clock in. Set status back to `active`.
- ☐ Sentry → Crons: a `purge-expired-photos` monitor exists (environment *development*). Set up its alert for *production* at go-live.
- ☐ Night shift: a worker clocks in late evening and out after midnight. Reports → summary CSV shows 1 day present, 0 days without clock-out, and the hours; Absent for that evening doesn't list them under "never clocked out".
- ☐ Admin screens still open quickly after first load (they now load on demand); Reports → Excel and Sites map still work.
- ☐ Login screen shows *Privacy notice* and *Help: info@asejik.com*; the notice opens without logging in and reads well on a phone.
- ☐ Existing demo worker: on next login (online) they see **"Our privacy notice has changed"** with the number of days photos are kept; after agreeing, it doesn't come back. While offline it never blocks clock-in.
- ☐ Worker phone: turn on airplane mode, tap Log out: you land on the login screen and stay logged out after turning the network back on.
- ☐ Data request (dev rehearsal, optional): `ACTION=export ORG_SLUG=demo STAFF_CODE=WRK-02 node scripts/data-request.mjs` writes a folder in `data-export/` with that worker's records and photos. (Don't run `delete` on demo unless you mean it; without `CONFIRM` it is only a dry run.)
- ☐ Native crash reporting: install the new test APK and open it once. Sentry → *Releases* (or Insights → Sessions) shows a session from `com.asejik.attendance` in environment `test-apk`. Any Android-side crash or freeze later appears as an issue there.
- ☐ Release APK (first production release): set `public/version.json` `latest` above the installed version; reopen the app: a blue *A new version is available* bar with **Update** opens the download. Set `minimum` above it: the bar turns red. Clock-in still works.

## M6 Production readiness (2026-10-15). Mostly checked during go-live (docs/deploy/GO_LIVE.md)
- ☐ Android test APK: the home-screen icon is the blue pin (not the Capacitor default), and the splash screen is blue.
- ☐ Worker clock-in still works end to end (the camera now loads on demand, so the first time may take a second).
- ☐ Production web app: the browser's Network tab shows the `content-security-policy` header. Admin map tiles, photos and login all work under it.
- ☐ After go-live: the next morning, Supabase → Cron shows `purge-expired-photos` ran successfully.
- ☐ Release APK (tag `v1.0.0`) installs on a phone (after uninstalling the test app) and talks to production.

## M5 Admin review and reporting (2026-10-14). Log in as the demo admin; you land on Review
- ☐ Review: today's clock-ins appear, unreviewed and flagged ones first. Each card shows the clock-in photo next to the reference photo, plus the site photo. Tap a photo to enlarge it; Escape or a tap closes it.
- ☐ Reject without a reason is refused. With a reason, the card leaves "Needs review". The Status filter "Rejected" shows it with the note. Approve works the same way.
- ☐ Filters: date range, worker, site, flagged only. "Map" opens OpenStreetMap at the clock-in location.
- ☐ Absent: pick today. Workers who didn't clock in, and those who never clocked out, are listed separately.
- ☐ Sites → Add site: try all three ways (tap the map, "Use my current location" on a phone at the site, typed coordinates). The radius slider changes the blue circle. Edit a site. Deactivate it, and it disappears from the workers' site list.
- ☐ Reports: download Excel and CSV for this month. Both open in Excel or Google Sheets, with times in Nigerian time and a per-worker summary.
- ☐ Settings: turn "Require a site photo" off, and the worker's next clock-in skips the site photo. Switch to "Block", and a worker far from the site is refused.

## M4 Clock-in on the new system (2026-10-14). The app now opens at `/` with the new login
- ☐ Android: install the new APK over the old one. Log in with a worker code + PIN (create one as the demo admin first).
- ☐ Choose a site, then tap clock IN: "Getting location…" → face camera (smile) → site photo (if your organisation requires it) → "Clocked in. Uploaded."
- ☐ In airplane mode: clock out → "Saved on this phone…", plus the waiting count. Close the app fully and restart the phone: still waiting. Airplane mode off: it uploads within about a minute without tapping anything.
- ☐ Recent activity shows "Uploaded" or "Waiting", and flags such as "Outside site" (try clocking in far from the site).
- ☐ Face camera in poor light: after about 20 seconds, "Take photo without smile check" appears and works. The record shows "No smile check".
- ☐ Admin: in Supabase, set the demo organisation's `geofence_mode` to `block`. A clock-in far from the site is refused with the distance shown.
- ☐ Logging out with waiting records asks for confirmation first.

## M3 Accounts (2026-10-14). Since M4 these screens are at `/`
- ☐ Admin: "Organisation admin? Log in here" → log in with the demo admin from `docs/private/TEST_ACCOUNTS.md` → the Staff list shows.
- ☐ Add worker on the phone: the reference photo field opens the camera. After saving, the organisation, staff code and PIN are shown once.
- ☐ Worker login with organisation `demo`, staff code and PIN → privacy notice → "I understand and agree" → worker home with name.
- ☐ Close and reopen the app: you go straight back to the worker home, with no second notice.
- ☐ Enter the wrong PIN 5 times: the account locks ("Too many wrong PINs"). The admin taps the key icon (Reset PIN) and the new PIN works.
- ☐ Admin deactivates the worker (person-x icon): their next login says the account is deactivated. Reactivate restores it.
- ☐ Admin "Forgot password?" sends an email whose link opens "Choose a new password". (The built-in mailer allows about 2 emails per hour.)
- ☐ Tap a staff member's photo circle to add or replace their reference photo.

## M2 Secure database foundation (2026-10-13)
- No manual steps. The new tables aren't used by the app until M3/M4. They are covered by `npm run test:rls` (30 automated access checks).
- ☐ (Optional) Supabase dashboard → Table Editor: the new tables `organizations`, `staff`, `work_sites`, `attendance_events` and `audit_log` exist. The demo organisation "Demo Construction Ltd" has 3 sites and 4 staff.

## Final spike fixes: photo size, mirrored preview, Android upload timing (2026-10-13)
- ☐ Web app: take a clock-in. Diagnostics shows the site photo at about 150–300 KB (was 3.9 MB).
- ☐ Face camera: moving your head left moves the preview left, like a mirror. On the admin page, the saved face photo is the normal (non-mirrored) way round.
- ☐ Android: after offline clock-ins, turn airplane mode off and keep the app open. Uploads finish within about 1 minute without tapping Sync. Diagnostics "Last upload trigger" shows what started it.

## Re-test fixes: signing, upload retry, photo size (2026-10-13)
- ☐ Android: a new APK installs over the previous one (after the one-time uninstall), and queued records survive the update.
- ☐ Reconnect after offline clock-ins: everything uploads within about 1 minute, with no Sync tap needed.
- ☐ Site photo size on Device diagnostics is about 150–300 KB, and the photo is still clear on the admin page.

## Bug fixes from the first phone run (2026-10-13)
- ☐ Android app: Device diagnostics → Test face model load shows "loaded in … ms" (not FAILED).
- ☐ Log in, close the app completely, then reopen it. You go straight to the dashboard, with no login screen.
- ☐ Same as above in airplane mode.
- ☐ Logged out, in airplane mode: try to log in. You see "You're offline. Connect to the internet to log in."
- ☐ Staff account on the Admin Portal login shows "Access Denied", and you stay on the login page.

## M1 Offline spike (2026-10-12)
- ☐ Run the full phone test script in `docs/spikes/M1.md` (web app and Android app) and fill in its results table.
- ☐ Web app on a laptop: install it from Chrome (install icon in the address bar). It opens from its own window with the blue pin icon.
- ☐ Staff dashboard → "Device diagnostics" opens, and the back arrow returns to the dashboard.

## Task 2: lint fixes and camera cleanup (2026-10-12)
- ☐ Staff: tap Clock IN, smile, and the photo is taken automatically. The "Step 2: Site Photo" prompt appears.
- ☐ Staff: tap Clock IN, then close the camera with ✕ before smiling. Wait 5 seconds: no beep, and no "Step 2" prompt appears.
- ☐ Login with a wrong password shows a readable error message.
- ☐ Sync Now still works when there are pending records.

## Hotfix 001: profiles access rules (2026-10-12)
- ☐ Staff login still reaches the staff dashboard and shows your name.
- ☐ Admin login still reaches the admin dashboard, and records show staff names, not "Unknown User".
- ☐ Signing up a new staff account still works, and the new user can log in.

## M0 Groundwork (2026-10-12)
- ☐ The Staff Access login page loads and looks the same as before.
- ☐ Log in as a staff user and clock in (face smile, site photo, location). The record appears under Recent Activity.
- ☐ Log in through the Admin Portal. The admin dashboard loads with filters and records.
