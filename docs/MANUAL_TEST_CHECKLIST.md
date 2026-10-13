# Manual Test Checklist

Things to click through yourself. Each task adds its steps here, newest first. For the final test run, work through every section that is still marked ☐ and tick each one off (☑) with the date.

**Setup:** open a WSL terminal in the project folder and run `npm run dev`, then open http://localhost:5173. On a phone, use the installed Android app once it exists (from M1).

---

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
