<p align="center"><a href="../../README.md">Observatory</a></p>

<h1 align="center">Project catalog</h1>

<p align="center">
  <a href="../../README.md">Project overview</a> ·
  <a href="package.json">Package manifest</a> ·
  <a href="#resources">Resources</a>
</p>

**On this page:** [Responsibility](#responsibility) · [Workspace commands](#workspace-commands) · [Resources](#resources)

Product metadata and source mappings for Observatory.

## Responsibility


The [source entry](src/index.ts) owns product metadata, categories, and provider source mappings.
Import through `@santi020k/observatory-catalog`. Keep catalog data separate from collected metrics
and authentication policy. Provider availability is verified by collection, not inferred from a
catalog entry.

## Workspace commands

Run from the repository root after its documented setup. Use the Node.js and pnpm versions
declared in the root [package.json](../../package.json).

| Task | Command |
| --- | --- |
| Build or compile this workspace | `pnpm --filter @santi020k/observatory-catalog run build` |
| Lint this workspace | `pnpm --filter @santi020k/observatory-catalog run lint` |
| Check types | `pnpm --filter @santi020k/observatory-catalog run type-check` |
| Run workspace tests | `pnpm --filter @santi020k/observatory-catalog run test` |

## Resources

[Project overview](../../README.md) · [Contributing](../../CONTRIBUTING.md) · [License](../../LICENSE) · [Architecture](../../docs/architecture.md) · [Feedback platform](../../docs/feedback-platform.md) · [Private projects](../../docs/private-projects.md)
