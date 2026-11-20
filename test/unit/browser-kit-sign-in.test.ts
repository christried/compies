import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { signInPath } from '../../scripts/browser/kit.mjs'

// The dev sign-in of a browser state (scripts/browser/kit.mjs `open`, #810). A plain sign-in marks the Rundgang seen
// (`server/dev/sign-in.ts`), so no state of the wording walk is covered by it; only the walk's Tour states ask for it unseen.
describe('signInPath', () => {
  it('has no tour query by default', () => {
    const path = signInPath({ account: 'host', path: '/profil' })
    expect(path).toBe('/api/dev/sign-in?as=host&to=%2Fprofil')
    expect(path).not.toContain('tour=')
  })

  it('leaves the Rundgang unseen only when asked', () => {
    expect(signInPath({ account: 'member', path: '/e/x', tour: true })).toBe('/api/dev/sign-in?as=member&to=%2Fe%2Fx&tour=unseen')
    expect(signInPath({ account: 'member', path: '/e/x', tour: false })).not.toContain('tour=')
  })

  it('keeps the strings of the other options', () => {
    expect(signInPath({ account: 'member', path: '/', news: true })).toContain('&news=unseen')
    expect(signInPath({ account: 'member', path: '/', appearance: 'dark' })).toContain('&appearance=dark')
    expect(signInPath({ account: 'admin', path: '/', setup: true })).toContain('&name=unset')
    expect(signInPath({ account: 'member', path: '/', news: true, appearance: 'light', setup: true, tour: true }))
      .toBe('/api/dev/sign-in?as=member&to=%2F&news=unseen&appearance=light&name=unset&tour=unseen')
  })
})

describe('who asks for the Rundgang', () => {
  it('is the kit, the walk\'s Tour states and the pair of the Event states, and no other file of scripts/browser/', () => {
    const folder = join(import.meta.dirname, '../../scripts/browser')
    const asking = readdirSync(folder)
      .filter(name => name.endsWith('.mjs'))
      .filter(name => /tour:\s*true|tour=unseen/.test(readFileSync(join(folder, name), 'utf8')))
    expect(asking.sort()).toEqual(['dark-states-event.mjs', 'kit.mjs', 'walk-states-tour.mjs'])
  })
})
