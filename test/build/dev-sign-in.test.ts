import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { carriesDevSignIn } from '../../stage'

// The sign-in without Discord or Twitch (server/dev/sign-in.ts) is for `pnpm dev` and the staging build (#247): the
// production build must not register its route anywhere. Run `pnpm test:build` (builds first; CI builds production).
const SERVER = resolve(import.meta.dirname, '../../.output/server')

describe('dev sign-in in the production build', () => {
  it('has no /api/dev/sign-in route', () => {
    const files = readdirSync(SERVER, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.mjs'))
    expect(files.length).toBeGreaterThan(0)
    const carriers = files.filter(file => readFileSync(join(SERVER, file), 'utf8').includes('/api/dev/sign-in'))
    expect(carriers).toEqual([])
  })
})

// The decision the inline module in nuxt.config.ts makes, so agents can check a Player's view on staging (#247).
// It rests on isStagingBuild alone, so a build is staging for the sign-in exactly when it is staging for its name.
describe('which build carries the dev sign-in (#247)', () => {
  it('is the dev server', () => {
    expect(carriesDevSignIn(true, {})).toBe(true)
  })

  it('is the staging build, from Vercel or simulated locally', () => {
    expect(carriesDevSignIn(false, { VERCEL_GIT_COMMIT_REF: 'staging' })).toBe(true)
    expect(carriesDevSignIn(false, { COMPIES_STAGE: 'staging' })).toBe(true)
  })

  it('is never the production build, nor a feature branch build', () => {
    expect(carriesDevSignIn(false, { VERCEL_GIT_COMMIT_REF: 'main' })).toBe(false)
    expect(carriesDevSignIn(false, { VERCEL_GIT_COMMIT_REF: 'claude/eloquent-keller-5rp2oo' })).toBe(false)
    expect(carriesDevSignIn(false, {})).toBe(false)
  })
})
