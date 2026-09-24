import { spawnSync } from 'node:child_process'

const run = (command, arguments_, options = {}) => spawnSync(
  command,
  arguments_,
  { encoding: 'utf8', ...options },
)

const configuredHooksPath = run(
  'git',
  ['config', '--local', '--get', 'core.hooksPath'],
)

if (configuredHooksPath.status === 0) {
  const hooksPath = configuredHooksPath.stdout.trim()

  if (hooksPath === '.husky/_') {
    const unsetLegacyHooks = run(
      'git',
      ['config', '--local', '--unset-all', 'core.hooksPath'],
    )

    if (unsetLegacyHooks.status !== 0)
      throw new Error('Unable to remove the legacy Husky hooks path.')
  }
} else if (configuredHooksPath.status !== 1) {
  throw new Error(
    configuredHooksPath.stderr.trim() ||
      'Unable to inspect the configured Git hooks path.',
  )
}

const installHooks = run('quality', ['hooks', 'install'], { stdio: 'inherit' })

if (installHooks.status !== 0)
  throw new Error('Quality hook installation failed.')
