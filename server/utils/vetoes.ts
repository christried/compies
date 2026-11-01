import { eq } from 'drizzle-orm'
import { bonusVetoes, draws, rounds, vetoes } from '../db/schema'
import { vetoesLeftByParty } from '../../shared/rounds'
import { settingsFromRow } from '../../shared/settings'
import type { Db } from './db'
import type { EventRow } from './event-access'

// The Vetoes of an Event (GLOSSARY: Veto, Veto allowance, Bonus Veto; #231): the rows the rules count Vetoes left from, and each
// Party's Vetoes left. Casting and settling are in rounds.ts, next to the draws they belong to.

export type VetoRow = typeof vetoes.$inferSelect

/** Every Veto cast in the Event, on settled and open draws alike, put-back Rounds included: spent stays spent. */
export function readVetoes(db: Db, eventId: string): Promise<VetoRow[]> {
  return db
    .select({ drawId: vetoes.drawId, team: vetoes.team, userId: vetoes.userId, castAt: vetoes.castAt })
    .from(vetoes)
    .innerJoin(draws, eq(vetoes.drawId, draws.id))
    .innerJoin(rounds, eq(draws.roundId, rounds.id))
    .where(eq(rounds.eventId, eventId))
}

/** The team of every Bonus Veto the Host granted in the Event, one entry per Bonus Veto (#233 grants them). */
export async function readBonusTeams(db: Db, eventId: string): Promise<number[]> {
  const found = await db.select({ team: bonusVetoes.team }).from(bonusVetoes).where(eq(bonusVetoes.eventId, eventId))
  return found.map(row => row.team)
}

/** Each Party's Vetoes left (index 0 = team 1) from the Event's settings and rows. An Event that is not set up has no Parties. */
export function partyVetoesLeft(eventRow: EventRow, vetoRows: readonly Pick<VetoRow, 'team'>[], bonusTeams: readonly number[]): number[] {
  const settings = settingsFromRow(eventRow)
  return vetoesLeftByParty({ allowance: settings?.vetoAllowance ?? null, teamCount: settings?.teamCount ?? 0, bonusTeams, castTeams: vetoRows.map(row => row.team) })
}
