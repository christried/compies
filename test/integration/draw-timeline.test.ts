import { and, eq, exists, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { activity, draws, events, games, rounds, users } from '../../server/db/schema'
import { readActivityPage } from '../../server/utils/activity'
import { dueDraws, stoppedDraws } from '../../server/utils/draw-timeline'
import { drawGameKnown, drawInstants, isDue, settleAt } from '../../shared/draw-timeline'
import { createTestDb } from './harness'

// The parity guard of the Draw's timeline (#414, ADR 0013 amendment 2026-10-31): the SQL twins (`stoppedDraws`, `dueDraws`) select
// exactly the Draws the JS predicates (`drawGameKnown` for a non-Host, `isDue`) accept, at every boundary millisecond. Draws are
// stored from `drawInstants`, so the test also pins what the writers store. Set equality, not counts.

const COMMIT = Date.parse('2090-10-30T10:00:00.000Z')

let testDb: Awaited<ReturnType<typeof createTestDb>>
let eventId: string

type Stored = typeof draws.$inferSelect
let stored: Stored[]

beforeAll(async () => {
  testDb = await createTestDb()
  const { db } = testDb
  const [user] = await db.insert(users).values({ name: 'Host', email: 'host@example.com' }).returning({ id: users.id })
  const [game] = await db.insert(games).values({ name: 'Halo', createdBy: user!.id }).returning({ id: games.id })
  const [event] = await db.insert(events).values({ slug: 'parity', inviteToken: 'parity-invite', hostId: user!.id, name: 'Parity', phase: 'running' }).returning({ id: events.id })
  eventId = event!.id

  const committedAt = new Date(COMMIT)
  // Each shape is stored for every clip length (#505): a window of 40, 60 and 150 s, and 30 s for a game without a video.
  const clipLengths = [10, 30, 120, null] as const
  const shapes = ([
    { kind: 'spin', windowOpens: true, settled: false },
    { kind: 'spin', windowOpens: false, settled: false },
    { kind: 'set', windowOpens: true, settled: false },
    { kind: 'set', windowOpens: false, settled: true },
    { kind: 'spin', windowOpens: true, settled: true },
    { kind: 'set', windowOpens: true, settled: true },
  ] as const).flatMap(shape => clipLengths.map(clipLength => ({ ...shape, clipLength })))
  stored = []
  for (const shape of shapes) {
    const instants = drawInstants({ kind: shape.kind, commitAt: COMMIT, windowOpens: shape.windowOpens, clipLength: shape.clipLength })
    // One Round per draw; each has its game set, so the one-drawn-Round-per-Event index does not apply.
    const [round] = await db.insert(rounds).values({ eventId, startedAt: committedAt, gameId: game!.id, setAt: committedAt }).returning({ id: rounds.id })
    const [row] = await db.insert(draws).values({
      roundId: round!.id,
      gameId: game!.id,
      source: 'pool',
      kind: shape.kind,
      committedAt,
      ...instants,
      ...(shape.settled ? { outcome: 'set' as const, settledAt: settleAt(instants) } : {}),
      ...(shape.kind === 'spin' ? { sliceGameIds: [game!.id], resultIndex: 0, resultOffset: 0 } : {}),
    }).returning()
    stored.push(row!)
  }
})

afterAll(async () => {
  await testDb.client.close()
})

/** Every boundary millisecond of every stored Draw: stop - 1, stop, stop + 1 and, with a window, end - 1, end, end + 1. */
function probes(): Date[] {
  const at = new Set<number>()
  for (const row of stored) {
    for (const edge of [row.stopAt, row.vetoEndsAt]) {
      if (edge) for (const offset of [-1, 0, 1]) at.add(edge.getTime() + offset)
    }
  }
  return [...at].sort((a, b) => a - b).map(ms => new Date(ms))
}

const ids = (rows: readonly { id: string }[]) => rows.map(row => row.id).sort()

describe('the SQL twins agree with the JS predicates (#414)', () => {
  it('stores the instants the timeline gives, for every shape of Draw', () => {
    expect(stored).toHaveLength(24)
    expect(new Set(probes().map(now => now.getTime())).size).toBeGreaterThan(8)
  })

  it('dueDraws selects exactly the Draws isDue accepts', async () => {
    for (const now of probes()) {
      const found = ids(await dueDraws(testDb.db, eventId, now))
      const js = ids(stored.filter(row => isDue(row, now)))
      expect(found, `due at ${now.toISOString()}`).toEqual(js)
    }
  })

  it('stoppedDraws (an Event list) selects exactly the Draws a non-Host may know', async () => {
    for (const now of probes()) {
      const found = await testDb.db.select({ id: draws.id }).from(draws).innerJoin(rounds, eq(draws.roundId, rounds.id)).where(stoppedDraws([eventId], now))
      const js = ids(stored.filter(row => drawGameKnown({ isHost: false, draw: row, now })))
      expect(ids(found), `known at ${now.toISOString()}`).toEqual(js)
    }
  })

  it('stoppedDraws (the Event column, a correlated exists) selects the same Draws', async () => {
    for (const now of probes()) {
      const known: string[] = []
      for (const row of stored) {
        const inner = testDb.db.select({ one: sql`1` }).from(draws).innerJoin(rounds, eq(draws.roundId, rounds.id)).where(and(stoppedDraws(events.id, now), eq(draws.id, row.id)))
        const [hit] = await testDb.db.select({ id: events.id }).from(events).where(and(eq(events.id, eventId), exists(inner)))
        if (hit) known.push(row.id)
      }
      expect(known.sort(), `known at ${now.toISOString()}`).toEqual(ids(stored.filter(row => drawGameKnown({ isHost: false, draw: row, now }))))
    }
  })
})

describe('the Activity feed keeps the timeline\'s stop edge (#413)', () => {
  // readActivityPage gates a `game_drawn` entry with its own `lte(activity.at, now)` (server/utils/activity.ts), not with
  // `stoppedDraws`; this pins that comparison to `drawGameKnown` for a non-Host, so the two cannot drift apart.
  it('shows a game_drawn entry, and names its game, from the stop on and not one ms before', async () => {
    const draw = stored[0]!
    await testDb.db.insert(activity).values({ eventId, type: 'game_drawn', actorId: null, params: { roundId: draw.roundId, drawId: draw.id, gameId: draw.gameId }, at: draw.stopAt })
    for (const offset of [-1, 0, 1]) {
      const now = new Date(draw.stopAt.getTime() + offset)
      const page = await readActivityPage(testDb.db, eventId, undefined, 50, now)
      const entry = page.entries.find(candidate => candidate.type === 'game_drawn')
      const known = drawGameKnown({ isHost: false, draw, now })
      expect(entry !== undefined, `entry listed at stop ${offset}`).toBe(known)
      expect(entry !== undefined && Object.keys(entry.games).length > 0, `game named at stop ${offset}`).toBe(known)
    }
  })
})
