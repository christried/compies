import type { Place } from '~~/shared/board'
import type { BoardTeam } from '~~/shared/event'
import type { Translate } from './settings-summary'

// The Game board's pure client parts (#160): the key a zone is known by in the DOM, and the name a team is shown with (#161).

/** The key of a place: the `data-drop-zone` of its zone, and what tells two places apart. */
export function placeKey(place: Place): string {
  return place.zone === 'team' ? `team-${place.team}` : place.zone
}

/** The place a `data-drop-zone` key stands for, or null for a key that is none. */
export function placeFromKey(key: string | undefined): Place | null {
  if (key === 'bench' || key === 'stands') return { zone: key }
  const team = /^team-(\d+)$/.exec(key ?? '')
  return team ? { zone: 'team', team: Number(team[1]) } : null
}

/**
 * The name a team is shown with (#161): its Team name when it has one (a BoardTeam from the Event read), else the Team
 * colour's name („Team Rot“). A bare position is always the colour's name: the Activity feed keeps it, because its entries
 * store the position and a name that changes later would rewrite history.
 */
export function teamName(team: BoardTeam | number, t: Translate): string {
  if (typeof team !== 'number' && team.name !== null) return team.name
  return t('team.defaultName', { color: t(`team.colors.${typeof team === 'number' ? team : team.position}`) })
}
