import { eq } from 'drizzle-orm'
import { bonusVetoes, draws, rounds, vetoes } from '../db/schema'
import type { BonusVetoGranted } from '../../shared/stage'
import { bonusVetoCounts, bonusVetoRejection, vetoesLeftByParty } from '../../shared/rounds'
import { settingsFromRow } from '../../shared/settings'
import { recordActivity } from './activity'
import type { Db } from './db'
import { apiError } from './errors'
import type { EventChange, EventRow } from './event-access'

// The Vetoes of an Event (GLOSSARY: Veto, Veto allowance, Bonus Veto; #231, #233): the rows the rules count Vetoes left from, each
// Party's Vetoes left, and the Host's Bonus Vetoes. Casting and settling are in rounds.ts, next to the draws they belong to.

export type VetoRow = typeof vetoes.$inferSelect & { drawSettledAt: Date | null }

/** Every Veto cast in the Event, on settled and open draws alike, put-back Rounds included: spent stays spent. `drawSettledAt` is null while the draw's window still runs. */
export function readVetoes(db: Db, eventId: string): Promise<VetoRow[]> {
  return db
    .select({ drawId: vetoes.drawId, team: vetoes.team, userId: vetoes.userId, castAt: vetoes.castAt, drawSettledAt: draws.settledAt })
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

/**
 * The Vetoes a viewer may know (#231, spec #218 § Vetoes: sealed until the end of the window). A Veto cast on a draw whose window
 * still runs counts only for the viewer's own Party (`viewerTeam`, null outside the teams: no Party's open-window Veto); from the
 * window's end on, every Veto counts for everybody. The Event read's Veto part and the Host's pool warning (#234) both use it, so
 * no number gives a sealed Veto away.
 */
export function knownVetoRows<T extends { drawId: string, team: number }>(vetoRows: readonly T[], drawRows: readonly Pick<typeof draws.$inferSelect, 'id' | 'vetoEndsAt'>[], viewerTeam: number | null, now: Date): T[] {
  const open = new Set(drawRows.filter(draw => draw.vetoEndsAt !== null && draw.vetoEndsAt > now).map(draw => draw.id))
  return vetoRows.filter(row => !open.has(row.drawId) || row.team === viewerTeam)
}

/** Each Party's Vetoes left (index 0 = team 1) from the Event's settings and rows. An Event that is not set up has no Parties. */
export function partyVetoesLeft(eventRow: EventRow, vetoRows: readonly Pick<VetoRow, 'team'>[], bonusTeams: readonly number[]): number[] {
  const settings = settingsFromRow(eventRow)
  return vetoesLeftByParty({ allowance: settings?.vetoAllowance ?? null, teamCount: settings?.teamCount ?? 0, bonusTeams, castTeams: vetoRows.map(row => row.team) })
}

type Change = Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'publish'>

/**
 * The Host grants a Party a Bonus Veto (#233, spec #218 § Bonus Vetoes): refused with the reason of bonusVetoRejection, else a row
 * (granted by the Host, now) and its feed entry, published like any other. Nothing takes a Bonus Veto back. The caller holds the Event
 * row's lock, so two grants cannot both pass the limit. It counts at once: partyVetoesLeft reads it in every open window too.
 */
export async function grantBonusVeto({ tx, eventRow, user, publish }: Change, now: Date, team: number): Promise<BonusVetoGranted> {
  const settings = settingsFromRow(eventRow)
  const granted = bonusVetoCounts(await readBonusTeams(tx, eventRow.id), settings?.teamCount ?? 0)
  const rejection = bonusVetoRejection({ isHost: eventRow.hostId === user.id, settings, phase: eventRow.phase, team, granted })
  if (rejection) throw apiError(rejection)

  await tx.insert(bonusVetoes).values({ eventId: eventRow.id, team, grantedBy: user.id, grantedAt: now })
  await recordActivity(tx, publish, eventRow.id, { type: 'bonus_veto_granted', actorId: user.id, params: { team }, now })
  return { team, granted: granted[team - 1]! + 1 }
}
