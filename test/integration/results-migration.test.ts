import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds the Result of a Round (#273, spec #272, ADR 0007): `rounds` gets `number`, `result_at` and `corrected_at`
// with their checks and a unique (event_id, number), the new table `round_places` holds the Places and Scores, and the Activity enum gets
// the three types of 0.8. The code that serves until the switch-over neither reads nor writes the new columns and table.

const MIGRATION = '0022_results'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const EVENT = '00000000-0000-4000-8000-0000000000e1'
const OTHER = '00000000-0000-4000-8000-0000000000e2'
const GAME = '00000000-0000-4000-8000-0000000000d1'
const GAME2 = '00000000-0000-4000-8000-0000000000d2'
const ROUND_SET = '00000000-0000-4000-8000-0000000000a3'
const ROUND_BACK = '00000000-0000-4000-8000-0000000000b1'
const ROUND_OLD = '00000000-0000-4000-8000-0000000000c1'
const ROUND_TWO = '00000000-0000-4000-8000-0000000000c2'
const ROUND_THREE = '00000000-0000-4000-8000-0000000000c3'
const ROUND_OTHER = '00000000-0000-4000-8000-0000000000c4'
const ROUND_DELETED = '00000000-0000-4000-8000-0000000000c5'
const ROUND_NEW = '00000000-0000-4000-8000-0000000000c6'

const T0 = '2090-11-07T19:00:00Z'
const T1 = '2090-11-07T20:00:00Z'

describe('migration: a Round takes its Result', () => {
  let client: PGlite
  let folder: string
  let migrate: () => Promise<void>

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    migrate = () => migrateTo(before.db)
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'eins', 'token-eins', $3, 'eins', 'running'), ($2, 'zwei', 'token-zwei', $3, 'zwei', 'running')`, [EVENT, OTHER, HOST])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Alpha', $3), ($2, 'Beta', $3)`, [GAME, GAME2, HOST])
    await client.query(
      `INSERT INTO rounds (id, event_id, game_id, started_at, set_at, put_back_at) VALUES ($1, $3, $4, $5, $5, NULL), ($2, $3, $4, $5, $5, $6)`,
      [ROUND_SET, ROUND_BACK, EVENT, GAME, T0, T1],
    )
    await client.query(`INSERT INTO activity (event_id, type, actor_id, params) VALUES ($1, 'member_joined', $2, '{}'::jsonb)`, [EVENT, HOST])
    await migrate()
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('leaves the Rounds that exist without a number and without a Result', async () => {
    const { rows } = await client.query<{ id: string, number: number | null, result_at: string | null, corrected_at: string | null }>(
      `SELECT id, number, result_at, corrected_at FROM rounds ORDER BY id`,
    )

    expect(rows).toEqual([
      { id: ROUND_SET, number: null, result_at: null, corrected_at: null },
      { id: ROUND_BACK, number: null, result_at: null, corrected_at: null },
    ])
  })

  it('lets the code before the switch-over insert a Round and put one back, and write an old Activity type', async () => {
    await client.query(`INSERT INTO rounds (id, event_id, game_id, started_at, set_at) VALUES ($1, $2, $3, $4, $4)`, [ROUND_OLD, EVENT, GAME2, T1])
    await client.query(`UPDATE rounds SET put_back_at = $2 WHERE id = $1`, [ROUND_OLD, T1])
    await client.query(`INSERT INTO activity (event_id, type, actor_id, params) VALUES ($1, 'game_set', $2, $3::jsonb)`, [EVENT, HOST, JSON.stringify({ roundId: ROUND_OLD, gameId: GAME2 })])

    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM activity WHERE event_id = $1`, [EVENT])
    expect(rows).toEqual([{ count: 2 }])
  })

  it('takes an entry of each of the three new Activity types, and keeps the old entries', async () => {
    await client.query(`INSERT INTO activity (event_id, type, params) VALUES ($1, 'result_entered', $2::jsonb), ($1, 'result_corrected', $3::jsonb), ($1, 'event_finished', $4::jsonb)`, [
      EVENT,
      JSON.stringify({ roundId: ROUND_SET, number: 1, gameId: GAME, first: [1] }),
      JSON.stringify({ roundId: ROUND_SET, number: 1, gameId: GAME }),
      JSON.stringify({ winners: [1] }),
    ])

    const { rows } = await client.query<{ type: string }>(`SELECT type FROM activity WHERE event_id = $1 ORDER BY type`, [EVENT])
    expect(rows.map(row => row.type).sort()).toEqual(['event_finished', 'game_set', 'member_joined', 'result_corrected', 'result_entered'])
  })

  it('refuses a number without a Result, a Result without a number, a number of 0, and a Result that does not stand', async () => {
    await expect(client.query(`UPDATE rounds SET number = 1 WHERE id = $1`, [ROUND_SET])).rejects.toThrow(/rounds_number_result_check/)
    await expect(client.query(`UPDATE rounds SET result_at = $2 WHERE id = $1`, [ROUND_SET, T1])).rejects.toThrow(/rounds_number_result_check/)
    await expect(client.query(`UPDATE rounds SET number = 0, result_at = $2 WHERE id = $1`, [ROUND_SET, T1])).rejects.toThrow(/rounds_number_positive_check/)
    await expect(client.query(`UPDATE rounds SET number = 1, result_at = $2 WHERE id = $1`, [ROUND_BACK, T1])).rejects.toThrow(/rounds_result_stands_check/)
    await expect(client.query(`UPDATE rounds SET number = 1, result_at = $2 WHERE id = $1`, [ROUND_OLD, T1])).rejects.toThrow(/rounds_result_stands_check/)
    await expect(client.query(`UPDATE rounds SET corrected_at = $2 WHERE id = $1`, [ROUND_SET, T1])).rejects.toThrow(/rounds_corrected_after_result_check/)
  })

  it('takes a Result on a set Round that stands', async () => {
    await client.query(`UPDATE rounds SET number = 1, result_at = $2 WHERE id = $1`, [ROUND_SET, T1])

    const { rows } = await client.query<{ number: number, result_at: Date }>(`SELECT number, result_at FROM rounds WHERE id = $1`, [ROUND_SET])
    expect(rows).toEqual([{ number: 1, result_at: new Date(T1) }])
  })

  it('numbers each Round of an Event once, but takes the same number in another Event and many unnumbered Rounds', async () => {
    await client.query(`INSERT INTO rounds (id, event_id, game_id, started_at, set_at) VALUES ($1, $2, $3, $4, $4), ($5, $2, $3, $4, $4)`, [ROUND_TWO, EVENT, GAME2, T1, ROUND_THREE])
    await expect(client.query(`UPDATE rounds SET number = 1, result_at = $2 WHERE id = $1`, [ROUND_TWO, T1])).rejects.toThrow(/rounds_event_id_number_unique/)

    await client.query(`INSERT INTO rounds (id, event_id, game_id, started_at, set_at, number, result_at) VALUES ($1, $2, $3, $4, $4, 1, $4)`, [ROUND_OTHER, OTHER, GAME, T1])
    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM rounds WHERE number IS NULL`)
    expect(rows).toEqual([{ count: 4 }])
  })

  it('takes a row of round_places, refuses a second row for the same team and a team or place below 1, and takes a NULL Score', async () => {
    await client.query(`INSERT INTO round_places (round_id, team, place, score) VALUES ($1, 1, 1, '16'), ($1, 2, 1, NULL)`, [ROUND_SET])
    await expect(client.query(`INSERT INTO round_places (round_id, team, place) VALUES ($1, 1, 2)`, [ROUND_SET])).rejects.toThrow(/round_places_pkey|duplicate key/)
    await expect(client.query(`INSERT INTO round_places (round_id, team, place) VALUES ($1, 0, 1)`, [ROUND_SET])).rejects.toThrow(/round_places_team_check/)
    await expect(client.query(`INSERT INTO round_places (round_id, team, place) VALUES ($1, 3, 0)`, [ROUND_SET])).rejects.toThrow(/round_places_place_check/)

    const { rows } = await client.query<{ team: number, score: string | null }>(`SELECT team, score FROM round_places WHERE round_id = $1 ORDER BY team`, [ROUND_SET])
    expect(rows).toEqual([{ team: 1, score: '16' }, { team: 2, score: null }])
  })

  it('deletes the places with their Round, and with their Event', async () => {
    await client.query(`INSERT INTO rounds (id, event_id, game_id, started_at, set_at) VALUES ($1, $2, $3, $4, $4)`, [ROUND_DELETED, OTHER, GAME2, T1])
    await client.query(`INSERT INTO round_places (round_id, team, place) VALUES ($1, 1, 1)`, [ROUND_DELETED])
    await client.query(`DELETE FROM rounds WHERE id = $1`, [ROUND_DELETED])
    const afterRound = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM round_places WHERE round_id = $1`, [ROUND_DELETED])
    expect(afterRound.rows).toEqual([{ count: 0 }])

    await client.query(`INSERT INTO round_places (round_id, team, place) VALUES ($1, 1, 1)`, [ROUND_OTHER])
    await client.query(`DELETE FROM events WHERE id = $1`, [OTHER])
    const afterEvent = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM round_places WHERE round_id = $1`, [ROUND_OTHER])
    expect(afterEvent.rows).toEqual([{ count: 0 }])
  })

  it('applies once: a second run changes nothing, and a Round without a number is still a Round', async () => {
    await migrate()
    await client.query(`INSERT INTO rounds (id, event_id, game_id, started_at, set_at) VALUES ($1, $2, $3, $4, $4)`, [ROUND_NEW, EVENT, GAME, T1])
    const { rows } = await client.query<{ number: number | null }>(`SELECT number FROM rounds WHERE id = $1`, [ROUND_NEW])
    expect(rows).toEqual([{ number: null }])
  })
})
