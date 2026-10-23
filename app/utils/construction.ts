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

/** The rights of the viewer that decide whether a hidden area shows at all; null when signed out. */
export interface ConstructionViewer {
  canHost: boolean
  isAdmin: boolean
}

/**
 * Which Construction page state and shell a path that has no page of its own gets.
 * Bibliothek is for Hosts and the Platform admin, Admin for the Platform admin only; for everyone
 * else those addresses look like any unknown address (generic state), so they don't reveal the area.
 */
export function constructionSite(path: string, viewer: ConstructionViewer | null): ConstructionSite {
  const [first, slug, sub] = path.split('/').filter(Boolean)

  if (first === 's' && slug) {
    return { area: sub === 'brett' ? 'brett' : 'generic', shell: 'session' }
  }
  const hubSite = HUB_SITES.find(site => site === first)
  if (hubSite === 'bibliothek' && !(viewer?.canHost || viewer?.isAdmin)) return { area: 'generic', shell: 'hub' }
  if (hubSite === 'admin' && !viewer?.isAdmin) return { area: 'generic', shell: 'hub' }
  return { area: hubSite ?? 'generic', shell: 'hub' }
}
