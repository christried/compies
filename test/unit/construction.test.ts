import { describe, expect, it } from 'vitest'
import { constructionSite } from '../../app/utils/construction'

const visitor = { canHost: false, isAdmin: false }
const host = { canHost: true, isAdmin: false }
const admin = { canHost: true, isAdmin: true }

describe('constructionSite', () => {
  it('maps each unbuilt hub area to its own Construction page in the hub shell for those who may see it', () => {
    expect(constructionSite('/archiv', visitor)).toEqual({ area: 'archiv', shell: 'hub' })
    expect(constructionSite('/profil', visitor)).toEqual({ area: 'profil', shell: 'hub' })
    expect(constructionSite('/admin', admin)).toEqual({ area: 'admin', shell: 'hub' })
  })

  it('keeps the area for deeper paths and trailing slashes', () => {
    expect(constructionSite('/archiv/', visitor)).toEqual({ area: 'archiv', shell: 'hub' })
    expect(constructionSite('/admin/users', admin)).toEqual({ area: 'admin', shell: 'hub' })
  })

  it('no longer treats Bibliothek as an unbuilt area, it has its own pages (#141)', () => {
    expect(constructionSite('/bibliothek', visitor)).toEqual({ area: 'generic', shell: 'hub' })
    expect(constructionSite('/bibliothek/', host)).toEqual({ area: 'generic', shell: 'hub' })
  })

  it('shows the generic state for Admin to everyone but the Platform admin', () => {
    expect(constructionSite('/admin', visitor)).toEqual({ area: 'generic', shell: 'hub' })
    expect(constructionSite('/admin', host)).toEqual({ area: 'generic', shell: 'hub' })
    expect(constructionSite('/admin/users', host)).toEqual({ area: 'generic', shell: 'hub' })
  })

  it('treats a signed-out visitor like a User without rights', () => {
    expect(constructionSite('/admin', null)).toEqual({ area: 'generic', shell: 'hub' })
    expect(constructionSite('/archiv', null)).toEqual({ area: 'archiv', shell: 'hub' })
  })

  it('shows the Spielbrett state in the event shell', () => {
    expect(constructionSite('/e/freitags-zocken-k7q2/brett', visitor)).toEqual({ area: 'brett', shell: 'event' })
  })

  it('shows the generic state for any other Event sub-route', () => {
    expect(constructionSite('/e/freitags-zocken-k7q2/tabelle', visitor)).toEqual({ area: 'generic', shell: 'event' })
    expect(constructionSite('/e/freitags-zocken-k7q2/chat/old', visitor)).toEqual({ area: 'generic', shell: 'event' })
  })

  it('shows the generic state in the hub shell for unknown areas', () => {
    expect(constructionSite('/crews', visitor)).toEqual({ area: 'generic', shell: 'hub' })
    expect(constructionSite('/archivxyz', visitor)).toEqual({ area: 'generic', shell: 'hub' })
  })
})
