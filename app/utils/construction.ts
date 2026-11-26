// MVP route guard: every route without its own page renders the Construction page.
// Add an area to a list here, with its own state, when a hub area is announced before it is built; none is under construction now
// (Archiv left in #882, Admin in #682).

import type { AuthUser } from '~~/shared/auth'

export type ConstructionArea = 'generic'
export type ShellKind = 'hub' | 'event'

export interface ConstructionSite {
  area: ConstructionArea
  shell: ShellKind
}

/** The signed-in User's rights that decide which hidden areas show; null when signed out. */
export type Viewer = Pick<AuthUser, 'canHost' | 'isAdmin'> | null

/** Admin is for the Platform admin only. */
export function canSeeAdmin(viewer: Viewer) {
  return Boolean(viewer?.isAdmin)
}

/** Which Construction page state and shell a path that has no page of its own gets: the generic state, in the Event shell below an Event's address. */
export function constructionSite(path: string): ConstructionSite {
  const [first, slug] = path.split('/').filter(Boolean)
  return { area: 'generic', shell: first === 'e' && slug ? 'event' : 'hub' }
}
