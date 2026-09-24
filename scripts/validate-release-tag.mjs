import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const semanticVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*))*)?(?:\+[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?$/u

const parseManifest = (contents, path) => {
  const manifest = JSON.parse(contents)

  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    typeof manifest.name !== 'string' ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error(`${path} must contain string name and version fields.`)
  }

  return { name: manifest.name, path, version: manifest.version }
}

export const validateReleaseTag = (tag, manifests) => {
  if (!tag.startsWith('v') || !semanticVersionPattern.test(tag.slice(1))) {
    throw new Error(`Release tag "${tag}" must use the v<semver> format.`)
  }

  const expectedVersion = tag.slice(1)

  const mismatches = manifests.filter(
    (manifest) => manifest.version !== expectedVersion,
  )

  if (mismatches.length > 0) {
    const details = mismatches
      .map(
        (manifest) =>
          `${manifest.name} is ${manifest.version} (${manifest.path})`,
      )
      .join('; ')

    throw new Error(`Tag ${tag} does not match workspace versions: ${details}.`)
  }

  return expectedVersion
}

export const loadWorkspaceManifests = async (rootDirectory) => {
  const manifestPaths = [resolve(rootDirectory, 'package.json')]

  for (const workspaceDirectory of ['apps', 'packages']) {
    const directory = resolve(rootDirectory, workspaceDirectory)
    const entries = await readdir(directory, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) {
        manifestPaths.push(resolve(directory, entry.name, 'package.json'))
      }
    }
  }

  return Promise.all(
    manifestPaths.map(async (path) =>
      parseManifest(await readFile(path, 'utf8'), path),
    ),
  )
}

const main = async () => {
  const tag =
    process.argv.slice(2).find((argument) => argument !== '--') ??
    process.env.GITHUB_REF_NAME

  if (typeof tag !== 'string' || tag.length === 0) {
    throw new Error(
      'Provide a release tag argument or set the GITHUB_REF_NAME environment variable.',
    )
  }

  const rootDirectory = resolve(import.meta.dirname, '..')
  const manifests = await loadWorkspaceManifests(rootDirectory)
  const version = validateReleaseTag(tag, manifests)

  process.stdout.write(
    `Release tag v${version} matches ${manifests.length} workspace manifests.\n`,
  )
}

const entryPoint = process.argv[1]

if (
  typeof entryPoint === 'string' &&
  pathToFileURL(resolve(entryPoint)).href === import.meta.url
) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)

    process.stderr.write(`${message}\n`)

    process.exitCode = 1
  })
}
