import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateThrough } from './harness'

// The migration that makes the Game pool one list (#286, ADR 0014), step 1 of 2: leftover `tiebreaker` rows go, the primary key
// becomes (event_id, game_id), `pool` gets the default 'main'. The column and the type stay: the 0.8 code serves until the
// switch-over (ADR 0007), and it still selects and inserts `pool = 'main'`. #301 (0026) drops them, so the database here stops
// at this migration.

const MIGRATION = '0024_one_game_pool'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const E1 = '00000000-0000-4000-8000-0000000000e1'
const E2 = '00000000-0000-4000-8000-0000000000e2'
const A = '00000000-0000-4000-8000-0000000000a2'
const B = '00000000-0000-4000-8000-0000000000b2'
const C = '00000000-0000-4000-8000-0000000000c2'
const D = '00000000-0000-4000-8000-0000000000d2'

describe('migration: one Game pool', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'eins', 'token-eins', $3, 'eins', 'poll'), ($2, 'zwei', 'token-zwei', $3, 'zwei', 'poll')`, [E1, E2, HOST])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Alpha', $5), ($2, 'Beta', $5), ($3, 'Gamma', $5), ($4, 'Delta', $5)`, [A, B, C, D, HOST])
    // Two Events; E1 holds A in both pools (the old key allowed it), and each has a game that only the Tiebreaker pool holds.
    await client.query(
      `INSERT INTO event_pool_games (event_id, game_id, pool) VALUES ($1, $3, 'main'), ($1, $3, 'tiebreaker'), ($1, $4, 'main'), ($1, $5, 'tiebreaker'), ($2, $4, 'main'), ($2, $6, 'tiebreaker')`,
      [E1, E2, A, B, C, D],
    )
    await migrateThrough(before.db, MIGRATION)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('keeps every Game pool pair and deletes every Tiebreaker row', async () => {
    const { rows } = await client.query<{ event_id: string, game_id: string, pool: string }>(`SELECT event_id, game_id, pool FROM event_pool_games ORDER BY event_id, game_id`)

    expect(rows).toEqual([
      { event_id: E1, game_id: A, pool: 'main' },
      { event_id: E1, game_id: B, pool: 'main' },
      { event_id: E2, game_id: B, pool: 'main' },
    ])
  })

  it('keys the table by (event_id, game_id) alone', async () => {
    const { rows } = await client.query<{ column_name: string }>(`
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = 'event_pool_games'::regclass AND i.indisprimary
      ORDER BY a.attname`)

    expect(rows.map(row => row.column_name)).toEqual(['event_id', 'game_id'])
    await expect(client.query(`INSERT INTO event_pool_games (event_id, game_id) VALUES ($1, $2)`, [E1, A])).rejects.toThrow(/duplicate key/)
  })

  it('stores main for an insert without pool', async () => {
    await client.query(`INSERT INTO event_pool_games (event_id, game_id) VALUES ($1, $2)`, [E2, C])

    const { rows } = await client.query<{ pool: string }>(`SELECT pool FROM event_pool_games WHERE event_id = $1 AND game_id = $2`, [E2, C])
    expect(rows).toEqual([{ pool: 'main' }])
    await client.query(`DELETE FROM event_pool_games WHERE event_id = $1 AND game_id = $2`, [E2, C])
  })

  // The 0.8 code that serves while 0.9 builds: its queries, as raw SQL.
  describe('the 0.8 code, which still names pool', () => {
    it('finds the Game pool with pool = main', async () => {
      const { rows } = await client.query<{ game_id: string }>(
        `SELECT g.id AS game_id FROM event_pool_games epg INNER JOIN games g ON epg.game_id = g.id WHERE epg.event_id = $1 AND epg.pool = 'main' ORDER BY lower(g.name)`,
        [E1],
      )

      expect(rows).toEqual([{ game_id: A }, { game_id: B }])
    })

    it('replaces the Game pool the way its settings save does: delete where pool = main, insert with pool = main', async () => {
      await client.query(`DELETE FROM event_pool_games WHERE event_id = $1 AND pool = 'main'`, [E2])
      await client.query(`INSERT INTO event_pool_games (event_id, game_id, pool) VALUES ($1, $2, 'main'), ($1, $3, 'main')`, [E2, C, D])

      const { rows } = await client.query<{ game_id: string }>(`SELECT game_id FROM event_pool_games WHERE event_id = $1 AND pool = 'main' ORDER BY game_id`, [E2])
      expect(rows).toEqual([{ game_id: C }, { game_id: D }])
    })
  })
})
