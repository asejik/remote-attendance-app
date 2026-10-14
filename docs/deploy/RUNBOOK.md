# Operations runbook

For the owner (platform operator). Organisation-specific details (client names, contacts, contracts) live in the private repo.

## Daily / weekly
- **Errors:** check Sentry (if enabled) once a day during the pilot; weekly after. Server-side failures (sign-in, staff admin, the photo purge) appear there too, tagged `function`; uploads the server refused appear as *Upload refused by the server*.
- **Photo retention job:** Sentry → *Crons* → `purge-expired-photos` (environment *production*) alerts by email when a nightly run fails or doesn't arrive. Set this up once: open the monitor → *Alerts* → notify on failed/missed check-ins, filtered to `production`. To look deeper: Supabase (production) → *Integrations → Cron → Jobs* → `purge-expired-photos` should show a successful run each night (02:15 UTC). *Edge Functions → purge-expired-photos → Logs* shows the counts (`event_photos`, `reference_photos`, `orphans`, `errors`). Investigate any non-empty `errors`.
- **Storage use:** *Project Settings → Usage*. Pro includes 100 GB; at ~13 MB per worker per month with 60-day retention, that's thousands of workers.

## Backups and restore
- **What exists:** Supabase Pro takes a **daily backup kept for 7 days** (Database → Backups). Photos are deliberately short-lived and are not backed up separately.
- **Restore** (database only): Database → Backups → choose a day → *Restore*. This **overwrites** the current database and takes the project offline for minutes to hours. Before restoring, export anything needed from the current state (reports via the app).
- **Restore test:** once before launch and then every 6 months. Restore the latest backup *into a new project* if the dashboard offers "Restore to new project"; otherwise confirm the backup list is present and recent.
- **Point-in-time recovery** (restore to any minute) is a paid add-on (~$100/month for 7 days). Consider it once several clients depend on the service.

## Adding a new client organisation
1. Agree the organisation name, a short code (lowercase letters, digits, dashes, for example `abc`), the admin's name and email, and the settings (site photo required, flag/block, photo retention days).
2. GitHub → Actions → **Onboard organisation (production)** → Run workflow with those details → approve. It creates the organisation, the admin's login (random password nobody sees) and their staff record (`scripts/onboard-org.mjs`).
3. Tell the admin to open the app and use **Forgot password?** to set their password.
4. The admin adds sites and workers in the app.

## Suspending an organisation (for example, unpaid invoice)
1. Supabase (production) → *Table editor* → `organizations` → set `status` to `suspended` (`suspended_at` is filled in and the change is audited).
2. Effect: admins see a red banner and can still view and export, but can't change sites, workers, reviews or settings. Workers keep clocking in for **7 days**, then their clock-ins are refused and they see a notice.
3. To restore, set `status` back to `active`. Clock-ins refused after the grace period stay on workers' phones as *not accepted*; they tap **Try again**.

## A worker can't log in
- "not correct": check organisation code and staff code (admin → Staff); reset the PIN.
- "Too many wrong PINs": wait 15 minutes, or the admin resets the PIN (unlocks immediately).
- "deactivated": the admin reactivates them (Staff → person icon).

## Clock-ins not arriving
1. Ask the worker to open the app with internet: *All records uploaded* should appear within a minute.
2. **"N record(s) not accepted"** on the worker's screen: the server refused the record twice (the reason is shown). Sentry has an *Upload refused by the server* issue with the error code. Fix the cause (for example reactivate the worker), then the worker taps **Try again**.
3. Test builds: *Device diagnostics* shows "Last upload error".
4. Deactivated workers' unsent records are refused by design (decision D-22).

## Releasing the Android app
Installed apps read `https://attendance.asejik.com/version.json` at start and show *A new version is available* (or *too old, please update now* below `minimum`). Clock-in is never blocked.
1. In a commit on `main`, edit `public/version.json`: `latest` = the new version (e.g. `1.1.0`), `url` = `https://github.com/asejik/remote-attendance-app/releases/download/v1.1.0/attendance-v1.1.0.apk`. Raise `minimum` only when old apps would break (for example a database change they can't handle).
2. Tag that commit `v1.1.0` and push the tag. **Android release APK** refuses to build if `version.json` doesn't match the tag.
3. Publish the draft release, **then** deploy the web app so `version.json` goes live (otherwise apps would be sent to a link that doesn't exist yet).

## Suspected data breach (photos, locations or accounts exposed)
1. **Contain:** rotate the affected keys (Supabase → API keys; GitHub production secrets), deactivate affected accounts, revoke sessions (Authentication → Users → sign out), and stop the leak (e.g. fix an access rule).
2. **Record:** what happened, when it was discovered, what data and how many people, what was done. Keep timestamps.
3. **Notify the client organisation without delay.** They are the data controller. Under the Nigeria Data Protection Act 2023, the controller must notify the **Nigeria Data Protection Commission within 72 hours** of becoming aware of a breach likely to risk people's rights, and inform affected people where the risk is high. *(Verify current requirements with a lawyer.)*
4. Review and fix the cause; add a test that would have caught it.

## A worker or client asks for their data
- **Copy of records:** the admin downloads a report filtered to that worker (Reports, or Review with the worker filter).
- **Deletion:** deactivate the worker (photos are removed automatically: reference photo after 30 days, clock-in photos after the retention period). Full deletion of records on request goes through the platform operator (SQL, reviewed), within 30 days.

## Client leaves the service
Export all reports for the client, confirm in writing, then delete the organisation's data (events, staff, sites, photos, Auth users) with a reviewed script, within 30 days, and confirm deletion in writing.
