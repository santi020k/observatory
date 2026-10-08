import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const formatsRequire = createRequire(
  import.meta.resolve('@santi020k/eslint-config-formats'),
)

const markdownRequire = createRequire(
  formatsRequire.resolve('@eslint/markdown'),
)

const mathRequire = createRequire(
  markdownRequire.resolve('micromark-extension-math'),
)

const katexPath = mathRequire.resolve('katex')
const katexRequire = createRequire(katexPath)

const esm = await import(
  pathToFileURL(katexRequire.resolve('./katex.mjs')).href
)

const renderers = [
  ['CommonJS', mathRequire('katex')],
  ['ES module', esm.default],
  ['minified', katexRequire('./katex.min.js')],
]

const untrustedLink = String.raw`\href{javascript:alert(1)}{x}`

const withPrototypeProperty = (name, value, action) => {
  const original = Object.getOwnPropertyDescriptor(Object.prototype, name)

  try {
    Object.defineProperty(Object.prototype, name, {
      configurable: true,
      value,
      writable: true,
    })

    return action()
  } finally {
    if (original) Object.defineProperty(Object.prototype, name, original)
    else Reflect.deleteProperty(Object.prototype, name)
  }
}

for (const [name, renderer] of renderers) {
  test(`${name}: inherited trust cannot enable unsafe links`, () => {
    const inherited = renderer.renderToString(
      untrustedLink,
      Object.create({ trust: true }),
    )

    const polluted = withPrototypeProperty('trust', true, () =>
      renderer.renderToString(untrustedLink),
    )

    assert.doesNotMatch(inherited, /<a href=/)

    assert.doesNotMatch(polluted, /<a href=/)
  })

  test(`${name}: inherited schema defaults cannot enable unsafe links`, () => {
    const html = withPrototypeProperty('default', true, () =>
      renderer.renderToString(untrustedLink),
    )

    assert.doesNotMatch(html, /<a href=/)
  })

  test(`${name}: inherited processors cannot override explicit trust`, () => {
    const html = withPrototypeProperty(
      'processor',
      () => true,
      () => renderer.renderToString(untrustedLink, { trust: false }),
    )

    assert.doesNotMatch(html, /<a href=/)
  })

  test(`${name}: inherited built-in macros are rejected`, () => {
    const html = withPrototypeProperty('\\pollutedmacro', 'x', () =>
      renderer.renderToString(String.raw`\pollutedmacro`, {
        throwOnError: false,
      }),
    )

    assert.match(html, /class="katex-error"/)

    assert.match(html, />\\pollutedmacro<\/span>$/)
  })

  test(`${name}: ordinary math and explicit trusted links remain supported`, () => {
    assert.match(
      renderer.renderToString(String.raw`\frac{a}{b} + x^2`),
      /class="katex"/,
    )

    assert.match(
      renderer.renderToString(
        String.raw`\href{https://santi020k.com}{Santiago}`,
        {
          trust: true,
        },
      ),
      /<a href="https:\/\/santi020k\.com"/,
    )
  })
}
