import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { carriesDevSignIn, carriesListeningPage, isStagingBuild, stageBranding } from '../../stage'

// Staging is decided at build time (#178): Vercel builds the `staging` branch with its ref in the env.
describe('isStagingBuild (#178)', () => {
  it('is true when Vercel builds the staging branch', () => {
    expect(isStagingBuild({ VERCEL_GIT_COMMIT_REF: 'staging' })).toBe(true)
  })

  it('is true when a local build sets COMPIES_STAGE to simulate staging', () => {
    expect(isStagingBuild({ COMPIES_STAGE: 'staging' })).toBe(true)
  })

  it('is false for production, feature branches and a bare env', () => {
    expect(isStagingBuild({ VERCEL_GIT_COMMIT_REF: 'main' })).toBe(false)
    expect(isStagingBuild({ VERCEL_GIT_COMMIT_REF: 'claude/eloquent-keller-5rp2oo' })).toBe(false)
    expect(isStagingBuild({})).toBe(false)
  })

  // The decision also lets the staging build carry the dev sign-in (#247), so a production build must not become staging
  // by a variable someone sets in the Vercel dashboard: on Vercel only the branch counts.
  it('ignores COMPIES_STAGE in a Vercel build', () => {
    expect(isStagingBuild({ VERCEL: '1', VERCEL_GIT_COMMIT_REF: 'main', COMPIES_STAGE: 'staging' })).toBe(false)
    expect(isStagingBuild({ VERCEL: '1', VERCEL_GIT_COMMIT_REF: 'staging' })).toBe(true)
  })
})

// The decision the inline dev-sign-in module in nuxt.config.ts makes (#247); test/build/dev-sign-in.test.ts checks the
// production build output itself.
describe('carriesDevSignIn (#247)', () => {
  it('is true on the dev server and in the staging build', () => {
    expect(carriesDevSignIn(true, {})).toBe(true)
    expect(carriesDevSignIn(false, { VERCEL: '1', VERCEL_GIT_COMMIT_REF: 'staging' })).toBe(true)
  })

  it('is false in the production build', () => {
    expect(carriesDevSignIn(false, { VERCEL: '1', VERCEL_GIT_COMMIT_REF: 'main' })).toBe(false)
  })
})

// The listening page for the cue sounds (#534) is for the dev server only: test/build/listening-page.test.ts checks the
// production build output itself. The function takes no env, so no staging variable can switch it on.
describe('carriesListeningPage (#534)', () => {
  it('is true on the dev server', () => {
    expect(carriesListeningPage(true)).toBe(true)
  })

  // Both the production build and the staging build run with `dev` false: staging is a production build behind Vercel
  // Authentication, and the page's candidate files must never be deployed there.
  it('is false in the production build and in the staging build', () => {
    expect(carriesListeningPage(false)).toBe(false)
  })
})

describe('stageBranding (#178)', () => {
  it('keeps the production name, short name and icons', () => {
    expect(stageBranding(false)).toEqual({
      name: 'Compies',
      shortName: 'Compies',
      appleTitle: 'Compies',
      iconDir: '/icons',
    })
  })

  it('names the staging build so it is never mistaken for production', () => {
    expect(stageBranding(true)).toEqual({
      name: 'Compies Staging',
      shortName: 'Staging',
      appleTitle: 'Compies Staging',
      iconDir: '/icons/staging',
    })
  })

  it('has a tinted staging icon for every production icon except the monochrome one', () => {
    const icons = resolve(import.meta.dirname, '../../public/icons')
    const staging = resolve(icons, 'staging')
    const production = readdirSync(icons, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name !== 'monochrome.svg')
      .map(entry => entry.name)
      .sort()

    expect(readdirSync(staging).sort()).toEqual(production)
  })
})
