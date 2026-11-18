import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateThrough } from './harness'

// The migration that lets a game be archived (#467, spec #717 § B, ADR 0007): a nullable `games.archived_at`, null = not archived. The code that
// serves until the switch-over inserts and updates `games` with explicit columns and never names it. The database stops at this migration
// (`migrateThrough`): later 0.16 migrations change `games` too. Every name and id is invented.

const MIGRATION = '0037_game_archived_at'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const GAME_A = '00000000-0000-4000-8000-0000000000b1'
const GAME_B = '00000000-0000-4000-8000-0000000000b2'
const GAME_NEW = '00000000-0000-4000-8000-0000000000b3'

describe('migration: game archived_at', () => {
  let client: PGlite
  let folder: string
  let db: Awaited<ReturnType<typeof createTestDbBefore>>['db']

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    db = before.db
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Eins', $3), ($2, 'Zwei', $3)`, [GAME_A, GAME_B, HOST])
    await migrateThrough(db, MIGRATION)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  const archivedAtOf = async (id: string) =>
    (await client.query<{ archived_at: string | null }>(`SELECT archived_at FROM games WHERE id = $1`, [id])).rows[0]!.archived_at

  it('adds a nullable timestamp with time zone column', async () => {
    const { rows } = await client.query<{ data_type: string, is_nullable: string, column_default: string | null }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'archived_at'`,
    )
    expect(rows).toEqual([{ data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null }])
  })

  it('leaves every game that existed not archived', async () => {
    expect(await archivedAtOf(GAME_A)).toBeNull()
    expect(await archivedAtOf(GAME_B)).toBeNull()
  })

  it('still takes the previous deployment\'s statements, which never name the column', async () => {
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Drei', $2)`, [GAME_NEW, HOST])
    await client.query(`UPDATE games SET name = 'Eins neu', clip_length = 45 WHERE id = $1`, [GAME_A])
    const { rows } = await client.query<{ id: string, name: string, clip_length: number }>(
      `SELECT id, name, clip_length FROM games WHERE id = ANY($1) ORDER BY name`,
      [[GAME_A, GAME_NEW]],
    )
    expect(rows).toEqual([
      { id: GAME_NEW, name: 'Drei', clip_length: 30 },
      { id: GAME_A, name: 'Eins neu', clip_length: 45 },
    ])
    expect(await archivedAtOf(GAME_NEW)).toBeNull()
    expect(await archivedAtOf(GAME_A)).toBeNull()
  })

  it('keeps a stamp through an update of the previous deployment', async () => {
    await client.query(`UPDATE games SET archived_at = '2026-11-16T10:00:00Z' WHERE id = $1`, [GAME_B])
    await client.query(`UPDATE games SET name = 'Zwei neu', clip_length = 60 WHERE id = $1`, [GAME_B])
    const { rows } = await client.query<{ name: string, archived_at: Date }>(`SELECT name, archived_at FROM games WHERE id = $1`, [GAME_B])
    expect(rows[0]!.name).toBe('Zwei neu')
    expect(rows[0]!.archived_at.toISOString()).toBe('2026-11-16T10:00:00.000Z')
  })
})
