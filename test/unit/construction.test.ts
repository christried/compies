import { describe, expect, it } from 'vitest'
import { canSeeAdmin, constructionSite } from '../../app/utils/construction'

describe('constructionSite', () => {
  it('`/archiv` is no unbuilt area, it has its own page (#882)', () => {
    expect(constructionSite('/archiv')).toEqual({ area: 'generic', shell: 'hub' })
    expect(constructionSite('/archiv/')).toEqual({ area: 'generic', shell: 'hub' })
  })

  it('no longer treats Profil as an unbuilt area, it has its own page (#399)', () => {
    expect(constructionSite('/profil')).toEqual({ area: 'generic', shell: 'hub' })
    expect(constructionSite('/profil/')).toEqual({ area: 'generic', shell: 'hub' })
  })

  it('no longer treats Bibliothek as an unbuilt area, it has its own pages (#141)', () => {
    expect(constructionSite('/bibliothek')).toEqual({ area: 'generic', shell: 'hub' })
    expect(constructionSite('/bibliothek/')).toEqual({ area: 'generic', shell: 'hub' })
  })

  it('has no Admin state any more: the page has its own address (#682), and a path below it gets the generic state for everyone, so it reveals nothing', () => {
    expect(constructionSite('/admin')).toEqual({ area: 'generic', shell: 'hub' })
    expect(constructionSite('/admin/users')).toEqual({ area: 'generic', shell: 'hub' })
  })

  it('shows the generic state for any other Event sub-route', () => {
    expect(constructionSite('/e/freitags-zocken-k7q2/brett')).toEqual({ area: 'generic', shell: 'event' })
    expect(constructionSite('/e/freitags-zocken-k7q2/tabelle')).toEqual({ area: 'generic', shell: 'event' })
    expect(constructionSite('/e/freitags-zocken-k7q2/chat/old')).toEqual({ area: 'generic', shell: 'event' })
  })

  it('shows the generic state in the hub shell for unknown areas', () => {
    expect(constructionSite('/crews')).toEqual({ area: 'generic', shell: 'hub' })
    expect(constructionSite('/archivxyz')).toEqual({ area: 'generic', shell: 'hub' })
  })
})

describe('canSeeAdmin', () => {
  it('is for the Platform admin only, and for nobody signed out', () => {
    expect(canSeeAdmin({ canHost: true, isAdmin: true })).toBe(true)
    expect(canSeeAdmin({ canHost: true, isAdmin: false })).toBe(false)
    expect(canSeeAdmin({ canHost: false, isAdmin: false })).toBe(false)
    expect(canSeeAdmin(null)).toBe(false)
  })
})
