import { readdir } from 'node:fs/promises'

const changesetDirectory = new URL('../.changeset/', import.meta.url)

const pendingChangesets = (await readdir(changesetDirectory))
  .filter(fileName => fileName.endsWith('.md') && fileName !== 'README.md')

if (pendingChangesets.length > 0) {
  throw new Error(
    `Release has unconsumed Changesets: ${pendingChangesets.join(', ')}`
  )
}

console.log('Release has no unconsumed Changesets.')
