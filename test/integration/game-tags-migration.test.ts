import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds the game Tags (#335, spec #332, ADR 0007): a `game_tags` table, unique per game and key, cascading with
// its game. The code that serves until the switch-over never reads or writes it and inserts and updates `games` with explicit columns.

const MIGRATION = '0027_game_tags'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const GAME_A = '00000000-0000-4000-8000-0000000000b1'
const GAME_B = '00000000-0000-4000-8000-0000000000b2'
const GAME_NEW = '00000000-0000-4000-8000-0000000000b3'

describe('migration: game Tags', () => {
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

  it('leaves the games that exist without Tags', async () => {
    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM game_tags`)
    expect(rows).toEqual([{ count: 0 }])
  })

  it('has the columns of a Tag, all required, the instant with a default', async () => {
    const { rows } = await client.query<{ column_name: string, data_type: string, is_nullable: string, column_default: string | null }>(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'game_tags' ORDER BY column_name`,
    )
    expect(rows.map(({ column_name, data_type, is_nullable }) => ({ column_name, data_type, is_nullable }))).toEqual([
      { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      { column_name: 'game_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'key', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'label', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'position', data_type: 'integer', is_nullable: 'NO' },
    ])
    expect(rows.find(row => row.column_name === 'created_at')?.column_default).not.toBeNull()
  })

  it('refuses a game\'s key twice and takes the same key on another game', async () => {
    await client.query(`INSERT INTO game_tags (game_id, key, label, position) VALUES ($1, 'co-op', 'Co-op', 0)`, [GAME_A])
    await expect(client.query(`INSERT INTO game_tags (game_id, key, label, position) VALUES ($1, 'co-op', 'CO-OP', 1)`, [GAME_A])).rejects.toThrow(/game_tags_game_id_key_pk/)
    await client.query(`INSERT INTO game_tags (game_id, key, label, position) VALUES ($1, 'co-op', 'Co-op', 0)`, [GAME_B])
  })

  it('refuses a negative position and a game that does not exist', async () => {
    await expect(client.query(`INSERT INTO game_tags (game_id, key, label, position) VALUES ($1, 'retro', 'Retro', -1)`, [GAME_A])).rejects.toThrow(/game_tags_position_check/)
    await expect(client.query(`INSERT INTO game_tags (game_id, key, label, position) VALUES ('00000000-0000-4000-8000-0000000000ff', 'retro', 'Retro', 0)`)).rejects.toThrow(/game_tags_game_id_games_id_fk/)
  })

  it('has the index on the key', async () => {
    const { rows } = await client.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE tablename = 'game_tags' AND indexname = 'game_tags_key_idx'`)
    expect(rows).toHaveLength(1)
  })

  it('lets the code before the switch-over insert and update games with explicit columns, and leaves the Tags as they were', async () => {
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Drei', $2)`, [GAME_NEW, HOST])
    await client.query(`UPDATE games SET name = 'Drei neu', updated_at = now() WHERE id = $1`, [GAME_NEW])

    const games = await client.query<{ name: string }>(`SELECT name FROM games WHERE id = $1`, [GAME_NEW])
    expect(games.rows).toEqual([{ name: 'Drei neu' }])
    const tags = await client.query<{ game_id: string, key: string }>(`SELECT game_id, key FROM game_tags ORDER BY game_id`)
    expect(tags.rows).toEqual([{ game_id: GAME_A, key: 'co-op' }, { game_id: GAME_B, key: 'co-op' }])
  })

  it('deletes a game\'s Tags with the game and not another game\'s', async () => {
    await client.query(`DELETE FROM games WHERE id = $1`, [GAME_A])

    const { rows } = await client.query<{ game_id: string }>(`SELECT game_id FROM game_tags`)
    expect(rows).toEqual([{ game_id: GAME_B }])
  })

  it('applies once: a second run changes nothing', async () => {
    await migrate()
    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM game_tags`)
    expect(rows).toEqual([{ count: 1 }])
  })
})
