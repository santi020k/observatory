<p align="center">
  <a href="../../README.md">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/readme/workspace-dark.svg">
      <img src="../../docs/assets/readme/workspace-light.svg" alt="Observatory — Project signals. A clearer next move." width="1200" height="220">
    </picture>
  </a>
</p>

<h1 align="center">Database</h1>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-source_available-956423?style=flat-square" alt="License: source available"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/workspace-Private-6319be?style=flat-square" alt="Workspace: Private"></a>
</p>

<p align="center">
  <a href="../../README.md">Project overview</a> ·
  <a href="package.json">Package manifest</a> ·
  <a href="#resources">Resources</a>
</p>

**On this page:** [Responsibility](#responsibility) · [Workspace commands](#workspace-commands) · [Resources](#resources)

Drizzle schema and typed D1 access for Observatory.

## Responsibility

The [schema](src/schema.ts) and [query entry](src/index.ts) define Observatory persistence.
Import through `@santi020k/observatory-db`. Helpers accept a D1 client rather than creating a
global connection; the API owns authorization, collection, migration execution, and writes.
Schema changes must preserve the public/private data boundaries and existing history.

## Workspace commands

Run from the repository root after its documented setup. Use the Node.js and pnpm versions
declared in the root [package.json](../../package.json).

| Task                            | Command                                                  |
| ------------------------------- | -------------------------------------------------------- |
| Build or compile this workspace | `pnpm --filter @santi020k/observatory-db run build`      |
| Lint this workspace             | `pnpm --filter @santi020k/observatory-db run lint`       |
| Check types                     | `pnpm --filter @santi020k/observatory-db run type-check` |
| Run workspace tests             | `pnpm --filter @santi020k/observatory-db run test`       |

## Resources

[Project overview](../../README.md) · [Contributing](../../CONTRIBUTING.md) · [License](../../LICENSE) · [Architecture](../../docs/architecture.md) · [Feedback platform](../../docs/feedback-platform.md) · [Private projects](../../docs/private-projects.md)
