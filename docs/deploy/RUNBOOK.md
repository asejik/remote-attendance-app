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
Answer within 30 days. Requests normally come through the client (the data controller); one sent to info@asejik.com is passed to them and handled on their instruction.
- **Copy of records:** GitHub → Actions → **Data request (production)** → `export`, organisation code and the worker's staff code → approve. Download the `data-export` artifact (kept 1 day) and decrypt it:
  `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in export.tar.gz.enc -out export.tar.gz` (passphrase: `EXPORT_PASSPHRASE` from your password manager), then `tar -xzf export.tar.gz`. It holds the worker's staff record, clock-in records (CSV) and their photos still on file. For day-to-day copies the admin can also use Reports filtered to that worker.
- **Correction:** the admin edits the worker (name, phone) or notes the correction on the affected clock-ins (Review).
- **Deletion:** first run the workflow with `delete` and **no** confirm: the log shows what would be deleted (dry run). Then run it again with `confirm` = `abc/W-0001` (organisation/staff code). It removes the worker's photos, clock-in records, staff record, PIN and login, and writes an `erase_staff` audit entry. Export first if the client must keep the attendance history (the law may require them to keep payroll records; check with the client before erasing).
- Deactivating a worker (without deletion) removes their photos automatically: the reference photo 30 days later, clock-in photos after the retention period.

## Client leaves the service
1. **Data request (production)** → `export` for the whole organisation (tick *include photos* if they want them) → send the decrypted files to the client securely; get written confirmation they have them.
2. Within 30 days: `delete` with no confirm (dry run, check the counts), then again with `confirm` = the organisation code. Everything is removed: photos, clock-ins, staff, sites, logins, audit log, the organisation.
3. Confirm the deletion to the client in writing (date and counts from the workflow log).

## Bad release: undo it
- **Web app:** Cloudflare → *Workers & Pages* → the app → *Deployments* → pick the last good one → **Rollback**. Takes effect immediately; installed web apps update on their next start.
- **Backend (database / Edge Functions):** don't edit production by hand. If a migration is at fault, write a new migration that reverses it (use `supabase/rollbacks/<migration>.down.sql` as the starting point; it is usually DESTRUCTIVE, so export data first) and deploy it with **Deploy production backend**. For a bad Edge Function, revert the commit on `main` and run **Deploy production backend** again (it redeploys all three functions).
- **Android app:** Android won't install an older version over a newer one. Revert the change on `main`, set `public/version.json` to a **higher** version (e.g. `1.1.1`), tag and release it (see *Releasing the Android app*), and raise `minimum` if the bad version must not be used.
- Afterwards: note what happened in `docs/PROGRESS.md` and add a test that would have caught it.
