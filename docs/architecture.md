# Architecture decision: portfolio observatory and operations control plane

## Decision

Use a pnpm/Turborepo monorepo with an Astro server-rendered interface, Hono Cloudflare Worker API,
Cloudflare D1 snapshots, and shared contract/catalog/data packages.

## Why

- Astro keeps the authenticated UI lightweight and lets Lumen run without a frontend framework
  runtime.
- Hono centralizes secrets, authorization, scheduled syncs, and provider adapters.
- D1 fits the existing Cloudflare operational model and stores metric history cheaply.
- Separate packages prevent the frontend from duplicating provider or database shapes.
- Public and private collectors can evolve independently while producing the same normalized metric
  contract.
- Product-facing feedback uses a deliberately small public route boundary. Observatory owns the
  shared schema and private workflow; each product continues to own its branded customer UI.

## Data flow

```text
GitHub public API ─┐
npm public API ───┼─> hourly Hono sync ──┬─> project snapshots ────┐
VS Marketplace ──┤                      ├─> npm daily downloads ──┤
Open VSX API ────┤                      ├─> extension snapshots ──┤
website checks ───┘                      └─> source identity ──────┤
Cloudflare GraphQL ─> private hourly sync ──> web snapshots ───────┘

PostLens / Between Contractions
        └─> project-scoped feedback API ──> feedback items + hashed votes ──> owner kanbans

GitHub App / commercial sources
        └─> future private collectors ─> isolated credentials + visibility-aware snapshots
```

## Feedback isolation

- Every public request includes a project slug registered in the shared catalog and is restricted
  to that project's configured origins and locales.
- New submissions enter moderation. Only approved, public ideas appear on customer-facing boards;
  bug reports and private messages never do.
- Optional email addresses and diagnostic context are returned only by authenticated admin routes.
- Votes and rate limits use HMAC-derived identifiers. Raw IP addresses are never persisted, and
  production submissions can be protected with Turnstile without coupling products to its keys.

## Authentication

1. Email code is the primary sign-in path; passkeys and the server-only recovery code remain
   available as alternatives.
2. The browser submits an email to `/auth/request-code`.
3. The API always returns a generic accepted message to prevent owner-email discovery.
4. Requests are bounded by authorized email and by an HMAC-hashed client identity. New login and
   recovery rate-limit records never store raw IP addresses. Legacy recovery-attempt identities
   created before 0.3.0 age out after 24 hours, and scheduled cleanup runs even when collection
   fails.
5. For the configured owner, a random six-digit code is HMAC-hashed and stored for ten minutes.
6. Resend delivers the code. Local development returns it only when no Resend key is configured.
7. A verified code is consumed and exchanged for a 30-day opaque session.
8. Only a hash of the session token is stored. The raw token lives in an HttpOnly cookie.

### Package migration pilot

The optional package pilot preserves the API as the owner of authentication and D1 while solving the dashboard/API
hostname boundary without widening cookie scope:

```text
browser at observatory.santi020k.com
  -> /api/auth-v2/* on the Astro Worker
  -> allowlisted /api/auth/* endpoint on the API Worker
  -> Observatory-owned Better Auth tables in Observatory D1
```

The upstream `Set-Cookie` response is returned through the dashboard origin, which creates a host-only dashboard cookie.
Astro's existing server-side API client forwards incoming cookies to the API when it renders a protected page. The proxy
does not expose arbitrary API paths, accept non-auth methods, create a parent-domain cookie, or share identity state with
another application. `PUBLIC_AUTH_PILOT_ENABLED` gates the UI and proxy, while the matching `AUTH_PILOT_ENABLED` API
flag gates the package handler and package-session resolution. Legacy authentication remains the primary login and
recovery path throughout the pilot.

## Collection cadence

The Worker runs at minute 17 of every hour. Manual sync is owner-authenticated. Each run writes one
immutable snapshot per discovered project and a sync-run audit row. A future retention task may
compact old hourly snapshots into daily aggregates after 90 days.

After public project discovery completes, the Cloudflare collector queries Web Analytics only for
hostnames found on those public project snapshots. It upserts the latest 48 completed hourly
buckets into a separate table, so retries and delayed Cloudflare events do not duplicate totals.
Missing Cloudflare credentials disable this collector without affecting public project sync.

npm daily downloads use a separate package-and-day table rather than the rolling project snapshot.
The first sync requests up to one year of completed UTC days. Subsequent syncs request the rolling
30-day window for current velocity, while only new days and a short correction overlap are upserted.
The API aggregates those immutable daily facts into calendar weeks, months, and years.

VS Code extension identifiers live in the catalog next to their owning repository. The public
sync queries the Visual Studio Marketplace for each mapped identifier and stores downloads,
installs, version, rating, update count, and last-published time in a separate snapshot table.
This keeps cumulative Marketplace counters distinct from daily npm downloads and GitHub traffic.
Open VSX uses the same catalog mappings but a different provider identity in that table, so its
downloads, ratings, reviews, versions, and publish times cannot be conflated with Microsoft data.
