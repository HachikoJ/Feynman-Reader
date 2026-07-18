import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

async function removeFinderMetadata(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }

  await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name)
    if (entry.name === '.DS_Store') return rm(path, { force: true })
    if (entry.isDirectory()) return removeFinderMetadata(path)
    return undefined
  }))
}

await removeFinderMetadata(join(process.cwd(), 'out'))
