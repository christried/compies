import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The Worker deploys when a push touches the Worker or a shared file it imports (#157). The list of shared files lives
// in the workflow's `paths`, so a new shared import in the Worker must not slip past it.
const root = fileURLToPath(new URL('../..', import.meta.url))

/** The shared files a file imports by relative path, followed through the shared files themselves. */
function sharedImports(file: string, found = new Set<string>()): Set<string> {
  const source = readFileSync(file, 'utf8')
  for (const [, specifier] of source.matchAll(/from '(\.[^']+)'/g)) {
    const target = resolve(file, '..', specifier!)
    const relative = target.slice(root.length - 1).replaceAll('\\', '/')
    if (!relative.startsWith('/shared/')) continue
    const path = `${target}.ts`
    if (found.has(path)) continue
    found.add(path)
    sharedImports(path, found)
  }
  return found
}

describe('the realtime deploy workflow paths', () => {
  it('list every shared file the Worker imports, and the workflow itself', () => {
    const workflow = readFileSync(join(root, '.github/workflows/realtime-deploy.yml'), 'utf8')
    const paths = [...workflow.matchAll(/^ {6}- '([^']+)'$/gm)].map(match => match[1])
    const sourceFiles = readdirSync(join(root, 'realtime/src')).filter(name => name.endsWith('.ts') && !name.endsWith('.d.ts'))
    const imported = new Set<string>()
    for (const name of sourceFiles) sharedImports(join(root, 'realtime/src', name), imported)
    const shared = [...imported].map(path => path.slice(root.length).replaceAll('\\', '/'))

    expect(shared.length).toBeGreaterThan(0)
    expect(paths).toEqual(expect.arrayContaining([...shared, 'realtime/**', '.github/workflows/realtime-deploy.yml']))
  })
})
