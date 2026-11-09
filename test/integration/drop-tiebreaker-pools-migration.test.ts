import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateThrough } from './harness'

// The migration that drops the Tiebreaker pool (#279, ADR 0014): its rows are deleted, the Game pool's stay. The enum value
// stays, so the code that serves until the switch-over (ADR 0007) can still insert a `tiebreaker` row afterwards, and a
// later run of this migration leaves it alone. The database stops at this migration: 0024 deletes those rows and 0026 drops
// the column (#286, #301).

const MIGRATION = '0021_drop_tiebreaker_pools'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const E1 = '00000000-0000-4000-8000-0000000000e1'
const E2 = '00000000-0000-4000-8000-0000000000e2'
const A = '00000000-0000-4000-8000-0000000000a2'
const B = '00000000-0000-4000-8000-0000000000b2'
const C = '00000000-0000-4000-8000-0000000000c2'

describe('migration: the Tiebreaker pool is dropped', () => {
  let client: PGlite
  let folder: string
  let migrate: () => Promise<void>

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    migrate = () => migrateThrough(before.db, MIGRATION)
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'eins', 'token-eins', $3, 'eins', 'poll'), ($2, 'zwei', 'token-zwei', $3, 'zwei', 'poll')`, [E1, E2, HOST])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Alpha', $4), ($2, 'Beta', $4), ($3, 'Gamma', $4)`, [A, B, C, HOST])
    await client.query(
      `INSERT INTO event_pool_games (event_id, game_id, pool) VALUES ($1, $3, 'main'), ($1, $3, 'tiebreaker'), ($1, $4, 'tiebreaker'), ($2, $4, 'main'), ($2, $5, 'tiebreaker')`,
      [E1, E2, A, B, C],
    )
    await migrate()
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('deletes the Tiebreaker pool rows of every Event', async () => {
    const { rows } = await client.query(`SELECT event_id, game_id FROM event_pool_games WHERE pool = 'tiebreaker'`)

    expect(rows).toEqual([])
  })

  it('keeps the Game pool rows, and the games and Events', async () => {
    const { rows } = await client.query<{ event_id: string, game_id: string }>(`SELECT event_id, game_id FROM event_pool_games ORDER BY event_id`)
    const games = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM games`)
    const events = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM events`)

    expect(rows).toEqual([{ event_id: E1, game_id: A }, { event_id: E2, game_id: B }])
    expect(games.rows).toEqual([{ count: 3 }])
    expect(events.rows).toEqual([{ count: 2 }])
  })

  it('lets the code before the switch-over insert a Tiebreaker row, and a later migration run leaves it', async () => {
    await client.query(`INSERT INTO event_pool_games (event_id, game_id, pool) VALUES ($1, $2, 'tiebreaker')`, [E1, C])
    await migrate()

    const { rows } = await client.query<{ game_id: string }>(`SELECT game_id FROM event_pool_games WHERE pool = 'tiebreaker'`)
    expect(rows).toEqual([{ game_id: C }])
  })
})
