import { bonusVetoes, type draws, type vetoes } from '../db/schema'
import type { BonusVetoGranted } from '../../shared/stage'
import { vetoesSealed } from '../../shared/draw-timeline'
import { recordActivity } from './activity'
import { apiError } from './errors'
import type { ChangeCore } from './event-access'
import { bonusCountsOf, bonusVetoReason, readEventState } from './event-state'

// The Vetoes of an Event (GLOSSARY: Veto, Veto allowance, Bonus Veto; #231, #233): what a viewer may know of them, and the Host's Bonus Vetoes.
// The rows and each Party's Vetoes left are the Event state's (event-state.ts, #416). Casting and settling are in rounds.ts, next to the draws they belong to.

export type VetoRow = typeof vetoes.$inferSelect & { drawVetoEndsAt: Date | null }

/**
 * The Vetoes a viewer may know (#231, spec #218 § Vetoes: sealed until the end of the window). A Veto cast on a draw whose window
 * still runs counts only for the viewer's own Party (`viewerTeam`, null outside the teams: no Party's open-window Veto); from the
 * window's end on, every Veto counts for everybody. The Event read's Veto part and the Host's pool warning (#234) both use it, so
 * no number gives a sealed Veto away.
 */
export function knownVetoRows<T extends { drawId: string, team: number }>(vetoRows: readonly T[], drawRows: readonly Pick<typeof draws.$inferSelect, 'id' | 'vetoEndsAt'>[], viewerTeam: number | null, now: Date): T[] {
  const sealed = new Set(drawRows.filter(draw => vetoesSealed(draw, now)).map(draw => draw.id))
  return vetoRows.filter(row => !sealed.has(row.drawId) || row.team === viewerTeam)
}

/**
 * The Host grants a Party a Bonus Veto (#233, spec #218 § Bonus Vetoes): refused with the reason of bonusVetoReason, else a row
 * (granted by the Host, now) and its feed entry, published like any other. Nothing takes a Bonus Veto back. The caller holds the Event
 * row's lock, so two grants cannot both pass the limit. It counts at once: the Vetoes left (vetoesLeftOf) read it in every open window too.
 */
export async function grantBonusVeto({ tx, eventRow, user, publish, now }: ChangeCore, team: number): Promise<BonusVetoGranted> {
  const state = await readEventState(tx, eventRow, now, ['bonus'])
  const rejection = bonusVetoReason(state, eventRow.hostId === user.id, team)
  if (rejection) throw apiError(rejection)

  await tx.insert(bonusVetoes).values({ eventId: eventRow.id, team, grantedBy: user.id, grantedAt: now })
  await recordActivity(tx, publish, eventRow.id, { type: 'bonus_veto_granted', actorId: user.id, params: { team }, now })
  return { team, granted: bonusCountsOf(state)[team - 1]! + 1 }
}
