import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The sign-in without Discord or Twitch (server/dev/sign-in.ts) is for `pnpm dev` only: the production
// build must not register its route anywhere. Run `pnpm test:build` (builds first).
const SERVER = resolve(import.meta.dirname, '../../.output/server')

describe('dev sign-in in the production build', () => {
  it('has no /api/dev/sign-in route', () => {
    const files = readdirSync(SERVER, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.mjs'))
    expect(files.length).toBeGreaterThan(0)
    const carriers = files.filter(file => readFileSync(join(SERVER, file), 'utf8').includes('/api/dev/sign-in'))
    expect(carriers).toEqual([])
  })
})
