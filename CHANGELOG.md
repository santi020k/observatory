# Changelog

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
