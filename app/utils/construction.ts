// MVP route guard: every route without its own page renders the Construction page.
// Remove an area from these lists as its ticket lands (and give it a real page).

/** Hub areas still under construction; HubNav marks them with the tape chip. */
export const HUB_SITES = ['archiv', 'bibliothek', 'profil', 'admin'] as const

export type HubSite = typeof HUB_SITES[number]
export type ConstructionArea = HubSite | 'brett' | 'generic'
export type ShellKind = 'hub' | 'event'

export interface ConstructionSite {
  area: ConstructionArea
  shell: ShellKind
}

/** The rights of the viewer that decide which hidden areas show; null when signed out. */
export interface ConstructionViewer {
  /** The Host permission: the User may host Events (the `canHost` column of the auth user). */
  hasHostPermission: boolean
  isAdmin: boolean
}

/** The viewer for the hidden-area rules, from the signed-in auth user. */
export function viewerOf(user: { canHost: boolean, isAdmin: boolean } | null): ConstructionViewer | null {
  return user && { hasHostPermission: user.canHost, isAdmin: user.isAdmin }
}

/** Bibliothek is for Users with the Host permission and the Platform admin. */
export function canSeeLibrary(viewer: ConstructionViewer | null) {
  return Boolean(viewer?.hasHostPermission || viewer?.isAdmin)
}

/** Admin is for the Platform admin only. */
export function canSeeAdmin(viewer: ConstructionViewer | null) {
  return Boolean(viewer?.isAdmin)
}

/**
 * Which Construction page state and shell a path that has no page of its own gets. An area the viewer
 * may not see gets the generic state, so its address does not reveal the area.
 */
export function constructionSite(path: string, viewer: ConstructionViewer | null): ConstructionSite {
  const [first, slug, sub] = path.split('/').filter(Boolean)

  if (first === 'e' && slug) {
    return { area: sub === 'brett' ? 'brett' : 'generic', shell: 'event' }
  }
  const hubSite = HUB_SITES.find(site => site === first)
  if (hubSite === 'bibliothek' && !canSeeLibrary(viewer)) return { area: 'generic', shell: 'hub' }
  if (hubSite === 'admin' && !canSeeAdmin(viewer)) return { area: 'generic', shell: 'hub' }
  return { area: hubSite ?? 'generic', shell: 'hub' }
}
