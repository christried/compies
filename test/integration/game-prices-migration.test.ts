import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds a game's Price (#337, spec #332, ADR 0007): three nullable columns on `games`, the source as an enum, and the
// checks that keep a Price whole (the day with the source, an amount only for a paid source, cents from 1 to 99 999). The code that
// serves until the switch-over inserts and updates `games` with explicit columns and never reads the new ones.

const MIGRATION = '0028_game_prices'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const GAME_A = '00000000-0000-4000-8000-0000000000b1'
const GAME_B = '00000000-0000-4000-8000-0000000000b2'
const GAME_CENT = '00000000-0000-4000-8000-0000000000b4'
const GAME_MAX = '00000000-0000-4000-8000-0000000000b5'
const GAME_NEW = '00000000-0000-4000-8000-0000000000b3'

const CHECKED = '2026-11-03T10:00:00Z'

describe('migration: a game takes a Price', () => {
  let client: PGlite
  let folder: string
  let migrate: () => Promise<void>

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    migrate = () => migrateTo(before.db)
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Eins', $3), ($2, 'Zwei', $3)`, [GAME_A, GAME_B, HOST])
    await migrate()
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('leaves the games that exist without a Price', async () => {
    const { rows } = await client.query<{ price_cents: number | null, price_source: string | null, price_checked_at: string | null }>(
      `SELECT price_cents, price_source, price_checked_at FROM games WHERE id IN ($1, $2) ORDER BY name`,
      [GAME_A, GAME_B],
    )
    expect(rows).toEqual([
      { price_cents: null, price_source: null, price_checked_at: null },
      { price_cents: null, price_source: null, price_checked_at: null },
    ])
  })

  it('has the three price columns, all nullable, with the types of a Price', async () => {
    const { rows } = await client.query<{ column_name: string, data_type: string, udt_name: string, is_nullable: string }>(
      `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_name = 'games' AND column_name LIKE 'price%' ORDER BY column_name`,
    )
    expect(rows).toEqual([
      { column_name: 'price_cents', data_type: 'integer', udt_name: 'int4', is_nullable: 'YES' },
      { column_name: 'price_checked_at', data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'YES' },
      { column_name: 'price_source', data_type: 'USER-DEFINED', udt_name: 'price_source', is_nullable: 'YES' },
    ])
  })

  it('has the sources of a Price in the order of the list', async () => {
    const { rows } = await client.query<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'price_source' ORDER BY e.enumsortorder`,
    )
    expect(rows.map(row => row.enumlabel)).toEqual(['steam', 'epic', 'gog', 'publisher', 'steam_key', 'free_to_play', 'subscription'])
  })

  it('accepts the Prices a Host can note: an amount, the smallest and the largest, and a free game', async () => {
    await client.query(`UPDATE games SET price_cents = 1999, price_source = 'steam', price_checked_at = $2 WHERE id = $1`, [GAME_A, CHECKED])
    await client.query(`UPDATE games SET price_source = 'free_to_play', price_checked_at = $2 WHERE id = $1`, [GAME_B, CHECKED])
    await client.query(`INSERT INTO games (id, name, created_by, price_cents, price_source, price_checked_at) VALUES ($1, 'Vier', $3, 1, 'steam', $2)`, [GAME_CENT, CHECKED, HOST])
    await client.query(`INSERT INTO games (id, name, created_by, price_cents, price_source, price_checked_at) VALUES ($1, 'Fünf', $3, 99999, 'steam', $2)`, [GAME_MAX, CHECKED, HOST])

    const { rows } = await client.query<{ id: string, price_cents: number | null, price_source: string | null }>(
      `SELECT id, price_cents, price_source FROM games WHERE price_checked_at IS NOT NULL ORDER BY id`,
    )
    expect(rows).toEqual([
      { id: GAME_A, price_cents: 1999, price_source: 'steam' },
      { id: GAME_B, price_cents: null, price_source: 'free_to_play' },
      { id: GAME_CENT, price_cents: 1, price_source: 'steam' },
      { id: GAME_MAX, price_cents: 99999, price_source: 'steam' },
    ])
  })

  it('refuses a source without its day, and a day without its source', async () => {
    await expect(client.query(`UPDATE games SET price_source = 'steam', price_checked_at = NULL WHERE id = $1`, [GAME_B]))
      .rejects.toThrow(/games_price_checked_pair_check/)
    await expect(client.query(`UPDATE games SET price_cents = NULL, price_source = NULL, price_checked_at = $2 WHERE id = $1`, [GAME_A, CHECKED]))
      .rejects.toThrow(/games_price_checked_pair_check/)
  })

  it('refuses an amount with a free or a subscription source', async () => {
    await expect(client.query(`UPDATE games SET price_cents = 500, price_source = 'free_to_play' WHERE id = $1`, [GAME_B]))
      .rejects.toThrow(/games_price_cents_source_check/)
    await expect(client.query(`UPDATE games SET price_cents = 500, price_source = 'subscription' WHERE id = $1`, [GAME_B]))
      .rejects.toThrow(/games_price_cents_source_check/)
  })

  it('refuses an amount without a source, which the NULL of a source would let through', async () => {
    await expect(client.query(`UPDATE games SET price_cents = 500, price_source = NULL, price_checked_at = NULL WHERE id = $1`, [GAME_B]))
      .rejects.toThrow(/games_price_cents_source_check/)
  })

  it('refuses an amount outside 0,01 to 999,99 with a source', async () => {
    for (const cents of [0, 100000, -5]) {
      await expect(client.query(`UPDATE games SET price_cents = $2, price_source = 'steam', price_checked_at = $3 WHERE id = $1`, [GAME_B, cents, CHECKED]))
        .rejects.toThrow(/games_price_cents_range_check/)
    }
  })

  it('lets the code before the switch-over insert and update games with explicit columns, and keeps the Price', async () => {
    await client.query(`UPDATE games SET price_cents = 2499, price_source = 'steam', price_checked_at = $2 WHERE id = $1`, [GAME_B, CHECKED])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Drei', $2)`, [GAME_NEW, HOST])
    await client.query(`UPDATE games SET name = 'Zwei neu', updated_at = now() WHERE id = $1`, [GAME_B])

    const { rows } = await client.query<{ name: string, price_cents: number | null, price_source: string | null }>(
      `SELECT name, price_cents, price_source FROM games WHERE id = $1`,
      [GAME_B],
    )
    expect(rows).toEqual([{ name: 'Zwei neu', price_cents: 2499, price_source: 'steam' }])
    const fresh = await client.query<{ price_cents: number | null, price_source: string | null, price_checked_at: string | null }>(
      `SELECT price_cents, price_source, price_checked_at FROM games WHERE id = $1`,
      [GAME_NEW],
    )
    expect(fresh.rows).toEqual([{ price_cents: null, price_source: null, price_checked_at: null }])
  })

  it('applies once: a second run changes nothing', async () => {
    const before = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM games`)
    await migrate()
    const after = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM games`)
    expect(after.rows).toEqual(before.rows)
  })
})
