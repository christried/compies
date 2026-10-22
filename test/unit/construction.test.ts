import { describe, expect, it } from 'vitest'
import { constructionSite } from '../../app/utils/construction'

describe('constructionSite', () => {
  it('maps each unbuilt hub area to its own Construction page in the hub shell', () => {
    expect(constructionSite('/archiv')).toEqual({ area: 'archiv', shell: 'hub' })
    expect(constructionSite('/bibliothek')).toEqual({ area: 'bibliothek', shell: 'hub' })
    expect(constructionSite('/profil')).toEqual({ area: 'profil', shell: 'hub' })
    expect(constructionSite('/admin')).toEqual({ area: 'admin', shell: 'hub' })
  })

  it('keeps the area for deeper paths and trailing slashes', () => {
    expect(constructionSite('/archiv/')).toEqual({ area: 'archiv', shell: 'hub' })
    expect(constructionSite('/admin/users')).toEqual({ area: 'admin', shell: 'hub' })
  })

  it('shows the Spielbrett state in the session shell', () => {
    expect(constructionSite('/s/freitags-zocken-k7q2/brett')).toEqual({ area: 'brett', shell: 'session' })
  })

  it('shows the generic state for any other Session sub-route', () => {
    expect(constructionSite('/s/freitags-zocken-k7q2/tabelle')).toEqual({ area: 'generic', shell: 'session' })
    expect(constructionSite('/s/freitags-zocken-k7q2/chat/old')).toEqual({ area: 'generic', shell: 'session' })
  })

  it('shows the generic state in the hub shell for unknown areas', () => {
    expect(constructionSite('/crews')).toEqual({ area: 'generic', shell: 'hub' })
    expect(constructionSite('/archivxyz')).toEqual({ area: 'generic', shell: 'hub' })
  })
})
