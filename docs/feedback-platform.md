# Shared feedback platform

Observatory is the control plane for feedback across Santiago Molina's products.
Product repositories own their customer-facing presentation; Observatory owns
the reusable contract, storage, security controls, moderation, and delivery
workflow.

## Registered projects

Projects and their permitted browser origins and locales are declared in
`packages/catalog`. The current projects are `postlens`, `roadscore`, and
`between-contractions`. Adding another product requires a catalog entry and a
branded client implementation; it does not require another admin application or
database.

## Public contract

Public routes live below `/feedback/projects/:projectSlug`:

- `GET /config` returns public project and Turnstile configuration.
- `GET /items` returns approved, public ideas only.
- `POST /items` accepts an idea, bug, or private message.
- `POST /items/:itemId/vote` toggles support using a hashed browser identifier.

Website submissions require a matching registered origin, a supported locale,
bounded text fields, rate-limit capacity, and a valid Turnstile result in
production. Native bug reports may attach bounded, person-initiated diagnostic
text. No route accepts files, images, contraction records, photo identifiers, or
embedded media metadata.

## Private contract

Owner-authenticated routes below `/feedback/admin` list, update, and permanently
delete feedback. The Observatory web app provides a portfolio inbox and one
kanban per project. Pointer users can drag cards; keyboard users can perform the
same status changes with the labeled Status control.

Moderation, delivery status, and visibility are distinct:

- moderation decides whether an idea is approved or rejected;
- status moves work from inbox through review, planning, implementation,
  release, or closure;
- visibility decides whether an approved idea can appear publicly;
- non-idea records are always private regardless of requested visibility.

## Deployment

Apply Observatory's D1 migrations, configure owner authentication, and set
`FEEDBACK_HASH_SECRET`, `TURNSTILE_SITE_KEY`, and `TURNSTILE_SECRET_KEY` on the
API Worker. The Worker owns each product's specific `/api/feedback/*` route, so
production clients remain same-origin. Deploy the Observatory contract before a
product client that depends on a new contract version.
