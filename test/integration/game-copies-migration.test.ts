import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateThrough } from './harness'

// The migration that splits the library per Host (#721, spec #717 § A, ADR 0018): for every pair (Host, game of someone else) that
// one of the Host's Events refers to, the Host gets one copy, and the references of the Host's Events move to it: the Game pool,
// Rounds, Draws (the column and the slice list together, so `draws_result_check` stays true) and the Activity entries that name a
// game. The previous deployment serves while the build migrates (ADR 0007) and keeps inserting and updating `games` with explicit
// columns. The database stops at this migration (`migrateThrough`): later 0.16 migrations add columns and would change the rows
// that the tests compare. Every name, id and note is invented.

const MIGRATION = '0036_game_copies_per_host'

const uid = (kind: string, n: number) => `00000000-0000-4000-8000-${kind}${String(n).padStart(11, '0')}`

const OWNER = uid('a', 1)
const H1 = uid('a', 2)
const H2 = uid('a', 3)
const H3 = uid('a', 4) // without the Host permission: the default `can_host = false`

const E1 = uid('e', 1) // H1's main Event
const E2 = uid('e', 2) // H1's second Event
const E3 = uid('e', 3) // H1's soft-deleted Event
const E4 = uid('e', 4) // H2's Event
const E5 = uid('e', 5) // H3's Event
const E6 = uid('e', 6) // H1's Event without any game reference
const EO = uid('e', 7) // OWNER's own Event

const OWN = uid('b', 1) // H1's own game
const OWNER_OWN = uid('b', 2)
const POOL = uid('b', 3)
const ROUND = uid('b', 4)
const DRAW = uid('b', 5)
const SPIN = uid('b', 6)
const SLICE = uid('b', 7)
const ACT = uid('b', 8)
const SHARED = uid('b', 9)
const TWO = uid('b', 10)
const SOFT = uid('b', 11)
const NOPERM = uid('b', 12)
const PHANTOM = uid('b', 99) // an id that no game has

const NAMES: Record<string, string> = {
  [OWN]: 'Lambda',
  [OWNER_OWN]: 'Mü',
  [POOL]: 'Alpha',
  [ROUND]: 'Beta',
  [DRAW]: 'Gamma',
  [SPIN]: 'Delta',
  [SLICE]: 'Epsilon',
  [ACT]: 'Zeta',
  [SHARED]: 'Eta',
  [TWO]: 'Theta',
  [SOFT]: 'Iota',
  [NOPERM]: 'Kappa',
}

const R_OWN = uid('c', 1)
const R_ROUND = uid('c', 2)
const R_DRAWS = uid('c', 3)
const R_SHARED = uid('c', 4)

const D_SET = uid('d', 1)
const D_SPIN = uid('d', 2)
const D_SLICE = uid('d', 3)
const D_BOTH = uid('d', 4)
const D_TWICE = uid('d', 5)

const A_DRAWN = uid('f', 1)
const A_REVEALED = uid('f', 2)
const A_SET = uid('f', 3)
const A_PUT_BACK = uid('f', 4)
const A_ENTERED = uid('f', 5)
const A_CORRECTED = uid('f', 6)
const A_OWN = uid('f', 7)
const A_COIN = uid('f', 8)
const A_PHANTOM = uid('f', 9)
const SIX = [A_DRAWN, A_REVEALED, A_SET, A_PUT_BACK, A_ENTERED, A_CORRECTED]

const T0 = '2090-11-07T19:00:00Z'
const T1 = '2090-11-07T19:00:30Z'

// The pairs the fixture holds: 11 copies, as (game, Host).
const PAIRS: [string, string][] = [
  [POOL, H1], [ROUND, H1], [DRAW, H1], [SPIN, H1], [SLICE, H1], [ACT, H1], [SHARED, H1], [TWO, H1], [TWO, H2], [SOFT, H1], [NOPERM, H3],
]

const MIGRATION_SQL = fileURLToPath(new URL(`../../drizzle/${MIGRATION}.sql`, import.meta.url))

type Json = Record<string, unknown>

describe('migration: a copy of each game per Host', () => {
  let client: PGlite
  let folder: string
  let gamesBefore: number
  let closingBefore: Closing
  let snapshot: { games: Json[], tags: Json[], own: Json[], activityRest: Json[] }

  type Closing = { pool: number, rounds: number, draws: number, slices: number, activity: number }

  // The closing assertion: the references to a game whose creator is not the Event's Host, per kind of reference.
  const closing = async (): Promise<Closing> => {
    const { rows } = await client.query<Closing>(`
      SELECT
        (SELECT count(*)::int FROM event_pool_games pg JOIN events ev ON ev.id = pg.event_id JOIN games gm ON gm.id = pg.game_id
          WHERE gm.created_by <> ev.host_id) AS pool,
        (SELECT count(*)::int FROM rounds rd JOIN events ev ON ev.id = rd.event_id JOIN games gm ON gm.id = rd.game_id
          WHERE gm.created_by <> ev.host_id) AS rounds,
        (SELECT count(*)::int FROM draws dr JOIN rounds rd ON rd.id = dr.round_id JOIN events ev ON ev.id = rd.event_id JOIN games gm ON gm.id = dr.game_id
          WHERE gm.created_by <> ev.host_id) AS draws,
        (SELECT count(*)::int FROM draws dr JOIN rounds rd ON rd.id = dr.round_id JOIN events ev ON ev.id = rd.event_id
          CROSS JOIN LATERAL unnest(dr.slice_game_ids) AS slice(game_id) JOIN games gm ON gm.id = slice.game_id
          WHERE gm.created_by <> ev.host_id) AS slices,
        (SELECT count(*)::int FROM activity ac JOIN events ev ON ev.id = ac.event_id JOIN games gm ON gm.id::text = ac.params->>'gameId'
          WHERE gm.created_by <> ev.host_id) AS activity`)
    return rows[0]!
  }

  const count = async (table: string) => {
    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`)
    return rows[0]!.count
  }

  /** The id of the copy of `original` that `host` got. */
  const copyOf = async (original: string, host: string) => {
    const { rows } = await client.query<{ id: string }>(`SELECT id FROM games WHERE name = $1 AND created_by = $2 AND id <> $3`, [NAMES[original], host, original])
    expect(rows).toHaveLength(1)
    return rows[0]!.id
  }

  const insertDraw = (id: string, round: string, game: string, slices: string[] | null, resultIndex: number | null) => {
    if (slices) {
      return client.query(
        `INSERT INTO draws (id, round_id, game_id, source, kind, committed_at, spin_start_at, stop_at, outcome, settled_at, slice_game_ids, result_index, result_offset)
         VALUES ($1, $2, $3, 'pool', 'spin', $4, $4, $5, 'vetoed', $5, $6, $7, 0.25)`,
        [id, round, game, T0, T1, slices, resultIndex],
      )
    }
    return client.query(
      `INSERT INTO draws (id, round_id, game_id, source, kind, committed_at, stop_at, outcome, settled_at) VALUES ($1, $2, $3, 'pool', 'set', $4, $5, 'vetoed', $5)`,
      [id, round, game, T0, T1],
    )
  }

  const insertActivity = (id: string, event: string, type: string, params: Json) =>
    client.query(`INSERT INTO activity (id, event_id, type, params) VALUES ($1, $2, $3, $4::jsonb)`, [id, event, type, JSON.stringify(params)])

  const snapshotRows = async () => {
    const games = await client.query<{ j: Json }>(`SELECT to_jsonb(g) AS j FROM games g ORDER BY g.id`)
    const tags = await client.query<{ j: Json }>(`SELECT to_jsonb(t) AS j FROM game_tags t ORDER BY t.game_id, t.key`)
    // H1's own game and the rows that name it: the pool row, the Round, the Activity entry.
    const own = await client.query<{ j: Json }>(`
      SELECT to_jsonb(pg) AS j FROM event_pool_games pg WHERE pg.game_id = $1 AND pg.event_id = $2
      UNION ALL SELECT to_jsonb(rd) FROM rounds rd WHERE rd.id = $3
      UNION ALL SELECT to_jsonb(ac) FROM activity ac WHERE ac.id = $4`, [OWN, E1, R_OWN, A_OWN])
    const activityRest = await client.query<{ j: Json }>(`SELECT jsonb_build_object('id', id, 'rest', params - 'gameId') AS j FROM activity ORDER BY id`)
    return {
      games: games.rows.map(row => row.j),
      tags: tags.rows.map(row => row.j),
      own: own.rows.map(row => row.j),
      activityRest: activityRest.rows.map(row => row.j),
    }
  }

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder

    await client.query(
      `INSERT INTO users (id, name, email, can_host) VALUES ($1, 'Owner', 'owner@example.com', true), ($2, 'Eins', 'eins@example.com', true), ($3, 'Zwei', 'zwei@example.com', true)`,
      [OWNER, H1, H2],
    )
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Drei', 'drei@example.com')`, [H3])
    await client.query(
      `INSERT INTO events (id, slug, invite_token, host_id, name, phase, deleted_at) VALUES
        ($1, 'e1', 'token-e1', $8, 'E1', 'running', NULL), ($2, 'e2', 'token-e2', $8, 'E2', 'running', NULL), ($3, 'e3', 'token-e3', $8, 'E3', 'finished', '2090-01-01T00:00:00Z'),
        ($4, 'e4', 'token-e4', $9, 'E4', 'running', NULL), ($5, 'e5', 'token-e5', $10, 'E5', 'running', NULL), ($6, 'e6', 'token-e6', $8, 'E6', 'poll', NULL),
        ($7, 'eo', 'token-eo', $11, 'EO', 'running', NULL)`,
      [E1, E2, E3, E4, E5, E6, EO, H1, H2, H3, OWNER],
    )

    // The games: H1's own, OWNER's own, and eleven of OWNER's that others refer to. POOL is the full one.
    for (const [id, name] of Object.entries(NAMES)) {
      await client.query(`INSERT INTO games (id, name, created_by, created_at, updated_at) VALUES ($1, $2, $3, '2026-01-10T08:00:00Z', '2026-01-11T09:00:00Z')`, [id, name, id === OWN ? H1 : OWNER])
    }
    await client.query(
      `UPDATE games SET image_key = $2, youtube_id = 'abcdefghijk', clip_start = 40, clip_length = 12, players_min = 2, players_max = 8,
        suitabilities = '{teams,ffa}', notes = $3, price_cents = 1999, price_source = 'steam', price_checked_at = '2026-10-01T00:00:00Z',
        created_at = '2026-02-03T10:00:00Z', updated_at = '2026-05-06T11:12:13Z' WHERE id = $1`,
      [POOL, `${POOL}-0123456789abcdef.webp`, 'Zeile eins\r\nZeile zwei\nZeile drei'],
    )
    // Three Tags in an order that is neither alphabetical nor the order of their `created_at`; another game has one of the same key.
    await client.query(
      `INSERT INTO game_tags (game_id, key, label, position, created_at) VALUES
        ($1, 'zombies', 'Zombies', 0, '2026-03-03T00:00:00Z'), ($1, 'co-op', 'Co-op', 1, '2026-01-01T00:00:00Z'), ($1, 'arcade', 'Arcade', 2, '2026-02-02T00:00:00Z'),
        ($2, 'co-op', 'CO-OP', 0, '2026-04-04T00:00:00Z')`,
      [POOL, ROUND],
    )

    // The Game pools. E1 holds OWN, POOL, SHARED and TWO; E4 holds TWO; E3 (soft-deleted) holds SOFT; E5 (no Host permission) holds NOPERM.
    await client.query(
      `INSERT INTO event_pool_games (event_id, game_id) VALUES ($1, $2), ($1, $3), ($1, $4), ($1, $5), ($6, $5), ($7, $8), ($9, $10), ($11, $12)`,
      [E1, OWN, POOL, SHARED, TWO, E4, E3, SOFT, E5, NOPERM, EO, OWNER_OWN],
    )

    // The Rounds (every one is set, as `rounds_set_game_check` wants). R_DRAWS holds the Draws below and is H1's own game.
    await client.query(
      `INSERT INTO rounds (id, event_id, game_id, started_at, set_at) VALUES ($1, $5, $6, $9, $9), ($2, $5, $7, $9, $9), ($3, $5, $6, $9, $9), ($4, $8, $10, $9, $9)`,
      [R_OWN, R_ROUND, R_DRAWS, R_SHARED, E1, OWN, ROUND, E2, T0, SHARED],
    )
    // A vetoed `set` Draw of a foreign game, and the spin Draws: the result in the column and in the list, a slice only, both, and the game twice in one list.
    await insertDraw(D_SET, R_DRAWS, DRAW, null, null)
    await insertDraw(D_SPIN, R_DRAWS, SPIN, [SPIN, OWN], 0)
    await insertDraw(D_SLICE, R_DRAWS, OWN, [OWN, SLICE], 0)
    await insertDraw(D_BOTH, R_DRAWS, SPIN, [SPIN, SLICE], 0)
    await insertDraw(D_TWICE, R_DRAWS, SPIN, [SPIN, OWN, SPIN], 2)

    // The Activity entries, `params` as the real ones (shared/activity.ts). ACT is named only here.
    const names = { 1: 'Rot', 2: null }
    await insertActivity(A_DRAWN, E1, 'game_drawn', { roundId: R_DRAWS, drawId: D_SET, gameId: ACT })
    await insertActivity(A_REVEALED, E1, 'vetoes_revealed', { roundId: R_DRAWS, drawId: D_SET, gameId: ACT, vetoes: [{ team: 1 }, { team: 2 }], teamNames: names })
    await insertActivity(A_SET, E1, 'game_set', { roundId: R_DRAWS, gameId: ACT })
    await insertActivity(A_PUT_BACK, E1, 'game_put_back', { roundId: R_DRAWS, gameId: ACT })
    await insertActivity(A_ENTERED, E1, 'result_entered', { roundId: R_DRAWS, number: 1, gameId: ACT, first: [1], teamNames: names })
    await insertActivity(A_CORRECTED, E1, 'result_corrected', { roundId: R_DRAWS, number: 1, gameId: ACT })
    await insertActivity(A_OWN, E1, 'game_set', { roundId: R_OWN, gameId: OWN })
    await insertActivity(A_COIN, E1, 'coin_tossed', { side: 'heads' })
    await insertActivity(A_PHANTOM, E1, 'game_set', { roundId: R_OWN, gameId: PHANTOM })

    gamesBefore = await count('games')
    closingBefore = await closing()
    snapshot = await snapshotRows()

    await migrateThrough(before.db, MIGRATION)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('leaves no reference to a game whose creator is not its Event\'s Host, in any table (the fixture reached each of them)', async () => {
    for (const kind of ['pool', 'rounds', 'draws', 'slices', 'activity'] as const) expect(closingBefore[kind], kind).toBeGreaterThanOrEqual(1)

    expect(await closing()).toEqual({ pool: 0, rounds: 0, draws: 0, slices: 0, activity: 0 })
  })

  it('makes one copy per pair and none for a game of the Host\'s own', async () => {
    expect(await count('games')).toBe(gamesBefore + 11)
    for (const [original, host] of PAIRS) {
      const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM games WHERE name = $1 AND created_by = $2`, [NAMES[original], host])
      expect(rows[0]!.count, `${NAMES[original]} for ${host}`).toBe(1)
    }
    for (const own of [OWN, OWNER_OWN]) {
      const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM games WHERE name = $1`, [NAMES[own]])
      expect(rows[0]!.count, NAMES[own]).toBe(1)
    }
  })

  it('makes one copy for a Host with two Events on the same game, and two copies for two Hosts on the same game', async () => {
    const shared = await copyOf(SHARED, H1)
    const pool = await client.query<{ game_id: string }>(`SELECT game_id FROM event_pool_games WHERE event_id = $1 AND game_id = $2`, [E1, shared])
    const round = await client.query<{ game_id: string }>(`SELECT game_id FROM rounds WHERE id = $1`, [R_SHARED])
    expect(pool.rows).toHaveLength(1)
    expect(round.rows).toEqual([{ game_id: shared }])

    const one = await copyOf(TWO, H1)
    const two = await copyOf(TWO, H2)
    expect(one).not.toBe(two)
    const h1Pool = await client.query<{ game_id: string }>(`SELECT game_id FROM event_pool_games WHERE event_id = $1 AND game_id IN ($2, $3)`, [E1, one, two])
    const h2Pool = await client.query<{ game_id: string }>(`SELECT game_id FROM event_pool_games WHERE event_id = $1`, [E4])
    expect(h1Pool.rows).toEqual([{ game_id: one }])
    expect(h2Pool.rows).toEqual([{ game_id: two }])
  })

  it('moves every kind of reference: pool row, Round, vetoed Draw, spin Draw (column and list), slice only, and the six Activity types', async () => {
    const pool = await client.query<{ game_id: string }>(`SELECT game_id FROM event_pool_games WHERE event_id = $1 ORDER BY game_id`, [E1])
    expect(pool.rows.map(row => row.game_id).sort()).toEqual([OWN, await copyOf(POOL, H1), await copyOf(SHARED, H1), await copyOf(TWO, H1)].sort())

    const round = await client.query<{ game_id: string }>(`SELECT game_id FROM rounds WHERE id = $1`, [R_ROUND])
    expect(round.rows).toEqual([{ game_id: await copyOf(ROUND, H1) }])

    const draws = await client.query<{ id: string, game_id: string, slice_game_ids: string[] | null }>(`SELECT id, game_id, slice_game_ids FROM draws`)
    const draw = (id: string) => draws.rows.find(row => row.id === id)
    const spin = await copyOf(SPIN, H1)
    const slice = await copyOf(SLICE, H1)
    expect(draw(D_SET)).toEqual({ id: D_SET, game_id: await copyOf(DRAW, H1), slice_game_ids: null })
    expect(draw(D_SPIN)).toEqual({ id: D_SPIN, game_id: spin, slice_game_ids: [spin, OWN] })
    // A slice only: H1's own game and the order stay, the foreign one is replaced.
    expect(draw(D_SLICE)).toEqual({ id: D_SLICE, game_id: OWN, slice_game_ids: [OWN, slice] })
    expect(draw(D_BOTH)).toEqual({ id: D_BOTH, game_id: spin, slice_game_ids: [spin, slice] })
    // `array_replace` takes every occurrence.
    expect(draw(D_TWICE)).toEqual({ id: D_TWICE, game_id: spin, slice_game_ids: [spin, OWN, spin] })

    const act = await copyOf(ACT, H1)
    const entries = await client.query<{ id: string, game_id: string, rest: Json }>(`SELECT id, params->>'gameId' AS game_id, params - 'gameId' AS rest FROM activity WHERE id = ANY($1::uuid[])`, [SIX])
    expect(entries.rows).toHaveLength(6)
    for (const entry of entries.rows) {
      expect(entry.game_id, entry.id).toBe(act)
      expect({ id: entry.id, rest: entry.rest }, entry.id).toEqual(snapshot.activityRest.find(row => row.id === entry.id))
    }
  })

  it('keeps draws_result_check and keeps it true: the result slice is the drawn game', async () => {
    const constraint = await client.query<{ conname: string }>(`SELECT conname FROM pg_constraint WHERE conname = 'draws_result_check'`)
    expect(constraint.rows).toHaveLength(1)

    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM draws WHERE kind = 'spin' AND slice_game_ids[result_index + 1] <> game_id`)
    expect(rows).toEqual([{ count: 0 }])
  })

  it('includes a soft-deleted Event, and gives a Host without the Host permission its copy', async () => {
    const soft = await copyOf(SOFT, H1)
    const pool = await client.query<{ game_id: string, deleted: boolean }>(`SELECT epg.game_id, ev.deleted_at IS NOT NULL AS deleted FROM event_pool_games epg JOIN events ev ON ev.id = epg.event_id WHERE epg.event_id = $1`, [E3])
    expect(pool.rows).toEqual([{ game_id: soft, deleted: true }])

    const noperm = await copyOf(NOPERM, H3)
    const host = await client.query<{ can_host: boolean }>(`SELECT can_host FROM users WHERE id = $1`, [H3])
    expect(host.rows).toEqual([{ can_host: false }])
    const pool5 = await client.query<{ game_id: string }>(`SELECT game_id FROM event_pool_games WHERE event_id = $1`, [E5])
    expect(pool5.rows).toEqual([{ game_id: noperm }])
  })

  it('gives a copy everything its original has, and the Host as creator', async () => {
    const copy = await copyOf(POOL, H1)
    const { rows } = await client.query<{ original: Json, copy: Json }>(
      `SELECT to_jsonb(o) AS original, to_jsonb(c) AS copy FROM games o, games c WHERE o.id = $1 AND c.id = $2`, [POOL, copy],
    )
    const { original, copy: copied } = rows[0]!
    expect(copied.id).not.toBe(original.id)
    expect(copied.created_by).toBe(H1)
    // Every other column equal, `created_at` and `updated_at` included (not `now()`).
    const rest = (game: Json) => Object.fromEntries(Object.entries(game).filter(([key]) => key !== 'id' && key !== 'created_by'))
    expect(rest(copied)).toEqual(rest(original))
    expect(copied).toMatchObject({
      name: 'Alpha',
      image_key: `${POOL}-0123456789abcdef.webp`,
      youtube_id: 'abcdefghijk',
      clip_start: 40,
      clip_length: 12,
      players_min: 2,
      players_max: 8,
      suitabilities: ['teams', 'ffa'],
      notes: 'Zeile eins\r\nZeile zwei\nZeile drei',
      price_cents: 1999,
      price_source: 'steam',
    })
    expect(new Date(copied.created_at as string)).toEqual(new Date('2026-02-03T10:00:00Z'))
    expect(new Date(copied.updated_at as string)).toEqual(new Date('2026-05-06T11:12:13Z'))
    expect(new Date(copied.price_checked_at as string)).toEqual(new Date('2026-10-01T00:00:00Z'))

    // The same image object: the key is stored twice, no second upload.
    const key = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM games WHERE image_key = $1`, [`${POOL}-0123456789abcdef.webp`])
    expect(key.rows).toEqual([{ count: 2 }])

    const tagsOf = async (game: string) => (await client.query<{ key: string, label: string, position: number, created_at: Date }>(
      `SELECT key, label, position, created_at FROM game_tags WHERE game_id = $1 ORDER BY position`, [game],
    )).rows
    const originalTags = await tagsOf(POOL)
    expect(originalTags.map(tag => tag.key)).toEqual(['zombies', 'co-op', 'arcade'])
    expect(await tagsOf(copy)).toEqual(originalTags)
  })

  it('leaves every original game, every Tag row and H1\'s own rows byte for byte as they were', async () => {
    const after = await snapshotRows()
    const originals = new Set(snapshot.games.map(game => game.id))
    expect(after.games.filter(game => originals.has(game.id))).toEqual(snapshot.games)
    expect(after.tags.filter(tag => originals.has(tag.game_id))).toEqual(snapshot.tags)
    expect(after.own).toEqual(snapshot.own)
    expect(after.activityRest.filter(row => !SIX.includes(row.id as string))).toEqual(snapshot.activityRest.filter(row => !SIX.includes(row.id as string)))
  })

  it('leaves an Activity entry that names an id no game has, one without a game and one of the Host\'s own game as they were', async () => {
    const { rows } = await client.query<{ id: string, params: Json }>(`SELECT id, params FROM activity WHERE id = ANY($1::uuid[]) ORDER BY id`, [[A_OWN, A_COIN, A_PHANTOM]])
    expect(rows).toEqual([
      { id: A_OWN, params: { roundId: R_OWN, gameId: OWN } },
      { id: A_COIN, params: { side: 'heads' } },
      { id: A_PHANTOM, params: { roundId: R_OWN, gameId: PHANTOM } },
    ])
  })

  // Before the previous deployment's writes (next test): that one leaves a cross-library pool row, which a second run would rightly copy.
  it('applies once: its statement run again changes nothing, there is no foreign reference left to copy', async () => {
    const games = await count('games')
    const tags = await count('game_tags')
    const closed = await closing()

    await client.exec(readFileSync(MIGRATION_SQL, 'utf8'))

    expect(await count('games')).toBe(games)
    expect(await count('game_tags')).toBe(tags)
    expect(await closing()).toEqual(closed)
  })

  // The 0.15 code that serves while 0.16 builds (ADR 0007): its queries, as raw SQL.
  it('lets the code before the switch-over insert and update games with explicit columns, and write a pool row of another Host\'s game', async () => {
    const created = uid('b', 50)
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Neu', $2)`, [created, H1])
    await client.query(`UPDATE games SET name = 'Neu bearbeitet', updated_at = now() WHERE id = $1`, [created])
    const { rows } = await client.query<{ name: string }>(`SELECT name FROM games WHERE id = $1`, [created])
    expect(rows).toEqual([{ name: 'Neu bearbeitet' }])

    // A cross-library row: the schema takes it, so no constraint was added.
    await client.query(`INSERT INTO event_pool_games (event_id, game_id) VALUES ($1, $2)`, [E6, OWNER_OWN])
    const pool = await client.query<{ game_id: string }>(`SELECT game_id FROM event_pool_games WHERE event_id = $1`, [E6])
    expect(pool.rows).toEqual([{ game_id: OWNER_OWN }])
  })
})

describe('migration: a copy of each game per Host, on an empty database', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    await migrateThrough(before.db, MIGRATION)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('applies and leaves no game behind: there is no pair to copy', async () => {
    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM games`)
    expect(rows).toEqual([{ count: 0 }])
  })
})
