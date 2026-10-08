# Dependency security maintenance

Use `pnpm audit --prod` for the deployed dependency boundary and `pnpm audit` for
the complete development graph. The release gate runs the production audit;
tooling findings still need an explicit fix or explanation.

## Compatible transitive fixes

Two narrow overrides replace vulnerable upstream pins with stable patch releases:

- `sharp` 0.35.0–0.35.4 resolves to 0.35.5 for
  [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- `source-map-js` 1.0.0–1.2.1 resolves to 1.2.2 for
  [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

They retain the same dependency major/minor lines. Remove an override after all
parent packages select a patched version themselves and the production audit
still passes.

## KaTeX prototype-pollution backport

ESLint's Markdown parser reaches `katex@0.16.47` through
`@eslint/markdown` and `micromark-extension-math`. The math extension still
requires the 0.16 line. Observatory applies a pnpm patch for
[GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7)
instead of replacing that contract with a different 0.x release.

The backport follows the own-property checks in upstream
[commit 0adf7e7](https://github.com/KaTeX/KaTeX/commit/0adf7e77db6915d991803b29699f82b1ccf8d4f4).
Inherited `trust`, schema `default`, schema `processor`, and built-in macro
properties cannot change the renderer's settings. The patch covers source,
CommonJS, ES module, and minified entry points. It preserves ordinary math,
explicit trusted links, and the package's existing MIT license.

Source provenance:

- Original package: `katex@0.16.47`, from the npm registry.
- Original archive: `https://registry.npmjs.org/katex/-/katex-0.16.47.tgz`.
- Original SHA-512 integrity:
  `sha512-Eeo8Ys1doU1z+x8AZsPpQu+p/QcZBI5PeOo7QGQdy2x2m0MU/hYagBbGOmXwr5KVbEfVuWv9LpnQWeehogurjg==`.
- Local patch: `patches/katex@0.16.47.patch`, applied through
  `patchedDependencies` in `pnpm-workspace.yaml`.

To regenerate from an unpatched package in a fresh temporary directory:

```bash
pnpm patch katex@0.16.47 --ignore-existing --edit-dir /tmp/observatory-katex-patch
node scripts/patch-katex-settings.mjs /tmp/observatory-katex-patch
pnpm patch-commit /tmp/observatory-katex-patch --patches-dir patches
node --test scripts/dependency-security.test.mjs
```

The generator rejects unexpected package versions and unexpected source text.
Regression tests resolve KaTeX through the actual installed Markdown dependency
chain and cover all three JavaScript entry points. The original 0.16.47 renderer
was also checked to reproduce the inherited-trust exploit before this backport.

Registry audits compare package versions and can still report this advisory for
the patched 0.16.47 package. The advisory is not suppressed. The installed-code
regressions are the evidence for this mitigation; a clean version scan alone
would not establish it.

Remove the patch and its generator when the Markdown extension adopts an upstream
fixed KaTeX line. Retain the behavioral regressions and rerun the complete
repository gate after updating the lockfile.

## Upstream peer metadata

`pnpm peers check` currently reports two constraints in the latest owned ESLint
presets' dependencies:

- `eslint-plugin-jsx-a11y@6.10.2` declares ESLint support through major 9 while the
  owned presets require ESLint 10.
- `eslint-plugin-tsdoc@0.5.4` pins `@typescript-eslint/utils` to `~8.56.0`, whose
  TypeScript peer range excludes the repository's TypeScript 6.0.3.

These warnings are not suppressed with `allowedVersions` or altered package
metadata. Upgrade their parent packages when compatible releases become
available; repository lint and type checks remain required. TypeScript 7 is
deliberately deferred because Astro Check and the owned ESLint presets do not
yet support it.
