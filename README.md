# Observatory

Private project intelligence for Santiago Molina. Observatory turns public repository, package,
and deployment signals into one decision-focused dashboard. It is intentionally owner-only and
already separates public collection from the future private-project adapters.

## What it measures

- Every non-fork public repository under `santi020k`, discovered automatically
- GitHub stars, forks, open issues, recency, and repository traffic when `GITHUB_TOKEN` is set
- 30-day npm downloads and current versions for mapped product packages
- Published website availability and response time
- Cloudflare Web Analytics page views and visits, grouped hourly by project website
- Attention signals for degraded, stale, or issue-heavy projects
- Hourly D1 snapshots so trends can be added without changing providers

The private projects section is specified but not connected. See
[`docs/private-projects.md`](docs/private-projects.md).

## Architecture

```text
apps/web/          Astro SSR + Lumen UI, owner-facing dashboard
apps/api/          Hono Cloudflare Worker, auth, sync, scheduled jobs
packages/api-types Shared Zod contracts across the network boundary
packages/catalog/  Product names, categories, and npm source mappings
packages/db/       Drizzle schema and D1 query helpers
```

This follows the useful boundaries in `aaronmgz`: a pnpm/Turborepo workspace, a unified Hono API,
D1 behind a shared data package, and backend-owned contracts.

## Local setup

Requirements: Node 22.22.3 or newer and pnpm 11.

```bash
pnpm install
pnpm setup:local
pnpm setup:github
pnpm db:migrate:local
pnpm dev
```

Open `http://localhost:4321/login/` and use `hi@santi020k.com`. Without a Resend key, the local
verification code is shown on the verification screen. Run the first sync from the dashboard.

The web app runs on `4321`; the API runs on `8787`.

`pnpm setup:github` copies the active `gh` CLI credential into the git-ignored local Worker
environment without printing it. Run `gh auth login` first if the CLI is not authenticated. GitHub
authentication avoids the low shared limit on unauthenticated API requests and enables repository
traffic metrics.

## Production configuration

Create the D1 database and replace the placeholder `database_id` in
`apps/api/wrangler.jsonc`:

```bash
pnpm --filter @santi020k/observatory-api exec wrangler d1 create observatory
pnpm --filter @santi020k/observatory-api run db:migrate:remote
```

Set Worker secrets directly:

```bash
pnpm --filter @santi020k/observatory-api exec wrangler secret put AUTH_SECRET
pnpm --filter @santi020k/observatory-api exec wrangler secret put CLOUDFLARE_ACCOUNT_ID
pnpm --filter @santi020k/observatory-api exec wrangler secret put CLOUDFLARE_API_TOKEN
pnpm --filter @santi020k/observatory-api exec wrangler secret put OWNER_EMAIL
pnpm --filter @santi020k/observatory-api exec wrangler secret put RESEND_API_KEY
pnpm --filter @santi020k/observatory-api exec wrangler secret put MAIL_FROM
pnpm --filter @santi020k/observatory-api exec wrangler secret put GITHUB_TOKEN
```

Set `CORS_ORIGIN` to the dashboard origin. Route `/api/*` to the API Worker and configure the web
app with `PUBLIC_API_URL=/api`; use the Worker URL for `API_INTERNAL_URL` if server-side requests
cannot follow the public route.

`GITHUB_TOKEN` is optional for public metadata, but required for repository traffic (views and
clones) and strongly recommended for rate limits. Use the narrowest read-only repository scope.

Cloudflare collection is optional and activates only when both `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` are set. Create a scoped token with `Account Analytics: Read`. The collector
queries the `rumPageloadEventsAdaptiveGroups` dataset for the hostnames already associated with
public projects, excludes bot-tagged events, and refreshes the latest 48 completed hourly buckets
on every scheduled run. This overlap captures delayed analytics without duplicating rows.
Cloudflare Web Analytics and its browser beacon must also be enabled for each hostname.

The owner-authenticated API exposes `GET /analytics/websites?range=30d` and accepts `5d`, `30d`,
`90d`, `1y`, or `5y`. `POST /sync/cloudflare` runs the collector manually. Cloudflare currently retains Web
Analytics source data for a shorter period, but Observatory's hourly D1 snapshots can accumulate
longer history from the point collection is enabled.

## Quality

```bash
pnpm verify
```

This runs the Santi ESLint base configuration, Astro check, TypeScript checks, Vitest, Astro Doctor,
and production builds.

## Privacy

- Login codes and session tokens are stored only as HMAC hashes.
- Authentication cookies are HttpOnly, SameSite Lax, and Secure in production.
- Only `OWNER_EMAIL` can receive a valid code; all other addresses get the same generic response.
- Pages use `noindex, nofollow, noarchive`.
- Provider secrets stay in Worker bindings and never reach the browser.
- Private-source routes and storage will remain separate from public collection.
