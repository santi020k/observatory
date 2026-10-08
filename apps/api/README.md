<p align="center">
  <a href="../../README.md">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/readme/workspace-dark.svg">
      <img src="../../docs/assets/readme/workspace-light.svg" alt="Observatory — Project signals. A clearer next move." width="1200" height="220">
    </picture>
  </a>
</p>

<h1 align="center">API</h1>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-source_available-956423?style=flat-square" alt="License: source available"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/built_with-Hono-6319be?style=flat-square" alt="Built With: Hono"></a>
</p>

<p align="center">
  <a href="../../README.md">Project overview</a> ·
  <a href="package.json">Package manifest</a> ·
  <a href="#resources">Resources</a>
</p>

**On this page:** [Responsibility](#responsibility) · [Workspace commands](#workspace-commands) · [Resources](#resources)

Authentication, collection, and feedback operations for Observatory.

## Responsibility

The Hono Worker owns authentication, provider access, scheduled collection, and writes.
The web dashboard consumes this API rather than calling providers or D1 directly.
Public feedback routes remain project-scoped; owner data and private reports remain protected.

Follow the [root local setup](../../README.md#local-setup) before starting the Worker.
It covers development secrets, GitHub setup, and local migrations. Routes live in
[src/routes](src/routes), provider integrations in [src/lib](src/lib), and runtime types in
[src/env.ts](src/env.ts).

## Workspace commands

Run from the repository root after its documented setup. Use the Node.js and pnpm versions
declared in the root [package.json](../../package.json).

| Task                            | Command                                                   |
| ------------------------------- | --------------------------------------------------------- |
| Start local development         | `pnpm --filter @santi020k/observatory-api run dev`        |
| Build or compile this workspace | `pnpm --filter @santi020k/observatory-api run build`      |
| Lint this workspace             | `pnpm --filter @santi020k/observatory-api run lint`       |
| Check types                     | `pnpm --filter @santi020k/observatory-api run type-check` |
| Run workspace diagnostics       | `pnpm --filter @santi020k/observatory-api run check`      |
| Run workspace tests             | `pnpm --filter @santi020k/observatory-api run test`       |

## Resources

[Project overview](../../README.md) · [Contributing](../../CONTRIBUTING.md) · [License](../../LICENSE) · [Architecture](../../docs/architecture.md) · [Feedback platform](../../docs/feedback-platform.md) · [Private projects](../../docs/private-projects.md)
