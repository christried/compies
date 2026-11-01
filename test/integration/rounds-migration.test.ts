import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds the tables of the game round (#228, spec #218 § Schema): Rounds, draws, Vetoes, Bonus Vetoes,
// coin tosses and the Countdown. They are new tables, so Events that exist keep working and the code that serves until the
// switch-over (ADR 0007) can still write them. The tables hold the invariants the later tickets rely on, so a rule the
// database enforces is tested here: one Round being drawn per Event, a set Round has its game, a Party's one Veto per draw.

const MIGRATION = '0017_rounds_and_draws'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const GAME = '00000000-0000-4000-8000-0000000000d1'
const OTHER_GAME = '00000000-0000-4000-8000-0000000000d2'
const EVENT = '00000000-0000-4000-8000-0000000000e1'
const OTHER_EVENT = '00000000-0000-4000-8000-0000000000e2'

const T0 = '2090-11-07T19:00:00Z'
const T1 = '2090-11-07T19:00:05Z'
const T2 = '2090-11-07T19:01:05Z'

describe('migration: rounds, draws, Vetoes, Bonus Vetoes, coin tosses and the Countdown', () => {
  let client: PGlite
  let folder: string

  async function insertEvent(id: string, slug: string) {
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, $2, $3, $4, $2, 'running')`, [id, slug, `token-${slug}`, HOST])
  }

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Halo', $3), ($2, 'Kart', $3)`, [GAME, OTHER_GAME, HOST])
    await insertEvent(EVENT, 'freitag')
    await insertEvent(OTHER_EVENT, 'samstag')
    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  async function refused(sql: string, params: unknown[] = []): Promise<string> {
    try {
      await client.query(sql, params)
    }
    catch (failure) {
      return (failure as { constraint?: string, message: string }).constraint ?? (failure as Error).message
    }
    return 'accepted'
  }

  const insertRound = (event: string, fields: { game?: string | null, setAt?: string | null, putBackAt?: string | null } = {}) => client.query<{ id: string }>(
    `INSERT INTO rounds (event_id, game_id, started_at, set_at, put_back_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [event, fields.game ?? null, T0, fields.setAt ?? null, fields.putBackAt ?? null],
  ).then(result => result.rows[0]!.id)

  it('leaves the Events that exist as they are', async () => {
    const { rows } = await client.query<{ slug: string }>(`SELECT slug FROM events ORDER BY slug`)

    expect(rows.map(row => row.slug)).toEqual(['freitag', 'samstag'])
  })

  it('lets an Event hold many Rounds that are set, but only one that is being drawn', async () => {
    await insertRound(EVENT, { game: GAME, setAt: T1 })
    await insertRound(EVENT, { game: OTHER_GAME, setAt: T1 })
    await insertRound(EVENT)

    expect(await refused(`INSERT INTO rounds (event_id, started_at) VALUES ($1, $2)`, [EVENT, T0])).toBe('rounds_one_drawn_per_event_idx')
    // Another Event has its own draw, and a put-back Round is no longer being drawn.
    await insertRound(OTHER_EVENT)
    expect(await refused(`INSERT INTO rounds (event_id, started_at, put_back_at) VALUES ($1, $2, $2)`, [OTHER_EVENT, T0])).toBe('rounds_put_back_after_set_check')
  })

  it('gives a Round its game exactly when it is set, and puts back only a set Round', async () => {
    expect(await refused(`INSERT INTO rounds (event_id, started_at, set_at) VALUES ($1, $2, $2)`, [OTHER_EVENT, T0])).toBe('rounds_set_game_check')
    expect(await refused(`INSERT INTO rounds (event_id, game_id, started_at) VALUES ($1, $2, $3)`, [OTHER_EVENT, GAME, T0])).toBe('rounds_set_game_check')
  })

  it('stores a set draw and a spin, which keeps what the replay needs', async () => {
    const round = await insertRound(OTHER_EVENT, { game: GAME, setAt: T1 })

    const set = await client.query(
      `INSERT INTO draws (round_id, game_id, source, kind, committed_at, stop_at, outcome, settled_at) VALUES ($1, $2, 'pool', 'set', $3, $3, 'set', $3)`,
      [round, GAME, T1],
    )
    const spin = await client.query(
      `INSERT INTO draws (round_id, game_id, source, kind, committed_at, spin_start_at, stop_at, veto_ends_at, slice_game_ids, slice_labels, result_index, result_offset)
       VALUES ($1, $2, 'pool', 'spin', $3, $4, $5, $6, $7, $8, 1, 0.25)`,
      [round, OTHER_GAME, T0, T1, T2, T2, [GAME, OTHER_GAME], ['Spiel A', 'Spiel B']],
    )

    expect(set.affectedRows).toBe(1)
    expect(spin.affectedRows).toBe(1)
  })

  it('refuses a draw that does not hang together', async () => {
    const round = await insertRound(OTHER_EVENT, { game: GAME, setAt: T1 })
    const insert = (columns: string, values: string, params: unknown[]) => refused(`INSERT INTO draws (round_id, game_id, source, kind, committed_at, stop_at, ${columns}) VALUES ($1, $2, 'pool', ${values})`, [round, GAME, ...params])

    // A spin without its slices, a set draw with some, a result that is not the drawn game, an offset outside the slice.
    expect(await insert('spin_start_at', `'spin', $3, $3, $3`, [T1])).toBe('draws_spin_check')
    expect(await insert('result_index', `'set', $3, $3, 0`, [T1])).toBe('draws_spin_check')
    expect(await insert('spin_start_at, slice_game_ids, result_index, result_offset', `'spin', $3, $3, $3, $4, 0, 0.5`, [T1, [OTHER_GAME]])).toBe('draws_result_check')
    expect(await insert('spin_start_at, slice_game_ids, result_index, result_offset', `'spin', $3, $3, $3, $4, 0, 1`, [T1, [GAME]])).toBe('draws_result_check')
    // An outcome without its instant, a stop before the commit, a window that ends before the stop.
    expect(await insert('outcome', `'set', $3, $3, 'set'`, [T1])).toBe('draws_settled_check')
    expect(await insert('outcome', `'set', $3, $4, NULL`, [T1, T0])).toBe('draws_instants_check')
    expect(await insert('veto_ends_at', `'set', $3, $4, $5`, [T1, T2, T1])).toBe('draws_instants_check')
  })

  it('lets a Party cast one Veto per draw, and another Party its own', async () => {
    const round = await insertRound(OTHER_EVENT, { game: GAME, setAt: T1 })
    const [draw] = (await client.query<{ id: string }>(
      `INSERT INTO draws (round_id, game_id, source, kind, committed_at, stop_at) VALUES ($1, $2, 'library', 'set', $3, $3) RETURNING id`,
      [round, GAME, T1],
    )).rows

    await client.query(`INSERT INTO vetoes (draw_id, team, user_id, cast_at) VALUES ($1, 1, $2, $3)`, [draw!.id, HOST, T1])
    await client.query(`INSERT INTO vetoes (draw_id, team, user_id, cast_at) VALUES ($1, 2, $2, $3)`, [draw!.id, HOST, T1])

    expect(await refused(`INSERT INTO vetoes (draw_id, team, user_id, cast_at) VALUES ($1, 1, $2, $3)`, [draw!.id, HOST, T2])).toBe('vetoes_draw_id_team_pk')
    expect(await refused(`INSERT INTO vetoes (draw_id, team, user_id, cast_at) VALUES ($1, 0, $2, $3)`, [draw!.id, HOST, T2])).toBe('vetoes_team_check')
  })

  it('stores a Bonus Veto and a coin toss, and refuses a toss that lands before it starts', async () => {
    await client.query(`INSERT INTO bonus_vetoes (event_id, team, granted_by, granted_at) VALUES ($1, 2, $2, $3)`, [EVENT, HOST, T1])
    await client.query(`INSERT INTO coin_tosses (event_id, side, tossed_by, started_at, lands_at) VALUES ($1, 'heads', $2, $3, $4)`, [EVENT, HOST, T1, T2])

    expect(await refused(`INSERT INTO coin_tosses (event_id, side, tossed_by, started_at, lands_at) VALUES ($1, 'tails', $2, $3, $4)`, [EVENT, HOST, T2, T1])).toBe('coin_tosses_lands_after_start_check')
    expect(await refused(`INSERT INTO coin_tosses (event_id, side, tossed_by, started_at, lands_at) VALUES ($1, 'edge', $2, $3, $3)`, [EVENT, HOST, T1])).toContain('coin_side')
    expect(await refused(`INSERT INTO bonus_vetoes (event_id, team, granted_by, granted_at) VALUES ($1, 0, $2, $3)`, [EVENT, HOST, T1])).toBe('bonus_vetoes_team_check')
  })

  it('holds one Countdown per Event, 5 seconds to 99:59, running or paused', async () => {
    await client.query(`INSERT INTO countdowns (event_id, duration_ms, remaining_ms) VALUES ($1, 300000, 300000)`, [EVENT])
    await client.query(`UPDATE countdowns SET started_at = $2, remaining_ms = 120000 WHERE event_id = $1`, [EVENT, T1])

    expect(await refused(`INSERT INTO countdowns (event_id, duration_ms, remaining_ms) VALUES ($1, 60000, 60000)`, [EVENT])).toBe('countdowns_pkey')
    expect(await refused(`INSERT INTO countdowns (event_id, duration_ms, remaining_ms) VALUES ($1, 4999, 4999)`, [OTHER_EVENT])).toBe('countdowns_duration_check')
    expect(await refused(`INSERT INTO countdowns (event_id, duration_ms, remaining_ms) VALUES ($1, 6000000, 6000000)`, [OTHER_EVENT])).toBe('countdowns_duration_check')
    expect(await refused(`INSERT INTO countdowns (event_id, duration_ms, remaining_ms) VALUES ($1, 60000, 60001)`, [OTHER_EVENT])).toBe('countdowns_remaining_check')
  })

  it('takes every one of them with the Event', async () => {
    const event = '00000000-0000-4000-8000-0000000000e3'
    await insertEvent(event, 'sonntag')
    const round = await insertRound(event, { game: GAME, setAt: T1 })
    await client.query(`INSERT INTO draws (round_id, game_id, source, kind, committed_at, stop_at) VALUES ($1, $2, 'pool', 'set', $3, $3)`, [round, GAME, T1])
    await client.query(`INSERT INTO bonus_vetoes (event_id, team, granted_by, granted_at) VALUES ($1, 1, $2, $3)`, [event, HOST, T1])
    await client.query(`INSERT INTO countdowns (event_id, duration_ms, remaining_ms) VALUES ($1, 60000, 60000)`, [event])

    await client.query(`DELETE FROM events WHERE id = $1`, [event])

    for (const table of ['rounds', 'bonus_vetoes', 'countdowns']) {
      const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table} WHERE event_id = $1`, [event])
      expect(rows[0]!.count, table).toBe(0)
    }
    expect((await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM draws WHERE round_id = $1`, [round])).rows[0]!.count).toBe(0)
  })
})
