<p align="center">
  <a href="../../README.md">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/readme/workspace-dark.svg">
      <img src="../../docs/assets/readme/workspace-light.svg" alt="Observatory — Project signals. A clearer next move." width="1200" height="220">
    </picture>
  </a>
</p>

<h1 align="center">Website</h1>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-source_available-956423?style=flat-square" alt="License: source available"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/built_with-Astro-6319be?style=flat-square" alt="Built With: Astro"></a>
</p>

<p align="center">
  <a href="../../README.md">Project overview</a> ·
  <a href="package.json">Package manifest</a> ·
  <a href="#resources">Resources</a>
</p>

**On this page:** [Responsibility](#responsibility) · [Workspace commands](#workspace-commands) · [Resources](#resources)

The owner-facing portfolio operations dashboard.

## Responsibility

The Astro SSR app uses Lumen for navigation, tables, charts, and forms. Its server-side API
client and proxies call the [Worker](../api/README.md); the browser never receives provider secrets.

Complete [local setup](../../README.md#local-setup) and run both web and API services.
Pages live in [src/pages](src/pages), the shell in [src/layouts](src/layouts), and API
integration in [src/lib](src/lib). Use synthetic data for interface verification.

## Workspace commands

Run from the repository root after its documented setup. Use the Node.js and pnpm versions
declared in the root [package.json](../../package.json).

| Task                            | Command                                                   |
| ------------------------------- | --------------------------------------------------------- |
| Start local development         | `pnpm --filter @santi020k/observatory-web run dev`        |
| Build or compile this workspace | `pnpm --filter @santi020k/observatory-web run build`      |
| Lint this workspace             | `pnpm --filter @santi020k/observatory-web run lint`       |
| Check types                     | `pnpm --filter @santi020k/observatory-web run type-check` |
| Run workspace diagnostics       | `pnpm --filter @santi020k/observatory-web run check`      |
| Run workspace tests             | `pnpm --filter @santi020k/observatory-web run test`       |

## Resources

[Project overview](../../README.md) · [Contributing](../../CONTRIBUTING.md) · [License](../../LICENSE) · [Architecture](../../docs/architecture.md) · [Feedback platform](../../docs/feedback-platform.md) · [Private projects](../../docs/private-projects.md)
