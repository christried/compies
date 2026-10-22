import { describe, expect, it } from 'vitest'
import { guardRoute, isInviteLinkPath, safeRedirect } from '../../app/utils/auth-guard'

function route(fullPath: string) {
  const url = new URL(fullPath, 'http://localhost')
  return { path: url.pathname, fullPath, query: Object.fromEntries(url.searchParams) }
}

const newUser = { displayName: null }
const user = { displayName: 'Kitty' }

describe('guardRoute', () => {
  describe('signed out', () => {
    it('sends every app route to sign-in, keeping where the visitor was heading', () => {
      expect(guardRoute(route('/archiv'), null)).toBe('/anmelden?redirect=%2Farchiv')
      expect(guardRoute(route('/s/freitags-zocken-k7q2?x=1'), null)).toBe('/anmelden?redirect=%2Fs%2Ffreitags-zocken-k7q2%3Fx%3D1')
    })

    it('sends Home to sign-in without a redirect', () => {
      expect(guardRoute(route('/'), null)).toBe('/anmelden')
    })

    it('lets the visitor open sign-in, the invite preview and the legal pages', () => {
      expect(guardRoute(route('/anmelden?redirect=%2Farchiv'), null)).toBeNull()
      expect(guardRoute(route('/s/freitags-zocken-k7q2-Ab3dE6gH9jK1'), null)).toBeNull()
      expect(guardRoute(route('/impressum'), null)).toBeNull()
      expect(guardRoute(route('/datenschutz'), null)).toBeNull()
    })

    it('sends profile setup to sign-in', () => {
      expect(guardRoute(route('/einrichten'), null)).toBe('/anmelden?redirect=%2Feinrichten')
    })
  })

  describe('signed in before profile setup', () => {
    it('sends every app route to profile setup, keeping the target', () => {
      expect(guardRoute(route('/archiv'), newUser)).toBe('/einrichten?redirect=%2Farchiv')
      expect(guardRoute(route('/'), newUser)).toBe('/einrichten')
    })

    it('keeps a pending invite through profile setup', () => {
      expect(guardRoute(route('/s/freitags-zocken-k7q2-Ab3dE6gH9jK1'), newUser))
        .toBe('/einrichten?redirect=%2Fs%2Ffreitags-zocken-k7q2-Ab3dE6gH9jK1')
    })

    it('passes the sign-in target on to profile setup', () => {
      expect(guardRoute(route('/anmelden?redirect=%2Farchiv'), newUser)).toBe('/einrichten?redirect=%2Farchiv')
    })

    it('lets the User open profile setup and the legal pages', () => {
      expect(guardRoute(route('/einrichten?redirect=%2Farchiv'), newUser)).toBeNull()
      expect(guardRoute(route('/impressum'), newUser)).toBeNull()
    })
  })

  describe('signed in after profile setup', () => {
    it('lets the User through', () => {
      expect(guardRoute(route('/'), user)).toBeNull()
      expect(guardRoute(route('/s/freitags-zocken-k7q2'), user)).toBeNull()
      expect(guardRoute(route('/s/freitags-zocken-k7q2-Ab3dE6gH9jK1'), user)).toBeNull()
    })

    it('sends sign-in and profile setup on to their target', () => {
      expect(guardRoute(route('/anmelden?redirect=%2Farchiv'), user)).toBe('/archiv')
      expect(guardRoute(route('/einrichten?redirect=%2Farchiv'), user)).toBe('/archiv')
      expect(guardRoute(route('/anmelden'), user)).toBe('/')
    })
  })
})

describe('safeRedirect', () => {
  it('keeps a path on this site', () => {
    expect(safeRedirect('/s/abc-k7q2?tab=1#top')).toBe('/s/abc-k7q2?tab=1#top')
  })

  it('falls back to Home for anything that could leave the site', () => {
    for (const target of ['https://evil.example', '//evil.example', '/\\evil.example', 'archiv', '', undefined, ['/a']]) {
      expect(safeRedirect(target)).toBe('/')
    }
  })
})

describe('isInviteLinkPath', () => {
  it('tells an Invite link from a Session link by its 12-character token', () => {
    expect(isInviteLinkPath('/s/freitags-zocken-k7q2-Ab3dE6gH9jK1')).toBe(true)
    expect(isInviteLinkPath('/s/freitags-zocken-k7q2')).toBe(false)
    expect(isInviteLinkPath('/s/freitags-zocken-k7q2-Ab3dE6gH9jK1/brett')).toBe(false)
    expect(isInviteLinkPath('/s/k7q2-Ab3dE6gH9jK')).toBe(false)
  })
})
