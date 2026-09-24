# Changelog

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
