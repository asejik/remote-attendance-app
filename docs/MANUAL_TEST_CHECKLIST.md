# Manual Test Checklist

Things to click through yourself. Each task adds its steps here, newest first. For the final test run, work through every section that is still marked ☐ and tick each one off (☑) with the date.

**Setup:** open a WSL terminal in the project folder and run `npm run dev`, then open http://localhost:5173. On a phone, use the installed Android app once it exists (from M1).

---

## M3 Accounts (2026-10-14). Open `/v2/login` (the old `/` login is unchanged until M4)
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
