# Observatory

Private project intelligence and portfolio operations for Santiago Molina. Observatory turns public
repository, package, deployment, and product-feedback signals into one decision-focused control room.
The dashboard is owner-only; narrowly scoped public feedback routes serve each product's branded UI.

[Dashboard](https://observatory.santi020k.com) · [Architecture](docs/architecture.md) ·
[Feedback platform](docs/feedback-platform.md) ·
[Private-project model](docs/private-projects.md) ·
[Visualization roadmap](docs/visualization-roadmap.md)

## What it measures

- Every non-fork public repository under `santi020k`, discovered automatically
- GitHub stars, forks, open issues, recency, and repository traffic when `GITHUB_TOKEN` is set
- GitHub release-asset downloads, channel totals, and cumulative growth for mapped products
- Exact daily npm downloads, calendar rollups, and rankings across every
  package maintained by `santi020k`, plus current versions for mapped products
- VS Code Marketplace downloads, current installs, versions, ratings, updates,
  and per-sync history for mapped extensions
- Open VSX downloads, versions, ratings, reviews, publish times, and per-sync
  history, kept separate from Microsoft Marketplace counters
- Published website availability, p50/p95 response time, consecutive
  failures, and outage/recovery observations
- Cloudflare Web Analytics page views and visits, grouped hourly by project website
- Aggregate App Store and Google Play acquisition, install-base, device,
  version, operating-system, territory, crash, and ANR reports for published apps
- Attention signals for degraded, stale, or issue-heavy projects
- Project-scoped public feedback, moderation, voting, and private delivery kanbans
- Hourly D1 snapshots so trends can be added without changing providers

The first successful public-project sync backfills up to one year of completed
daily npm download data. Later syncs refresh the rolling 30-day metric and
persist new or recently revised npm days without rewriting the full history.
VS Code Marketplace values are cumulative provider counters, so Observatory
stores one source-specific snapshot per extension on every project sync.
The same mapped extensions are queried independently from Open VSX.
Mapped GitHub release assets are also stored as cumulative snapshots. Coolstead
keeps direct website downloads separate while its current versioned asset is
reported as the combined Homebrew-or-update channel.

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

Production deploys run automatically after every push to `main`. GitHub Actions reads the
`/apps/api` and `/apps/web` paths from Infisical's `prod` environment, applies pending D1
migrations, deploys the API Worker, and then deploys the web Worker. The public entry point is
`https://observatory.santi020k.com`; the API Worker is available at
`https://api.observatory.santi020k.com`.

The workflow authenticates to Infisical with GitHub OIDC through the read-only
`github-actions-apps` machine identity. No long-lived Infisical credential is stored in GitHub;
application and Cloudflare credentials remain in Infisical. Deployments are serialized so a newer
push cannot interrupt a database migration or partially replace a release.

Keep `CLOUDFLARE_API_TOKEN` scoped to runtime analytics reads. CI uses the separate
`CLOUDFLARE_DEPLOY_API_TOKEN`, which needs Workers Scripts, Workers KV, and D1 edit permissions for
the Observatory account. Routes are provisioned separately; CI publishes and promotes immutable
Worker versions so routine deployments do not require zone-level route access.

The production D1 binding is declared in `apps/api/wrangler.jsonc`. Apply migrations manually when
needed with Infisical providing the Cloudflare credentials:

```bash
infisical run --env=prod --path=/apps/api -- pnpm db:migrate:remote
```

For emergency manual deployment, inject the same production secrets and use the workspace scripts:

```bash
infisical run --env=prod --path=/apps/api -- pnpm --filter @santi020k/observatory-api run deploy
infisical run --env=prod --path=/apps/web -- pnpm --filter @santi020k/observatory-web build
infisical run --env=prod --path=/apps/api -- pnpm --filter @santi020k/observatory-web run deploy
```

Set `CORS_ORIGIN` to the dashboard origin. Configure the web app with
`PUBLIC_API_URL=https://api.observatory.santi020k.com`; use the same URL for `API_INTERNAL_URL` so
server-side requests reach the API directly.

Version tags matching `v*` are verified before GitHub publishes their release. Generated release
notes are grouped by feature, fix, and maintenance labels using `.github/release.yml`.

The Worker also owns the specific product routes
`postlens.santi020k.com/api/feedback/*` and
`between.santi020k.com/api/feedback/*`. Product websites remain responsible for
their branded forms and public roadmaps. Observatory validates each product's
registered origins and locales before accepting a mutation. Apply D1 migration
`0012_feedback_platform.sql` before enabling these routes.

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

### Published app analytics

The owner-only `/store/` dashboard keeps each provider's definitions separate.
Apple downloads, Apple opt-in installations, and Google Play's active-device
install base are not added together or presented as unique users. Device data is
an aggregate model or family breakdown; Observatory never receives a list of
individual customer devices.

Store collection runs daily at `17:37 UTC` and can also be started with the
owner-authenticated `POST /sync/stores` endpoint. `GET /analytics/apps?range=30d`
accepts the same analytics ranges as the other dashboards. Provider failures
are recorded as safe error codes while previously collected facts remain intact.

App Store collection requires these server-only values in Infisical's
`/apps/api` path:

- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY`
- `APP_STORE_CONNECT_REPORT_REQUESTS_JSON`, mapping `lumen`, `postlens`, and
  `betweencontractions` to existing `ONGOING` Analytics Reports request IDs

Use an App Store Connect API key with only the reporting access required to
download Analytics Reports. Observatory deliberately does not create or delete
Analytics Report requests; create each ongoing request as a separate,
account-holder-authorized setup action before adding its identifier.

Google Play collection is available for future catalog entries that declare a
published Play listing; none of the three current apps has a verified public
Google Play listing. It requires `GOOGLE_PLAY_REPORT_BUCKET` and
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Add the service-account email to Play
Console with global `View app information` access only. Observatory reads
install and crash CSV exports from the private reporting bucket; it does not
change releases, listings, or reviews.

Apple collection reads the newest daily instance for each report. Apple places
complete late-arriving partitions and corrections in newer instances, so older
instances must not be added to them. Report instances expire after 35 days;
historical data beyond that window requires an explicitly authorized one-time
snapshot request, which Observatory does not create automatically.

Google collection refreshes the current and previous monthly exports on every
run and rotates one older month per day. This progressively backfills up to one
year without exceeding a typical Worker invocation's provider-request budget.
Apple can omit low-volume usage rows for privacy, and Google Play monthly CSVs
can arrive several days after activity. The dashboard represents those states
as unavailable or awaiting data rather than displaying a misleading zero.

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

## License

This is private, proprietary source code. No license is granted to use, copy, modify, or distribute
it. See [LICENSE](LICENSE).
