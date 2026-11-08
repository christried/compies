// The Award ceremony (GLOSSARY: Award ceremony; spec #308, #309). The Host starts it on a finished Event; every Member's page opens
// the same layer at the same instant. The server stamps the start (a lead after the commit, ADR 0013) and picks the gag; the run's
// end is a pure function of the Party count, the Winner count (a Tie, #315) and the gag, so nothing but the start is stored. Pure, so the server enforces the rules and
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
/** After the landing, in a Tie after the plate (ms): the stamp, Compibert gets up and laughs, the Winner's people pop in. */
const STAMP_AFTER_LAND_MS = 150
const GET_UP_AFTER_LAND_MS = 300
const MEMBERS_AFTER_LAND_MS = 450
/** The end frame's buttons rise in this long after the landing, in a Tie after the plate (04-motion § 6b `share (+1.4)`, #314); before the end, so `endMs` stays. */
const SHARE_AFTER_LAND_MS = 1400

/** A Tie's chain: the trophy hops from card to card (+0.54 s each), then onto the plate 0.62 s after the last landing (04-motion § 6b-T). */
export const HOP_MS = 540
const PLATE_AFTER_LAST_LAND_MS = 620
/** Below 3 Winners the places stay rows (the reference's stagger); from 3 on they are one wrapping line of chips, 0.2 s apart and 0.3 s long each. */
export const CHIP_STEP_MS = 200
export const CHIP_MS = 300
/** The run starts this long after the plate and the cards have come in (the single card's offset: 900 - 600). */
const RUN_AFTER_CARD_MS = 300

/** From this many Winners the default layout (a wide screen) shows them as a grid; `ceremonyLayout` reads it for its roomy branch, a phone grids from 3. */
export const GRID_FROM_WINNERS = 4

/**
 * The shape of a run (#327): what its timeline depends on. `partyCount` is the Parties in the Standings, `winners` the Winner count k
 * (GLOSSARY: Tie; the Parties on rank 1), `gag` the server's pick, `grid` whether the Winners stand in a grid on this screen. The server never
 * knows a screen, so it leaves `grid` out and the default layout's rule (`GRID_FROM_WINNERS`) applies.
 */
export interface CeremonyShape {
  partyCount: number
  winners: number
  gag: CeremonyGag
  grid?: boolean
}

/**
 * The run's moments in ms from its start instant, from `AwardCeremony.dc.html` play() (04-motion § 6b, § 6b-T): the banner and the places
 * below the Winners (rows, chips from 3 Winners on) come first, then the plate and the cards, the run, then the gag lands (trip 800 ms, bonk
 * 2200 ms after the run), and the tail up to the dance (2200 ms) is the end. `winners` is the Winner count k (GLOSSARY: Tie; the Parties on
 * rank 1). A Tie has fewer rows and, in a chain, a hop of 540 ms per further card and 620 ms on to the plate, and everything after the
 * landing hangs on the plate (`plateAtMs`); for k = 1 every number is the single Winner's (#309). `grid` says the Winners stand in a grid, where
 * the trophy lands on the plate at once: the client knows it from its screen, the server never passes it (the default, from GRID_FROM_WINNERS), so
 * a phone that shows 3 Winners as a grid ends up to 1.7 s before the stored end and never after it (#315). The server's `endsAt` and the
 * client's tracks both read this one function (#312), so they cannot drift.
 */
export function ceremonyTimeline({ partyCount, gag, winners, grid = winners >= GRID_FROM_WINNERS }: CeremonyShape) {
  const below = Math.max(partyCount - winners, 0)
  const rowsEnd = below === 0
    ? ROWS_AT_MS
    : winners <= 2 ? ROWS_AT_MS + CEREMONY_ROW_MS * below : ROWS_AT_MS + CHIP_STEP_MS * (below - 1) + CHIP_MS
  const runAtMs = rowsEnd + RUN_AFTER_CARD_MS
  const runEndAtMs = runAtMs + CEREMONY_RUN_MS
  const landAtMs = runEndAtMs + (gag === 'trip' ? 800 : 2200)
  const plateAtMs = winners >= 2 && !grid ? landAtMs + HOP_MS * (winners - 1) + PLATE_AFTER_LAST_LAND_MS : landAtMs
  return {
    rowsAtMs: ROWS_AT_MS,
    cardAtMs: rowsEnd,
    runAtMs,
    runEndAtMs,
    landAtMs,
    plateAtMs,
    stampAtMs: plateAtMs + STAMP_AFTER_LAND_MS,
    getUpAtMs: plateAtMs + GET_UP_AFTER_LAND_MS,
    membersAtMs: plateAtMs + MEMBERS_AFTER_LAND_MS,
    // In a Tie the buttons come 1.4 s after the plate, not after the first landing (12-siegerehrung-unentschieden.md: `share (plate +1.4)`, #315).
    shareAtMs: plateAtMs + SHARE_AFTER_LAND_MS,
    endMs: plateAtMs + 2200,
  }
}

/** The instant the run ends (epoch ms): the start plus the timeline's end, for the default layout (`shape.grid` left out). */
export function ceremonyEndsAt(startsAt: Instant, shape: CeremonyShape): number {
  return msOf(startsAt) + ceremonyTimeline(shape).endMs
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
