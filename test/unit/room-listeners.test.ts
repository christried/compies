import type { RoomMessageType } from '../../shared/realtime'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every type of the room is heard by a page (#419): six were sent for a release and no page listened to them, and
// 0.8 had deleted five such messages already (#258). A Record keyed by the union: a new RoomMessage type fails the
// typecheck here until it is listed, and then this test wants a listener for it.
const ROOM_TYPES: Record<RoomMessageType, true> = {
  'event.changed': true,
  'activity.added': true,
  'member.moved': true,
  'presence.sync': true,
  'presence.join': true,
  'presence.leave': true,
  'clock.pong': true,
  'veto.cast': true,
}

const root = resolve(import.meta.dirname, '../..')

/** Every `.ts` and `.vue` file under a directory, as paths relative to the repo root. */
function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|vue)$/.test(entry.name) ? [path] : []
  })
}

describe('the room listeners', () => {
  it('has a page listening to every message type of the room', () => {
    const heard = new Set<string>()
    for (const file of sourceFiles('app')) {
      for (const match of readFileSync(join(root, file), 'utf8').matchAll(/\.on\(\s*'([a-z]+\.[A-Za-z]+)'/g)) {
        heard.add(match[1]!)
      }
    }
    const unheard = Object.keys(ROOM_TYPES).filter(type => !heard.has(type))
    expect(unheard).toEqual([])
  })
})
