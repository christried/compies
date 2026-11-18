import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds the Event notes (#731, spec #717 § E, ADR 0007): an `event_game_notes` table, one row per Event and game, cascading with
// its Event. The code that serves until the switch-over never reads or writes it and inserts and updates `games` and `events` with explicit columns.

const MIGRATION = '0039_event_game_notes'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const GAME_A = '00000000-0000-4000-8000-0000000000b1'
const GAME_B = '00000000-0000-4000-8000-0000000000b2'
const GAME_NEW = '00000000-0000-4000-8000-0000000000b3'
const EVENT_1 = '00000000-0000-4000-8000-0000000000c1'
const EVENT_2 = '00000000-0000-4000-8000-0000000000c2'
const EVENT_NEW = '00000000-0000-4000-8000-0000000000c3'
const NOTE = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hinweis' }] }] })

const COUNTED = ['games', 'events', 'event_pool_games', 'rounds']

describe('migration: Event notes', () => {
  let client: PGlite
  let folder: string
  let migrate: () => Promise<void>
  let columnsBefore: string[]
  let countsBefore: Record<string, number>

  async function gameColumns() {
    const { rows } = await client.query<{ column_name: string, data_type: string, is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'games' ORDER BY column_name`,
    )
    return rows.map(row => `${row.column_name}:${row.data_type}:${row.is_nullable}`)
  }

  async function counts() {
    const result: Record<string, number> = {}
    for (const table of COUNTED) {
      const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`)
      result[table] = rows[0]!.count
    }
    return result
  }

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    migrate = () => migrateTo(before.db)
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Eins', $3), ($2, 'Zwei', $3)`, [GAME_A, GAME_B, HOST])
    await client.query(`INSERT INTO events (id, slug, name, host_id, invite_token, phase) VALUES ($1, 'eins', 'Eins', $3, 'tok-1', 'running'), ($2, 'zwei', 'Zwei', $3, 'tok-2', 'running')`, [EVENT_1, EVENT_2, HOST])
    await client.query(`INSERT INTO event_pool_games (event_id, game_id) VALUES ($1, $2)`, [EVENT_1, GAME_A])
    columnsBefore = await gameColumns()
    countsBefore = await counts()
    await migrate()
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('has the columns of an Event note, all required, the instants with a default', async () => {
    const { rows } = await client.query<{ column_name: string, data_type: string, is_nullable: string, column_default: string | null }>(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'event_game_notes' ORDER BY column_name`,
    )
    expect(rows.map(({ column_name, data_type, is_nullable }) => ({ column_name, data_type, is_nullable }))).toEqual([
      { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      { column_name: 'event_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'game_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'notes', data_type: 'jsonb', is_nullable: 'NO' },
      { column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
    ])
    expect(rows.find(row => row.column_name === 'created_at')?.column_default).not.toBeNull()
    expect(rows.find(row => row.column_name === 'updated_at')?.column_default).not.toBeNull()
  })

  it('refuses a second row for one Event and game, and takes the game in another Event and another game in the Event', async () => {
    await client.query(`INSERT INTO event_game_notes (event_id, game_id, notes) VALUES ($1, $2, $3)`, [EVENT_1, GAME_A, NOTE])
    await expect(client.query(`INSERT INTO event_game_notes (event_id, game_id, notes) VALUES ($1, $2, $3)`, [EVENT_1, GAME_A, NOTE])).rejects.toThrow(/event_game_notes_event_id_game_id_pk/)
    await client.query(`INSERT INTO event_game_notes (event_id, game_id, notes) VALUES ($1, $2, $3)`, [EVENT_2, GAME_A, NOTE])
    await client.query(`INSERT INTO event_game_notes (event_id, game_id, notes) VALUES ($1, $2, $3)`, [EVENT_1, GAME_B, NOTE])
  })

  it('refuses a game that does not exist and a note that is null', async () => {
    await expect(client.query(`INSERT INTO event_game_notes (event_id, game_id, notes) VALUES ($1, '00000000-0000-4000-8000-0000000000ff', $2)`, [EVENT_1, NOTE])).rejects.toThrow(/event_game_notes_game_id_games_id_fk/)
    await expect(client.query(`INSERT INTO event_game_notes (event_id, game_id, notes) VALUES ($1, $2, NULL)`, [EVENT_2, GAME_B])).rejects.toThrow(/not-null|null value/i)
  })

  it('has the index on the game', async () => {
    const { rows } = await client.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE tablename = 'event_game_notes' AND indexname = 'event_game_notes_game_id_idx'`)
    expect(rows).toHaveLength(1)
  })

  it('changes no other table: the games\' columns and the rows of the tables it does not touch are as before', async () => {
    expect(await gameColumns()).toEqual(columnsBefore)
    expect(await counts()).toEqual(countsBefore)
  })

  it('lets the code before the switch-over insert and update games and events with explicit columns, and leaves the notes as they were', async () => {
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Drei', $2)`, [GAME_NEW, HOST])
    await client.query(`UPDATE games SET name = 'Drei neu', updated_at = now() WHERE id = $1`, [GAME_NEW])
    await client.query(`INSERT INTO events (id, slug, name, host_id, invite_token, phase) VALUES ($1, 'drei', 'Drei', $2, 'tok-3', 'poll')`, [EVENT_NEW, HOST])
    await client.query(`UPDATE events SET name = 'Drei neu' WHERE id = $1`, [EVENT_NEW])

    const games = await client.query<{ name: string }>(`SELECT name FROM games WHERE id = $1`, [GAME_NEW])
    expect(games.rows).toEqual([{ name: 'Drei neu' }])
    const notes = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM event_game_notes`)
    expect(notes.rows).toEqual([{ count: 3 }])
  })

  it('deletes an Event\'s notes with the Event and not another Event\'s', async () => {
    await client.query(`DELETE FROM events WHERE id = $1`, [EVENT_1])

    const { rows } = await client.query<{ event_id: string }>(`SELECT event_id FROM event_game_notes`)
    expect(rows).toEqual([{ event_id: EVENT_2 }])
  })

  it('applies once: a second run changes nothing', async () => {
    await migrate()
    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM event_game_notes`)
    expect(rows).toEqual([{ count: 1 }])
  })
})
