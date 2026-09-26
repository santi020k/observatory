import { readFile, writeFile } from 'node:fs/promises'

const rootManifestPath = new URL('../package.json', import.meta.url)

const workspaceManifestPaths = [
  new URL('../apps/api/package.json', import.meta.url),
  new URL('../apps/web/package.json', import.meta.url),
  new URL('../packages/api-types/package.json', import.meta.url),
  new URL('../packages/catalog/package.json', import.meta.url),
  new URL('../packages/db/package.json', import.meta.url)
]

const readManifest = async path => JSON.parse(await readFile(path, 'utf8'))

const workspaceManifests = await Promise.all(
  workspaceManifestPaths.map(readManifest)
)

const versions = new Set(workspaceManifests.map(manifest => manifest.version))

if (versions.size !== 1)
  throw new Error('Workspace packages must share one release version.')

const [version] = versions

if (typeof version !== 'string' || version.length === 0)
  throw new Error('Workspace release version is missing.')

const rootManifest = await readManifest(rootManifestPath)

rootManifest.version = version

await writeFile(
  rootManifestPath,
  `${JSON.stringify(rootManifest, null, 2)}\n`,
  'utf8'
)

console.log(`Synchronized root package to ${version}.`)
