// The Award ceremony (GLOSSARY: Award ceremony; spec #308, #309). The Host starts it on a finished Event; every Member's page opens
// the same layer at the same instant. The server stamps the start (a lead after the commit, ADR 0013) and picks the gag; the run's
// end is a pure function of the Party count and the gag, so nothing but the start is stored. Pure, so the server enforces the rules and
// the client shows the same facts. Instants are epoch ms here; rows and the Event read give Dates and ISO strings, which the same rules take.

import { msOf, type Instant } from './instant'
import type { Phase } from './phase'

/** The two gags (04-motion § 6b): Compibert trips over the trophy or gets bonked by it. */
export const CEREMONY_GAGS = ['trip', 'bonk'] as const
export type CeremonyGag = (typeof CEREMONY_GAGS)[number]

/** The run starts this long after the commit, so every client has the read first (the same reason as COIN_LEAD_MS). */
export const CEREMONY_LEAD_MS = 1500
/**
 * How long Compibert runs, fixed: the reference's run depends on the stage width (`runD = max(.7, (stopX + 260) / 520)`), which would
 * make devices disagree on when a run ends. Compibert's speed adapts to the width instead (#312).
 */
export const CEREMONY_RUN_MS = 700

/** One row slides in every this long (the reference's stagger); the first one at `rowsAtMs`. */
export const CEREMONY_ROW_MS = 450
const ROWS_AT_MS = 600
/** After the landing (ms): the stamp, Compibert gets up and laughs, the Winner's people pop in. */
const STAMP_AFTER_LAND_MS = 150
const GET_UP_AFTER_LAND_MS = 300
const MEMBERS_AFTER_LAND_MS = 450
/** The end frame's buttons rise in this long after the landing (04-motion § 6b `share (+1.4)`, #314); before the end, so `endMs` stays. */
const SHARE_AFTER_LAND_MS = 1400

/**
 * The run's moments in ms from its start instant, from `AwardCeremony.dc.html` play() (04-motion § 6b): the banner and one row per place
 * from last to second (450 ms each) come first, then the winner card, the run, then the gag lands (trip 800 ms, bonk 2200 ms after the run),
 * and the tail up to the dance (2200 ms) is the end. A Tie does not shorten it: the rows are the Parties less one (#309, decided; #315
 * revisits it). The server's `endsAt` and the client's tracks both read this one function (#312), so they cannot drift.
 */
export function ceremonyTimeline(partyCount: number, gag: CeremonyGag) {
  const rows = Math.max(partyCount - 1, 0)
  const runAtMs = 900 + CEREMONY_ROW_MS * rows
  const runEndAtMs = runAtMs + CEREMONY_RUN_MS
  const landAtMs = runEndAtMs + (gag === 'trip' ? 800 : 2200)
  return {
    rowsAtMs: ROWS_AT_MS,
    cardAtMs: ROWS_AT_MS + CEREMONY_ROW_MS * rows,
    runAtMs,
    runEndAtMs,
    landAtMs,
    stampAtMs: landAtMs + STAMP_AFTER_LAND_MS,
    getUpAtMs: landAtMs + GET_UP_AFTER_LAND_MS,
    membersAtMs: landAtMs + MEMBERS_AFTER_LAND_MS,
    shareAtMs: landAtMs + SHARE_AFTER_LAND_MS,
    endMs: landAtMs + 2200,
  }
}

/** The instant the run ends (epoch ms): the start plus the timeline's end. */
export function ceremonyEndsAt(startsAt: Instant, partyCount: number, gag: CeremonyGag): number {
  return msOf(startsAt) + ceremonyTimeline(partyCount, gag).endMs
}

/** Whether the latest run has not reached its end at `nowMs`; the lead counts as running. */
export function ceremonyRunning(latest: { endsAt: Instant }, nowMs: number): boolean {
  return nowMs < msOf(latest.endsAt)
}

/** Whether a viewer's layer opens at `nowMs`: from the start instant until the end. */
export function ceremonyPlays(c: { startsAt: Instant, endsAt: Instant }, nowMs: number): boolean {
  return msOf(c.startsAt) <= nowMs && nowMs < msOf(c.endsAt)
}

/** Why the Host cannot start the ceremony now (#309). */
export type CeremonyRejection = 'not_host' | 'wrong_phase' | 'ceremony_running'

/** The reason the ceremony cannot start now, or null when it can, checked in the order of CeremonyRejection. A start exactly at the previous end is allowed. */
export function ceremonyRejection({ isHost, phase, latest, now }: { isHost: boolean, phase: Phase, latest: { endsAt: Instant } | null, now: Instant }): CeremonyRejection | null {
  if (!isHost) return 'not_host'
  if (phase !== 'finished') return 'wrong_phase'
  if (latest && ceremonyRunning(latest, msOf(now))) return 'ceremony_running'
  return null
}

/** The gag of a start: never the previous one. The first start picks at random through `randomInt`; every later one takes the other without asking it. */
export function nextGag(previous: CeremonyGag | null, randomInt: (n: number) => number): CeremonyGag {
  if (previous === null) return CEREMONY_GAGS[randomInt(CEREMONY_GAGS.length)]!
  return previous === 'trip' ? 'bonk' : 'trip'
}
