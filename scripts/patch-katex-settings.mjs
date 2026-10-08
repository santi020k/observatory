import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Backport https://github.com/KaTeX/KaTeX/commit/0adf7e77db6915d991803b29699f82b1ccf8d4f4
// to the compatible 0.16 line, including its distributed JavaScript entry points.
const directory = process.argv[2]

assert.ok(directory, 'Pass the directory produced by pnpm patch katex@0.16.47')

const manifest = JSON.parse(
  readFileSync(resolve(directory, 'package.json'), 'utf8'),
)

assert.equal(manifest.name, 'katex')

assert.equal(manifest.version, '0.16.47')

const replace = (source, before, after, expected = 1) => {
  assert.equal(
    source.split(before).length - 1,
    expected,
    `Unexpected source: ${before}`,
  )

  return source.replaceAll(before, after)
}

for (const file of ['src/Settings.ts', 'dist/katex.js', 'dist/katex.mjs']) {
  const path = resolve(directory, file)
  let source = readFileSync(path, 'utf8')

  source = replace(
    source,
    'if (schema.default !== undefined)',
    'if (Object.prototype.hasOwnProperty.call(schema, "default") && schema.default !== undefined)',
  )

  source = replace(
    source,
    'options[prop];',
    'Object.prototype.hasOwnProperty.call(options, prop) ? options[prop] : undefined;',
  )

  source = replace(
    source,
    'schema.processor\n',
    '(Object.prototype.hasOwnProperty.call(schema, "processor") && schema.processor)\n',
    file.endsWith('.ts') ? 1 : 0,
  )

  if (!file.endsWith('.ts')) {
    source = replace(
      source,
      '? schema.processor ?',
      '? (Object.prototype.hasOwnProperty.call(schema, "processor") && schema.processor) ?',
    )
  }

  writeFileSync(path, source)
}

for (const file of ['src/Namespace.ts', 'dist/katex.js', 'dist/katex.mjs']) {
  const path = resolve(directory, file)
  let source = readFileSync(path, 'utf8')

  source = replace(
    source,
    'this.current.hasOwnProperty(name)',
    'Object.prototype.hasOwnProperty.call(this.current, name)',
    2,
  )

  source = replace(
    source,
    'this.builtins.hasOwnProperty(name)',
    'Object.prototype.hasOwnProperty.call(this.builtins, name)',
  )

  source = replace(
    source,
    'top.hasOwnProperty(name)',
    'Object.prototype.hasOwnProperty.call(top, name)',
  )

  source = replace(
    source,
    'undefs.hasOwnProperty(undef)',
    'Object.prototype.hasOwnProperty.call(undefs, undef)',
  )

  source = replace(
    source,
    'return this.builtins[name];',
    'return Object.prototype.hasOwnProperty.call(this.builtins, name) ? this.builtins[name] : undefined;',
  )

  source = replace(
    source,
    'top[name] = this.current[name];',
    'top[name] = Object.prototype.hasOwnProperty.call(this.current, name) ? this.current[name] : undefined;',
  )

  writeFileSync(path, source)
}

const minifiedPath = resolve(directory, 'dist/katex.min.js')
let minified = readFileSync(minifiedPath, 'utf8')

minified = replace(
  minified,
  'if(void 0!==e.default)return e.default',
  'if(Object.prototype.hasOwnProperty.call(e,"default")&&void 0!==e.default)return e.default',
)

minified = replace(
  minified,
  'const o=r[t];e[t]=void 0!==o?n.processor?n.processor(o):o:p(n)',
  'const o=Object.prototype.hasOwnProperty.call(r,t)?r[t]:void 0;e[t]=void 0!==o?Object.prototype.hasOwnProperty.call(n,"processor")&&n.processor?n.processor(o):o:p(n)',
)

minified = replace(
  minified,
  'this.current.hasOwnProperty(e)',
  'Object.prototype.hasOwnProperty.call(this.current,e)',
  2,
)

minified = replace(
  minified,
  'this.builtins.hasOwnProperty(e)',
  'Object.prototype.hasOwnProperty.call(this.builtins,e)',
)

minified = replace(
  minified,
  'this.current[e]:this.builtins[e]',
  'this.current[e]:Object.prototype.hasOwnProperty.call(this.builtins,e)?this.builtins[e]:void 0',
)

minified = replace(
  minified,
  't&&!t.hasOwnProperty(e)&&(t[e]=this.current[e])',
  't&&!Object.prototype.hasOwnProperty.call(t,e)&&(t[e]=Object.prototype.hasOwnProperty.call(this.current,e)?this.current[e]:void 0)',
)

minified = replace(
  minified,
  'for(const t in e)e.hasOwnProperty(t)',
  'for(const t in e)Object.prototype.hasOwnProperty.call(e,t)',
)

writeFileSync(minifiedPath, minified)
