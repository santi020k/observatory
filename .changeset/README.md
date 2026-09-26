# Changesets

Every user-visible feature, fix, or release-relevant maintenance change should
include a Changeset describing its impact. Observatory's five private workspace
packages are versioned together and remain unpublished to npm; the release script
then synchronizes the private root manifest to that version.

Run `pnpm changeset` while preparing a change. The release branch consumes all
pending files with `pnpm release:version`, then updates the root `CHANGELOG.md`
with the combined release notes before opening the pull request to `main`.
`pnpm changeset:status` previews pending version bumps; `pnpm release:status`
confirms that no Changesets remain before publication.
