# Observatory — Agent Instructions

Observatory is Santiago Molina's private project analytics control room.

## Architecture

- `apps/web`: Astro SSR dashboard using `@santi020k/lumen-astro`
- `apps/api`: Hono Cloudflare Worker, email-code authentication, sync orchestration
- `packages/api-types`: shared Zod request/response contracts
- `packages/db`: Drizzle D1 schema and query helpers
- `packages/catalog`: product metadata and source mappings

## Boundaries

- The web app never calls GitHub, npm, Resend, or D1 directly.
- The API owns authentication, authorization, collection, and writes.
- Database helpers accept a D1 client; packages do not create global clients.
- Public-source collection and private-source collection stay separate.
- Private project names or metrics must never be returned unless the authenticated owner requests them.

## UI

- Use Lumen Astro components and semantic tokens.
- Import Lumen CSS and mount `UIPrimitives` once in the root layout.
- Preserve keyboard paths, visible focus, and reduced-motion behavior.

## Quality

Run `pnpm verify`. Lint, Astro check, type-check, tests, Astro Doctor, and build must pass.
