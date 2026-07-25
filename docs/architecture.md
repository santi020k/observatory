# Architecture decision: owner-only project observatory

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

## Data flow

```text
GitHub public API ─┐
npm public API ───┼─> hourly Hono sync ─> D1 snapshots ─> authenticated API ─> Astro + Lumen
website checks ───┘

GitHub App / Cloudflare / commercial sources
        └─> future private collectors ─> isolated credentials + visibility-aware snapshots
```

## Authentication

1. The browser submits an email to `/auth/request-code`.
2. The API always returns a generic accepted message to prevent owner-email discovery.
3. For the configured owner, a random six-digit code is HMAC-hashed and stored for ten minutes.
4. Resend delivers the code. Local development returns it only when no Resend key is configured.
5. A verified code is consumed and exchanged for a 30-day opaque session.
6. Only a hash of the session token is stored. The raw token lives in an HttpOnly cookie.

## Collection cadence

The Worker runs at minute 17 of every hour. Manual sync is owner-authenticated. Each run writes one
immutable snapshot per discovered project and a sync-run audit row. A future retention task may
compact old hourly snapshots into daily aggregates after 90 days.
