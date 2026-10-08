# Architecture decision: portfolio observatory and operations control plane

[Project overview](../README.md) · [Design guide](design-system.md) ·
[Feedback platform](feedback-platform.md)

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

## Interface boundary

The [design guide](design-system.md) governs Observatory's visual composition. Lumen supplies
accessible primitives and chart rendering; Observatory owns metric meanings, aggregation,
moderation, and authentication policy. Styles and `UIPrimitives` load once in the Astro root layout.
Native cross-document transitions progressively enhance full server-rendered navigation, preserving
the existing authentication checks, redirects, and per-page script lifecycle.

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

1. `@santi020k/auth-client` provides the browser's email-code and passkey operations.
2. The Astro Worker proxies an allowlist of same-origin `/api/auth/*` requests to the API Worker.
3. `@santi020k/auth-cloudflare` enforces the configured owner, exact browser origin, rate limits,
   passkey policy, and session resolution against Observatory's D1 database.
4. The API returns the same accepted response for authorized and unauthorized email-code requests
   to prevent owner-email discovery.
5. Resend delivers the code. Plaintext codes are never returned or logged, including locally.
6. A verified code or passkey creates a 30-day opaque, HttpOnly session.
7. The server-only `OWNER_PASSCODE` route remains a separate, consumer-owned recovery boundary;
   its HMAC-hashed rate-limit identities never store raw IP addresses. Recovery sessions restore
   protected application access but cannot mutate package-owned credentials; the email-code fallback
   creates the package session required for passkey management.

### Split-origin authentication

The production flow preserves the API as the owner of authentication and D1 while solving the dashboard/API hostname
boundary without widening cookie scope:

```text
browser at observatory.santi020k.com
  -> /api/auth/* on the Astro Worker
  -> allowlisted /api/auth/* endpoint on the API Worker
  -> Observatory-owned Better Auth tables in Observatory D1
```

The upstream `Set-Cookie` response is returned through the dashboard origin, which creates a host-only dashboard cookie.
Astro's existing server-side API client forwards incoming cookies to the API when it renders a protected page. The proxy
does not expose arbitrary API paths, accept non-auth methods, create a parent-domain cookie, or share identity state with
another application. The package-backed flow owns primary login, sessions, passkeys, and sign-out; recovery remains an
explicit application policy.

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
