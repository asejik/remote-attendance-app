# Hosting the web app on Cloudflare (step by step)

Result: the app at **https://siteproof.asejik.com**, rebuilt automatically on every push to `main`, free plan. `asejik.com` itself stays on Vercel; only the `siteproof` subdomain points to Cloudflare.

The repo already contains what Cloudflare needs:
- `wrangler.jsonc`: serves `dist/` as a single-page app.
- `public/_headers`: the security headers (copied into `dist/` by the build).

## 1. Create the Cloudflare app (~10 min)

1. Sign up at **dash.cloudflare.com** (free).
2. **Workers & Pages → Create → Import a repository** → connect GitHub → choose `asejik/remote-attendance-app`.
3. Settings:
   - **Project name:** `siteproof`
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler@4 deploy`
4. **Build variables** (Settings → Variables and secrets → *Build*), from the production Supabase project:
   - `VITE_SUPABASE_URL` = production Project URL
   - `VITE_SUPABASE_ANON_KEY` = production anon / publishable key
   - `VITE_SENTRY_DSN` = Sentry DSN (optional)
   - `NODE_VERSION` = `24`
5. **Save and deploy.** The first build takes a few minutes. You get a temporary address like `siteproof.<your-account>.workers.dev`. Open it: the login page should load.

## 2. Use siteproof.asejik.com (~10 min)

Because asejik.com's DNS is managed at Vercel (not Cloudflare), use a CNAME at Vercel:

1. Cloudflare → your `siteproof` worker → **Settings → Domains & Routes → Add → Custom domain** → `siteproof.asejik.com`. Cloudflare shows the DNS record it needs.
   - If Cloudflare insists the zone must be on Cloudflare, add **asejik.com** to Cloudflare as a *free* zone **only for verification**, or use the alternative in step 3.
2. Vercel → **Domains → asejik.com → DNS Records → Add**: type `CNAME`, name `siteproof`, value as shown by Cloudflare (e.g. `siteproof.<your-account>.workers.dev`).
3. Alternative if the custom-domain step can't complete with external DNS: keep the `*.workers.dev` address for the pilot, or move asejik.com's DNS to Cloudflare (free; Vercel keeps hosting the main site via a CNAME to Vercel). Ask the developer before moving DNS.
4. Wait for HTTPS to show **Active** (usually minutes), then open https://siteproof.asejik.com.

## 3. Check it

- The page loads, and you can log in as the production admin.
- In Chrome DevTools → Network → the main document → **Response headers** include `content-security-policy` and `x-frame-options: DENY`.
- Install as an app from Chrome (desktop or Android) and confirm it opens offline after one visit.

## Notes

- Every push to `main` rebuilds and deploys. Pushes to other branches create **preview** addresses. Previews use the same build variables, so set *Preview* variables to the **dev** project if you want previews to talk to dev.
- Cloudflare's free plan has no bandwidth charge for static files. The limit is about 500 builds per month (verify on Cloudflare's pricing page).
