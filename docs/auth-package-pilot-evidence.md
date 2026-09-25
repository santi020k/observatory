# Package-authentication pilot evidence

This record tracks the bounded Observatory package-authentication pilot on its final HTTPS origin. It deliberately
omits email addresses, verification codes, cookies, session tokens, credential identifiers, public keys, recovery
values, and raw identity records. A checked item means the stated evidence was observed against the referenced
production revision; an unchecked item remains a release blocker.

## Deployment record

- Date: 2026-09-25
- Merged revision: `b637b7617510dc54b57839747507bd5083b75718`
- Package candidate: Auth v0.4.0 from `79df2175b91281728ca56f39daaa05d098eb0eee`
- Consumer pull request: [santi020k/observatory#21](https://github.com/santi020k/observatory/pull/21)
- Disabled deployment: [run 36178959083](https://github.com/santi020k/observatory/actions/runs/36178959083)
- Activation deployment: [run 36179654010](https://github.com/santi020k/observatory/actions/runs/36179654010)

Both deployments completed the repository verification gate, applied the additive migration through the existing
migration journal, and deployed the API and web Workers from the merged revision. The activation used coordinated
API and web flags. Legacy login, legacy passkeys, owner recovery, cookies, and tables remain available.

## Verified automated evidence

- [x] The disabled API and same-origin proxy returned `404`, while `/login/` remained available.
- [x] The disabled pilot page redirected to `/login/`.
- [x] The activated pilot page and anonymous package-session request returned `200`.
- [x] An unapproved address received the generic code-request response without revealing authorization state.
- [x] An unsafe request with a hostile `Origin` was rejected with `403`.
- [x] An approved owner request received the same generic HTTP `200` response.
- [x] Aggregate D1 inspection after the request showed no package users, sessions, or passkeys. Verification rows were
      present; no identity or credential row was read.

The approved request proves only that the application accepted and scheduled the provider operation. It does not prove
mailbox receipt or a completed sign-in.

## Pending operator evidence

- [ ] The approved mailbox receives the branded transactional email; the unapproved mailbox does not.
- [ ] A wrong code and an expired code fail without creating a session.
- [ ] Attempt and request limits activate without changing the outward code-request response.
- [ ] A valid code creates a package session and opens the dashboard through server-side rendering.
- [ ] Sign-out removes package access without affecting legacy authentication.
- [ ] Two browser profiles sign in; revoking other package sessions removes the second profile's access.
- [ ] A platform passkey registers with user verification on `observatory.santi020k.com`.
- [ ] After sign-out, that package passkey signs in successfully on the same relying-party origin.
- [ ] A canceled or failed user-verification ceremony creates no package session.
- [ ] Legacy email login, legacy passkey login, and owner recovery still work independently.
- [ ] Final aggregate counts and the deployed revision are recorded after the ceremonies without reading sensitive rows.
- [ ] Rollback is rehearsed by setting both pilot flags to `false`, redeploying, and confirming the pilot routes close
      while legacy authentication remains available; additive package tables remain intact.

## Publication gate

This record is incomplete and does not satisfy the Auth package publication gate. It becomes eligible consumer
evidence only after every operator item above is completed and reviewed. A second, isolated consumer must complete the
same real-origin requirements before the unpublished Auth packages can become public.
