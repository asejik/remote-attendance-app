# SiteProof

Proof-of-presence attendance for field and project teams. Workers clock in and out on an Android phone with a face photo, GPS location and an optional site photo, even with no network; records upload by themselves later. Admins review flagged clock-ins next to each worker's reference photo and export attendance for payroll.

## What it does

- **Offline-first:** clock-ins are saved on the phone first and upload automatically when a connection returns. Retries never create duplicates.
- **Evidence the server checks:** distance from the site, GPS accuracy, phone-clock drift and missing photos are computed by the database and shown as flags. Flags never reject a record.
- **Smile check:** a liveness deterrent against holding up a printed photo. It is not face recognition and does not identify anyone.
- **Admin review:** flagged clock-ins first, photos side by side, approve or reject with a note, absent list, site management on a map, CSV and Excel reports.
- **Private by design:** every table has row-level security, photos are in private storage behind 10-minute links and deleted after a retention period, and admins need two-step login.

## Tech

React + TypeScript + Vite (PWA), Tailwind CSS, Capacitor (Android), face-api.js (on-device smile check), Supabase (Postgres, Auth, Storage, Edge Functions), Cloudflare (hosting). Tests: Vitest, Playwright, and an access-rule suite run against Supabase.

## Develop

```bash
npm install
cp .env.example .env   # then fill in the dev Supabase URL and anon key
npm run dev
```

`CLAUDE.md` has the full guide: commands, architecture, database rules and deployment.
