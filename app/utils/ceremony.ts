import { GRID_FROM_WINNERS } from '~~/shared/ceremony'
import type { EventView } from '~~/shared/event'
import { leadersOf } from '~~/shared/finish'
import { teamNameAt } from './board'
import { joinNames } from './list'
import type { Translate } from './settings-summary'

// What the Award ceremony's end frame shows (#309, spec #308, AwardCeremony.dc.html): the Winners and their points, the places from last to
// second, each Winner's Players as avatars and the sentence the live region reads. A Tie (#315, 12-siegerehrung-unentschieden.md) has several
// Winners, each with its own people. A pure model of the Event read; the layer draws it.

/** The avatars the ceremony shows at most per Winner: 6 cells, the last one „+N“ when there are more people (the reference's rule). */
const CELLS = 6

/** One cell of a Winner's people: a Player, the TeamMark of a Winner without Players, or the „+N“ that counts the rest. */
export type CeremonyPerson
  = { kind: 'player', id: string, name: string, image: string | null, team: number }
    | { kind: 'mark', team: number, name: string }
    | { kind: 'more', n: number }

/** A Party on rank 1 with its points and its people, at most CELLS cells. */
export interface CeremonyWinner {
  team: number
  name: string
  points: number
  people: CeremonyPerson[]
}

export interface CeremonyModel {
  /** The Parties on rank 1, ascending by team position. Several of them are a Tie (GLOSSARY: Tie). */
  winners: CeremonyWinner[]
  /** The Winners' shared points. */
  points: number
  /** Every Standing below rank 1 in the read's order, with its own rank (equal points share it: 2, 2, 4). */
  rows: { team: number, name: string, rank: number, points: number }[]
  /** The line under the banner (#312): the Event and the games played; a Tie adds who stands level. */
  sub: string
  /** What the polite live region says once the stamp has landed. */
  live: string
}

/** The cells of one Winner's people: its Players, or its TeamMark when it has none; 5 and „+N“ above CELLS. */
function peopleOf(members: EventView['members'], team: number, name: string): CeremonyPerson[] {
  const players = members.filter(member => member.zone === 'team' && member.team === team)
  const everyone: CeremonyPerson[] = players.length === 0
    ? [{ kind: 'mark', team, name }]
    : players.map(member => ({ kind: 'player', id: member.id, name: member.name, image: member.image, team }))
  return everyone.length > CELLS ? [...everyone.slice(0, CELLS - 1), { kind: 'more', n: everyone.length - (CELLS - 1) }] : everyone
}

/** The model of the end frame, or null without a ceremony, without Standings or without anybody on rank 1. */
export function ceremonyModel({ standings, members, teams, ceremony, event, results }: Pick<EventView, 'standings' | 'members' | 'teams' | 'ceremony' | 'results'> & { event: Pick<EventView['event'], 'name'> }, t: Translate): CeremonyModel | null {
  if (!ceremony || !standings) return null
  const first = leadersOf(standings)
  if (first.length === 0) return null
  const points = standings.find(row => row.team === first[0])!.points
  const winners = first.map((team): CeremonyWinner => {
    const name = teamNameAt(teams, team, t)
    return { team, name, points, people: peopleOf(members, team, name) }
  })
  const rows = standings.filter(row => row.rank >= 2).map(row => ({ team: row.team, name: teamNameAt(teams, row.team, t), rank: row.rank, points: row.points }))
  const names = joinNames(winners.map(winner => winner.name))
  const base = t('ceremony.sub', { event: event.name, n: results.length }, results.length)
  if (winners.length === 1) {
    const live = t('ceremony.live', { list: names, points: t('table.points', { n: points }, points) })
    return { winners, points, rows, sub: base, live }
  }
  // A Tie (#315): who stands level, in the three variants of the design (somebody finished below, both of 2, all of 3 or more).
  const k = winners.length
  const variant = rows.length > 0 ? '' : k === 2 ? 'Both' : 'All'
  const named = { k, n: points, names }
  const sub = t(`ceremony.tie.sub${variant}`, { ...named, base }, points)
  const live = t(`ceremony.tie.live${variant}`, named, points)
  return { winners, points, rows, sub, live }
}

/** How the Winners and the places below them stand (12-siegerehrung-unentschieden.md § States). */
export interface CeremonyLayout {
  /** One card (a sole Winner), a chain of cards joined by „=“ under the plate, or a grid of compact cards. */
  stage: 'single' | 'chain' | 'grid'
  /** The places below: beside the cards, below them, one line of chips, or none (nobody finished below). */
  rows: 'side' | 'below' | 'chips' | 'none'
  /** The cards of a chain, or the columns of a grid. */
  cols: number
}

/**
 * The layout of `winners` Winners with `below` Parties under them. A wide screen (`roomy`) chains 2 and 3 Winners and grids from
 * GRID_FROM_WINNERS (the server's default, shared/ceremony.ts) in 4 columns; a phone chains 2 and grids from 3 in 2 columns. A sole
 * Winner is today's single card.
 */
export function ceremonyLayout(winners: number, below: number, roomy: boolean): CeremonyLayout {
  if (winners <= 1) return { stage: 'single', rows: below > 0 ? 'side' : 'none', cols: 1 }
  const chain = winners === 2 || (roomy && winners < GRID_FROM_WINNERS)
  if (!chain) return { stage: 'grid', rows: below > 0 ? 'chips' : 'none', cols: roomy ? 4 : 2 }
  const rows = below === 0 ? 'none' : winners === 2 ? (roomy ? 'side' : 'below') : 'chips'
  return { stage: 'chain', rows, cols: winners }
}
