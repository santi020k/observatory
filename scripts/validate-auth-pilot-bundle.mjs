import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const bundleDirectory = resolve(import.meta.dirname, '../vendor/auth-v0.4.0')
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const readText = async path => await readFile(path, 'utf8')

const gitEnvironment = Object.fromEntries(Object.entries(process.env).filter(
  ([key]) => !['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_WORK_TREE'].includes(key)
))

const parseJsonRecord = (text, label) => {
  const value = JSON.parse(text)

  if (!isRecord(value)) throw new Error(`${label} must contain a JSON object`)

  return value
}

const readChecksums = text => new Map(text
  .split('\n')
  .filter(Boolean)
  .map(line => {
    const match = /^([a-f0-9]{64}) {2}([^/]+\.tgz)$/u.exec(line)

    if (!match) throw new Error(`Invalid SHA256SUMS line: ${line}`)

    return [match[2], match[1]]
  }))

const requiredString = (record, key, label) => {
  const value = record[key]

  if (typeof value !== 'string' || value === '')
    throw new Error(`${label}.${key} must be a non-empty string`)

  return value
}

const readManifest = async directory => {
  const manifest = parseJsonRecord(
    await readText(resolve(directory, 'pilot-bundle.json')),
    'pilot-bundle.json'
  )

  const source = manifest.source
  const packages = manifest.packages
  const version = requiredString(manifest, 'version', 'pilot-bundle.json')

  if (manifest.kind !== '@santi020k/auth-pilot-bundle' || manifest.schemaVersion !== 1)
    throw new Error('Unsupported Auth pilot bundle manifest')

  if (!isRecord(source) || !/^[a-f0-9]{40}$/u.test(requiredString(source, 'commit', 'source')))
    throw new Error('Auth pilot bundle source commit is invalid')

  if (requiredString(source, 'repository', 'source') !== 'https://github.com/santi020k/auth')
    throw new Error('Auth pilot bundle source repository is invalid')

  if (!Array.isArray(packages) || packages.length === 0)
    throw new Error('Auth pilot bundle has no packages')

  return { packages, source, version }
}

const validatePackage = async ({
  checksumEntries,
  directory,
  entry,
  packageNames,
  version
}) => {
  if (!isRecord(entry)) throw new Error('Auth pilot bundle package entry is invalid')

  const filename = requiredString(entry, 'filename', 'package')
  const name = requiredString(entry, 'name', filename)
  const packageVersion = requiredString(entry, 'version', filename)
  const expectedHash = requiredString(entry, 'sha256', filename)
  const archivePath = resolve(directory, filename)

  if (packageNames.has(name)) throw new Error(`Duplicate Auth package name: ${name}`)

  if (packageVersion !== version) throw new Error(`${filename} version does not match the bundle`)

  if (checksumEntries.get(filename) !== expectedHash)
    throw new Error(`${filename} checksum manifest mismatch`)

  const actualHash = createHash('sha256').update(await readFile(archivePath)).digest('hex')

  if (actualHash !== expectedHash) throw new Error(`${filename} checksum verification failed`)

  const packageManifest = parseJsonRecord(execFileSync(
    'tar', ['-xOzf', archivePath, 'package/package.json'], { encoding: 'utf8' }
  ), `${filename} package.json`)

  if (packageManifest.name !== name || packageManifest.version !== packageVersion)
    throw new Error(`${filename} package identity does not match the bundle manifest`)

  packageNames.add(name)

  return filename
}

export const validateAuthPilotBundle = async (directory = bundleDirectory) => {
  const { packages, source, version } = await readManifest(directory)
  const checksumEntries = readChecksums(await readText(resolve(directory, 'SHA256SUMS')))
  const files = (await readdir(directory)).filter(file => file.endsWith('.tgz')).sort()
  const manifestFiles = []
  const packageNames = new Set()

  for (const entry of packages) {
    manifestFiles.push(await validatePackage({
      checksumEntries,
      directory,
      entry,
      packageNames,
      version
    }))
  }

  if (checksumEntries.size !== packages.length)
    throw new Error('SHA256SUMS entry count does not match the bundle manifest')

  if (files.join('\n') !== manifestFiles.sort().join('\n'))
    throw new Error('Tarball files do not match the bundle manifest')

  return {
    packageCount: packages.length,
    sourceCommit: source.commit,
    sourceRepository: source.repository,
    version
  }
}

export const validateAuthPilotSource = async (
  bundleResult,
  directory = bundleDirectory
) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'observatory-auth-source-'))
  const sourceDirectory = resolve(temporaryDirectory, 'auth')
  const rebuiltDirectory = resolve(temporaryDirectory, 'bundle')

  try {
    execFileSync('git', ['init', '--quiet', sourceDirectory], { env: gitEnvironment })

    execFileSync('git', [
      '-C', sourceDirectory, 'remote', 'add', 'origin', bundleResult.sourceRepository
    ], { env: gitEnvironment })

    execFileSync('git', [
      '-C', sourceDirectory, 'fetch', '--depth', '1', 'origin', bundleResult.sourceCommit
    ], { env: gitEnvironment, stdio: 'inherit' })

    execFileSync('git', [
      '-C', sourceDirectory, 'checkout', '--detach', '--quiet', 'FETCH_HEAD'
    ], { env: gitEnvironment })

    execFileSync('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], {
      cwd: sourceDirectory,
      env: gitEnvironment,
      stdio: 'inherit'
    })

    const installPatch = execFileSync('git', [
      '-C', sourceDirectory, 'diff', '--binary', '--no-ext-diff'
    ], { env: gitEnvironment })

    if (installPatch.length > 0) {
      execFileSync('git', [
        '-C', sourceDirectory, 'apply', '--reverse', '--whitespace=nowarn'
      ], { env: gitEnvironment, input: installPatch })
    }

    const sourceStatus = execFileSync('git', [
      '-C', sourceDirectory, 'status', '--porcelain', '--untracked-files=normal'
    ], { encoding: 'utf8', env: gitEnvironment }).trim()

    if (sourceStatus)
      throw new Error(`Pinned Auth checkout is not clean after install: ${sourceStatus}`)

    execFileSync('pnpm', ['pilot:pack', '--', rebuiltDirectory], {
      cwd: sourceDirectory,
      env: gitEnvironment,
      stdio: 'inherit'
    })

    for (const filename of ['SHA256SUMS', 'pilot-bundle.json']) {
      const [committed, rebuilt] = await Promise.all([
        readText(resolve(directory, filename)),
        readText(resolve(rebuiltDirectory, filename))
      ])

      if (committed !== rebuilt)
        throw new Error(`${filename} does not match a clean build of the pinned Auth commit`)
    }
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true })
  }
}

const run = async () => {
  const result = await validateAuthPilotBundle()

  await validateAuthPilotSource(result)

  process.stdout.write(
    `Verified ${String(result.packageCount)} Auth v${result.version} packages by rebuilding ${result.sourceCommit}.\n`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await run()
