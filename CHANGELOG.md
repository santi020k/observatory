# Changelog

## 0.5.0 - 2026-09-27

### Changed

- Promoted the published Auth 0.5 packages to Observatory's primary email-code, session, passkey,
  and sign-out flow while preserving the consumer-owned emergency recovery path.
- Replaced the vendored Auth pilot and feature flags with bounded same-origin authentication and
  backend proxies backed by exact split-origin configuration validation.
- Published the repository under the Santi020k source-available license and separated unprivileged
  source verification from production deployment credentials.
- Kept passkey failures actionable for users while retaining technical diagnostics outside rendered
  product copy.

### Security

- Preserved existing authentication tables and recovery sessions for rollback safety while moving
  primary authentication to the application-local Auth tables already deployed in D1.
- Removed obsolete vendored package archives and their bundle-validation surface in favor of exact
  published Auth 0.5 dependencies.

## 0.4.1 - 2026-09-27

### Added

- Added Google Play analytics collection for the verified RoadScore Android listing.
- Recorded verified and pending production evidence for the isolated Auth v0.4 pilot without
  including sensitive authentication data.

### Changed

- Replaced raw passkey ceremony failures with actionable sign-in and registration guidance while
  retaining technical diagnostics outside user-facing copy.

## 0.4.0 - 2026-09-26

### Added

- Added the disabled-by-default Auth v0.4 pilot with a same-origin web proxy, app-owned D1 schema,
  pinned bundle provenance checks, configuration validation, and rollback guidance.
- Accepted shared Auth sessions additively while retaining the existing email-code, passkey,
  recovery-code, and legacy-session paths.
- Added dedicated store intelligence pages for every published app and verified Google Play
  listings for Lumen Playground and Between Contractions.
- Added asynchronous owner email notifications for newly stored product feedback.
- Added Changesets-based release intent and synchronized fixed-version workspace releases.
- Added structured bug and feature request forms plus a repository security policy.

### Changed

- Restored the branded Observatory login composition and improved authentication status placement,
  accessibility, and responsive behavior across phone, tablet, and desktop layouts.
- Recognized the current App Store Connect download and installation report names while preserving
  compatibility with the previous aliases.
- Reworked the published-app overview and empty-report states around compact Lumen components,
  clearer provider status, listing links, and responsive layouts.
- Updated the GitHub Actions checkout and artifact upload actions to their current major releases.

### Security

- Gated the Auth pilot independently at the API, proxy, UI, and session-resolution boundaries so it
  remains inactive until the production rollout requirements are satisfied.
- Revoked shared and legacy sessions together without weakening the existing owner-only recovery
  path.

## 0.3.1 - 2026-09-24

### Changed

- Tightened the verification screen hierarchy and spacing across desktop and mobile layouts.
- Reworded the verification actions to make the next step and alternate-email path clearer.
- Replaced the sign-in email placeholder with a neutral example address.

## 0.3.0 - 2026-09-24

### Added

- Made single-use email verification codes the primary Observatory sign-in path while preserving
  passkey and recovery-code alternatives.
- Added per-client request throttling backed by hashed identities so new login and recovery
  rate-limit records do not persist raw IP addresses.

### Changed

- Mask the authorized email address on the code verification screen and clarify the 30-day session
  behavior.

### Security

- Count both authorized and unauthorized code requests without revealing which email owns the
  Observatory account.
- Ensure legacy recovery-attempt identities age out after 24 hours even when a scheduled analytics
  collection fails.

## 0.2.1 - 2026-09-24

### Changed

- Replaced the production deployment's long-lived Infisical token with short-lived GitHub OIDC
  authentication through the shared read-only machine identity.
- Use the Infisical CLI for OIDC exchange so deployment remains compatible with the repository's
  restricted GitHub Actions allowlist.
- Keep pre-provisioned Worker routes out of routine deployments so the CI token remains scoped to
  Worker, KV, and D1 changes.

### Security

- Removed the GitHub-hosted Infisical bootstrap credential from the deployment path.

## 0.2.0 - 2026-09-24

### Added

- App Store Connect and Google Play reporting for authenticated portfolio owners.
- Store performance summaries and project-level trends in the Observatory dashboard.
- Provider contract tests for report selection, overlapping data, encoding, and token endpoints.

### Changed

- Upgraded the workspace to Astro 7.3, the current Cloudflare adapter, Wrangler 4.137, and Vite 8.3.
- Enforced release-tag alignment across every workspace manifest before GitHub releases are published.
- Added a production dependency audit to the canonical verification gate.

### Security

- Patched all known production dependency advisories reported by the package registry.
- Restricted Google service-account token exchange to the official OAuth endpoint.
