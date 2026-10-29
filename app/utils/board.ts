import type { Place } from '~~/shared/board'
import type { Translate } from './settings-summary'

// The Game board's pure client parts (#160): the key a zone is known by in the DOM, and the
// name a team has until Team words exist (#161).

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

/** „Team Rot“: a team is named after its Team colour until it has a Team word (#161). */
export function teamName(team: number, t: Translate): string {
  return t('team.defaultName', { color: t(`team.colors.${team}`) })
}
