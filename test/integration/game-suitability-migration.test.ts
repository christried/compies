import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { games } from '../../server/db/schema'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that turns the games' Formats into Suitabilities (#171). Every game keeps its teams and ffa
// values; no game gets one_v_one by itself. The two indexes of the ticket exist afterwards.

const MIGRATION = '0007_game_suitability'

const HOST = '00000000-0000-4000-8000-0000000000a1'

describe('migration: game Suitabilities', () => {
  let client: PGlite
  let folder: string
  let db: Awaited<ReturnType<typeof createTestDbBefore>>['db']

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    db = before.db

    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO games (name, formats, created_by) VALUES ('Teams-Spiel', '{teams}', $1)`, [HOST])
    await client.query(`INSERT INTO games (name, formats, created_by) VALUES ('Jeder-gegen-jeden', '{ffa}', $1)`, [HOST])
    await client.query(`INSERT INTO games (name, formats, created_by) VALUES ('Beides', '{teams,ffa}', $1)`, [HOST])
    await client.query(`INSERT INTO games (name, formats, created_by) VALUES ('Brettspiel', '{}', $1)`, [HOST])

    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('keeps every game\'s Formats as its Suitabilities, and gives none one_v_one', async () => {
    const rows = await db.select({ name: games.name, suitabilities: games.suitabilities }).from(games)

    expect(rows.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: 'Beides', suitabilities: ['teams', 'ffa'] },
      { name: 'Brettspiel', suitabilities: [] },
      { name: 'Jeder-gegen-jeden', suitabilities: ['ffa'] },
      { name: 'Teams-Spiel', suitabilities: ['teams'] },
    ])
    expect(rows.flatMap(row => row.suitabilities)).not.toContain('one_v_one')
  })

  it('adds the indexes on games.image_key and event_pool_games.game_id', async () => {
    const { rows } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE indexname IN ('games_image_key_idx', 'event_pool_games_game_id_idx') ORDER BY indexname`,
    )

    expect(rows.map(row => row.indexname)).toEqual(['event_pool_games_game_id_idx', 'games_image_key_idx'])
  })
})
