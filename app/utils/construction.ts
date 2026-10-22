// MVP route guard: every route without its own page renders the Construction page.
// Remove an area from these lists as its ticket lands (and give it a real page).

/** Hub areas still under construction; HubNav marks them with the tape chip. */
export const HUB_SITES = ['archiv', 'bibliothek', 'profil', 'admin'] as const

export type HubSite = typeof HUB_SITES[number]
export type ConstructionArea = HubSite | 'brett' | 'generic'
export type ShellKind = 'hub' | 'session'

export interface ConstructionSite {
  area: ConstructionArea
  shell: ShellKind
}

/** Which Construction page state and shell a path that has no page of its own gets. */
export function constructionSite(path: string): ConstructionSite {
  const [first, slug, sub] = path.split('/').filter(Boolean)

  if (first === 's' && slug && sub) {
    return { area: sub === 'brett' ? 'brett' : 'generic', shell: 'session' }
  }
  const hubSite = HUB_SITES.find(site => site === first)
  return { area: hubSite ?? 'generic', shell: 'hub' }
}
