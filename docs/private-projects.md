# Private projects — phase specification

[Project overview](../README.md) · [Architecture](architecture.md) ·
[Data visualization](visualization-roadmap.md)

Private-source collection remains planned. The current application does not collect private
repository names, metrics, or credentials. This specification defines the boundary for a future
implementation; it does not imply that a private-project dashboard or collector is connected.

## Phase 2 sources

### GitHub private repositories

- Install a dedicated GitHub App on selected repositories
- Read-only permissions: metadata, issues, pull requests, Actions, releases, and traffic
- Metrics: lead time, review latency, failure rate, Actions minutes, release frequency, stale work
- Store installation tokens only in Worker secrets or encrypted credential storage

### Cloudflare operations

- Scoped API token limited to selected accounts and zones
- Metrics: Worker requests/errors/CPU, Pages deployments, D1 rows read/written/storage, R2 operations,
  bandwidth, and estimated cost
- Treat account identifiers as secrets in browser responses

### Product outcomes

- Opt-in adapters for revenue, active users, retention, support load, and waitlists
- Aggregate before persistence where row-level customer data is unnecessary
- Never mix customer PII into project snapshots

## Data model extension

Add a `project_sources` table with encrypted provider configuration and a `visibility` guard on every
query. Private collectors write to the normalized snapshot model, but they run in a separate job and
route group. The dashboard requires both owner authentication and `visibility = private` capability
before returning those rows.

## Definition of done

- Provider credentials can be revoked without deleting historical metrics
- Every adapter documents scopes, retention, rate limits, and failure behavior
- Private project names never appear in logs, unauthenticated errors, or public-source sync output
- Export and hard-delete flows are available
- Security tests cover cross-source data leakage and expired sessions
