# Contributing

Thanks for helping improve Observatory. The repository is source-available rather than open source;
contributions are accepted under the terms in [LICENSE](LICENSE).

## Before contributing

- Do not include credentials, access tokens, private analytics, production data, customer information,
  or screenshots of the authenticated dashboard.
- Open a private security advisory for suspected vulnerabilities instead of a public issue.
- Keep changes focused and preserve the separation between public collection, private data, and
  owner-authenticated routes.

## Local development

Requirements are Node.js 22.22.3 or newer and pnpm 11.

```bash
pnpm install
pnpm setup:local
pnpm db:migrate:local
pnpm dev
```

The setup script creates local, ignored configuration. Do not commit `.env`, `.dev.vars`, local D1
databases, or generated Worker state.

## Quality and pull requests

Run the complete gate before opening a pull request:

```bash
pnpm verify
```

Use Conventional Commits, include tests and documentation for behavior changes, and add a Changeset
for release-relevant changes. By submitting an issue, suggestion, or pull request, you agree that the
contribution becomes part of Observatory under the repository license.
