# Security Policy

Observatory handles private operational data and authentication credentials. Do
not open a regular issue for a suspected vulnerability.

## Reporting a vulnerability

Use **Security → Advisories → Report a vulnerability** in this repository when
that option is available. Otherwise, email `hi@santi020k.com` with:

- a concise description and the affected revision or route;
- safe reproduction steps and the expected impact;
- any mitigation you have already identified.

Do not include real credentials, personal data, or destructive proof-of-concept
payloads. A complete report will be acknowledged as soon as practical, and the
fix and disclosure timeline will be coordinated privately.

## Supported versions

Only the current `main` branch and latest tagged release are supported. The
Cloudflare deployment remains an internal preview until the production database,
routes, and secrets described in the README are provisioned.
