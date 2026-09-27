# Package-authentication pilot

This runbook covers the bounded Observatory pilot for the shared Auth packages. It is not authorization to remove the
legacy `/auth/*` login, legacy passkeys, `OWNER_PASSCODE` recovery, cookies, or tables.

## Isolation and routing

- Application origin and WebAuthn RP ID: `https://observatory.santi020k.com` and `observatory.santi020k.com`.
- API origin: `https://api.observatory.santi020k.com`.
- Database: Observatory's existing `DB` binding. Migration `0016_auth_cloudflare.sql` owns only the package tables.
- Cookie prefix: `observatory-owner`. The cookie remains host-only; never set `Domain=.santi020k.com`.
- Browser route: `/api/auth-v2/*`. The Astro Worker proxies only the allowlisted pilot endpoints to API `/api/auth/*`.
- Secrets, sender, passkeys, sessions, and recovery remain Observatory-owned and must not be reused by another product.

The proxy allows only email-code request and verification, package session lookup and sign-out, passkey registration and
authentication, and revocation of other package sessions. It rejects other Better Auth routes and bodies over 128 KiB.

## Package candidate

The API and web package manifests resolve `@santi020k/auth-cloudflare` and `@santi020k/auth-client` from the complete,
immutable v0.4.0 pilot bundle in `vendor/auth-v0.4.0/`. `pilot-bundle.json` identifies Auth commit
`79df2175b91281728ca56f39daaa05d098eb0eee`; `pnpm check:auth-pilot-bundle` fetches that public commit into a temporary
checkout, rebuilds the bundle, and compares the manifest and every checksum as part of `pnpm verify`. Do not
use `link:`, `workspace:`, a sibling checkout, or an unrecorded tarball. Replace these file ranges with the released
exact package versions in a separate reviewed change only after the two-consumer publication gate passes.

## Configuration preflight

Keep `AUTH_PILOT_ENABLED=false` in Infisical's production `/apps/api` path and `PUBLIC_AUTH_PILOT_ENABLED=false` in
`/apps/web` until the deployment is approved. The deployment preflight first validates each Infisical path independently,
then validates their combined relationships. The root `pnpm verify` command runs the combined
`pnpm check:auth-pilot-config` check. The two flags must match; when they are both `true`, validation also requires:

- exact HTTPS `SITE_URL`, `PUBLIC_API_URL`, and `API_INTERNAL_URL` origins;
- different site and internal API origins, preventing a proxy loop;
- matching public and internal API origins;
- `CORS_ORIGIN` containing the exact site origin.

The API flag gates both the package HTTP handler and package-session resolution. When disabled, `/api/auth/*` returns
404, package cookies cannot authorize protected routes, and legacy login/recovery remain available.
The deployment workflow passes the validated API flag as an explicit Wrangler version variable so the committed
disabled default cannot override an approved activation.

The check reports variable names only and never prints values. Enabling the flag changes public production behavior and
must go through a reviewed release pull request and the existing GitHub Actions deployment.

## Local verification

```bash
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:migrate:local
pnpm dev
```

Open `http://localhost:4321/auth-pilot/`. Confirm the legacy `/login/` flow still works before and after the pilot. The
package intentionally refuses to surface a local code; use configured development email delivery when exercising the
package flow.

## Required real-origin evidence

Record evidence without including the email code, cookie value, session token, credential public key, secret, or owner
recovery value:

Use [the package-authentication pilot evidence record](auth-package-pilot-evidence.md) to separate verified production
facts from pending operator ceremonies. Do not mark an item complete from local tests, a provider request, or an
aggregate database count alone.

1. The approved and an unapproved email receive the same generic browser response; only the approved address receives
   the transactional message.
2. A correct code creates a package session; an incorrect and an expired code fail; attempt and request limits activate
   without changing the outward code-request response.
3. A hostile `Origin` is rejected while the same-origin proxy succeeds.
4. The package session opens `/dashboard/` through SSR, then sign-out removes that access.
5. Two browser profiles sign in; one uses **Revoke other package sessions** and the other loses access.
6. A passkey is registered and used to sign in from a real browser on `observatory.santi020k.com` with user verification.
7. The existing legacy email login, legacy passkey, and `OWNER_PASSCODE` recovery still work independently.
8. Aggregate D1 counts and the exact deployed commit confirm activity in the package tables without exposing identity or
   credential records.

After verification, disable the pilot flag if the compatibility window is not proceeding immediately. A rollback only
needs the last verified deployment with the flag disabled; the additive tables can remain unused. Never delete legacy or
package identity data as part of rollback.
