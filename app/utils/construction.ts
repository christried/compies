// MVP route guard: every route without its own page renders the Construction page.
// Remove an area from these lists as its ticket lands (and give it a real page).

import type { AuthUser } from '~~/shared/auth'

/** Hub areas still under construction; HubNav marks them with the tape chip. */
export const HUB_SITES = ['archiv', 'profil', 'admin'] as const

export type HubSite = typeof HUB_SITES[number]
export type ConstructionArea = HubSite | 'brett' | 'generic'
export type ShellKind = 'hub' | 'event'

export interface ConstructionSite {
  area: ConstructionArea
  shell: ShellKind
}

/** The signed-in User's rights that decide which hidden areas show; null when signed out. */
export type Viewer = Pick<AuthUser, 'canHost' | 'isAdmin'> | null

// The Bibliothek rule lives in shared/game.ts, because the server applies it too (#141).
export { canSeeLibrary } from '~~/shared/game'

/** Admin is for the Platform admin only. */
export function canSeeAdmin(viewer: Viewer) {
  return Boolean(viewer?.isAdmin)
}

/**
 * Which Construction page state and shell a path that has no page of its own gets. An area the viewer
 * may not see gets the generic state, so its address does not reveal the area.
 */
export function constructionSite(path: string, viewer: Viewer): ConstructionSite {
  const [first, slug, sub] = path.split('/').filter(Boolean)

  if (first === 'e' && slug) {
    return { area: sub === 'brett' ? 'brett' : 'generic', shell: 'event' }
  }
  const hubSite = HUB_SITES.find(site => site === first)
  if (hubSite === 'admin' && !canSeeAdmin(viewer)) return { area: 'generic', shell: 'hub' }
  return { area: hubSite ?? 'generic', shell: 'hub' }
}
