import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A change of an Event takes its instants from `EventChange.now`, which `changeEvent` reads once (#259, ADR 0013). A handler that
// asks `useClock` itself would stamp a second instant, possibly one earlier than the change that committed before it.
const api = fileURLToPath(new URL('../../server/api/e', import.meta.url))

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(join(folder, entry.name)) : [join(folder, entry.name)])
}

describe('the Event API handlers and the clock', () => {
  it('ask useClock only to read or to create an Event: a write takes `now` from EventChange', () => {
    const asking = filesUnder(api)
      .filter(file => file.endsWith('.ts') && readFileSync(file, 'utf8').includes('utils/clock\''))
      .map(file => relative(api, file).replaceAll('\\', '/'))
      .sort()

    expect(asking).toEqual(['[slug].get.ts', '[slug]/activity.get.ts', '[slug]/ics.get.ts', 'index.get.ts', 'index.post.ts'].sort())
  })
})
