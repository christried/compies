import type { EventView } from '~~/shared/event'
import { leadersOf } from '~~/shared/finish'
import { teamNameAt } from './board'
import { joinNames } from './list'
import type { Translate } from './settings-summary'

// What the Award ceremony's end frame shows (#309, spec #308, AwardCeremony.dc.html): the Winners and their points, the places from last to
// second, the Winners' Players as avatars and the sentence the live region reads. A pure model of the Event read; the layer draws it.

/** The avatars the ceremony shows at most: 6 cells, the last one „+N“ when there are more people (the reference's rule). */
const CELLS = 6

/** One cell of the Winners' people: a Player, the TeamMark of a Winner without Players, or the „+N“ that counts the rest. */
export type CeremonyPerson
  = { kind: 'player', id: string, name: string, image: string | null, team: number }
    | { kind: 'mark', team: number, name: string }
    | { kind: 'more', n: number }

export interface CeremonyModel {
  /** The Parties on rank 1, ascending by team position. Several of them are a Tie (GLOSSARY: Tie). */
  winners: { team: number, name: string }[]
  /** The Winners' shared points. */
  points: number
  /** Every Standing below rank 1 in the read's order, with its own rank (equal points share it: 2, 2, 4). */
  rows: { team: number, name: string, rank: number, points: number }[]
  /** The Winners' people, at most CELLS cells. */
  people: CeremonyPerson[]
  /** What the polite live region says once the dialog is there. */
  live: string
}

/** The model of the end frame, or null without a ceremony, without Standings or without anybody on rank 1. */
export function ceremonyModel({ standings, members, teams, ceremony }: Pick<EventView, 'standings' | 'members' | 'teams' | 'ceremony'>, t: Translate): CeremonyModel | null {
  if (!ceremony || !standings) return null
  const first = leadersOf(standings)
  if (first.length === 0) return null
  const winners = first.map(team => ({ team, name: teamNameAt(teams, team, t) }))
  const points = standings.find(row => row.team === first[0])!.points
  const rows = standings.filter(row => row.rank >= 2).map(row => ({ team: row.team, name: teamNameAt(teams, row.team, t), rank: row.rank, points: row.points }))
  const everyone: CeremonyPerson[] = winners.flatMap(({ team, name }): CeremonyPerson[] => {
    const players = members.filter(member => member.zone === 'team' && member.team === team)
    return players.length === 0
      ? [{ kind: 'mark', team, name }]
      : players.map(member => ({ kind: 'player', id: member.id, name: member.name, image: member.image, team }))
  })
  const people: CeremonyPerson[] = everyone.length > CELLS ? [...everyone.slice(0, CELLS - 1), { kind: 'more', n: everyone.length - (CELLS - 1) }] : everyone
  const live = t('ceremony.live', { list: joinNames(winners.map(winner => winner.name)), points: t('table.points', { n: points }, points) }, winners.length > 1 ? 2 : 1)
  return { winners, points, rows, people, live }
}
