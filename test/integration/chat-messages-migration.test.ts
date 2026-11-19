import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds the Chat's Messages (#757, spec #719 § A, ADR 0007): a `messages` table, one row per Message, cascading with its Event.
// The code that serves until the switch-over never reads or writes it. A deleted Message keeps its row and loses its text (`messages_deleted_text_check`).

const MIGRATION = '0040_chat_messages'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const WRITER = '00000000-0000-4000-8000-0000000000a2'
const EVENT_1 = '00000000-0000-4000-8000-0000000000c1'
const EVENT_2 = '00000000-0000-4000-8000-0000000000c2'
const MESSAGE_1 = '00000000-0000-4000-8000-0000000000d1'
const MESSAGE_2 = '00000000-0000-4000-8000-0000000000d2'
const MESSAGE_3 = '00000000-0000-4000-8000-0000000000d3'
const T1 = '2026-11-19T18:00:00Z'
const T2 = '2026-11-19T18:01:00Z'

const COUNTED = ['users', 'events', 'event_game_notes', 'rounds', 'activity']

describe('migration: Chat Messages', () => {
  let client: PGlite
  let folder: string
  let migrate: () => Promise<void>
  let countsBefore: Record<string, number>

  async function counts() {
    const result: Record<string, number> = {}
    for (const table of COUNTED) {
      const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`)
      result[table] = rows[0]!.count
    }
    return result
  }

  async function refused(sql: string, params: unknown[] = []): Promise<string> {
    try {
      await client.query(sql, params)
    }
    catch (failure) {
      return (failure as { constraint?: string, message: string }).constraint ?? (failure as Error).message
    }
    return 'accepted'
  }

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    migrate = () => migrateTo(before.db)
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com'), ($2, 'Writer', 'writer@example.com')`, [HOST, WRITER])
    await client.query(`INSERT INTO events (id, slug, name, host_id, invite_token, phase) VALUES ($1, 'eins', 'Eins', $3, 'tok-1', 'running'), ($2, 'zwei', 'Zwei', $3, 'tok-2', 'running')`, [EVENT_1, EVENT_2, HOST])
    countsBefore = await counts()
    await migrate()
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('has the columns of a Message, the id and the instant with no default, and the deletion columns nullable', async () => {
    const { rows } = await client.query<{ column_name: string, data_type: string, is_nullable: string, column_default: string | null }>(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'messages' ORDER BY ordinal_position`,
    )
    expect(rows.map(({ column_name, data_type, is_nullable }) => ({ column_name, data_type, is_nullable }))).toEqual([
      { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'event_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'writer_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'text', data_type: 'text', is_nullable: 'YES' },
      { column_name: 'written_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      { column_name: 'deleted_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
      { column_name: 'deleted_by', data_type: 'USER-DEFINED', is_nullable: 'YES' },
    ])
    expect(rows.find(row => row.column_name === 'id')?.column_default).toBeNull()
    expect(rows.find(row => row.column_name === 'written_at')?.column_default).toBeNull()
  })

  it('has the two values of who deleted a Message, host and writer', async () => {
    const { rows } = await client.query<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'message_deleter' ORDER BY e.enumsortorder`,
    )
    expect(rows.map(row => row.enumlabel)).toEqual(['host', 'writer'])
  })

  it('refuses a second row with one id, an Event or a writer that does not exist, and a NULL instant or writer', async () => {
    await client.query(`INSERT INTO messages (id, event_id, writer_id, text, written_at) VALUES ($1, $2, $3, 'Hallo', $4)`, [MESSAGE_1, EVENT_1, WRITER, T1])
    expect(await refused(`INSERT INTO messages (id, event_id, writer_id, text, written_at) VALUES ($1, $2, $3, 'Doppelt', $4)`, [MESSAGE_1, EVENT_1, WRITER, T2])).toBe('messages_pkey')
    expect(await refused(`INSERT INTO messages (id, event_id, writer_id, text, written_at) VALUES ($1, $2, $3, 'Hallo', $4)`, [MESSAGE_2, '00000000-0000-4000-8000-0000000000ff', WRITER, T1])).toBe('messages_event_id_events_id_fk')
    expect(await refused(`INSERT INTO messages (id, event_id, writer_id, text, written_at) VALUES ($1, $2, $3, 'Hallo', $4)`, [MESSAGE_2, EVENT_1, '00000000-0000-4000-8000-0000000000ff', T1])).toBe('messages_writer_id_users_id_fk')
    expect(await refused(`INSERT INTO messages (id, event_id, writer_id, text, written_at) VALUES ($1, $2, $3, 'Hallo', NULL)`, [MESSAGE_2, EVENT_1, WRITER])).toMatch(/not-null|null value/i)
    expect(await refused(`INSERT INTO messages (id, event_id, writer_id, text, written_at) VALUES ($1, $2, NULL, 'Hallo', $3)`, [MESSAGE_2, EVENT_1, T1])).toMatch(/not-null|null value/i)
  })

  it('refuses a deleted Message that still holds its text, and a live Message with no text', async () => {
    expect(await refused(`INSERT INTO messages (id, event_id, writer_id, text, written_at, deleted_at, deleted_by) VALUES ($1, $2, $3, 'Noch da', $4, $5, 'writer')`, [MESSAGE_2, EVENT_1, WRITER, T1, T2])).toBe('messages_deleted_text_check')
    expect(await refused(`INSERT INTO messages (id, event_id, writer_id, text, written_at) VALUES ($1, $2, $3, NULL, $4)`, [MESSAGE_2, EVENT_1, WRITER, T1])).toBe('messages_deleted_text_check')
  })

  it('refuses a deletion time without who deleted it, and who deleted it without a time', async () => {
    expect(await refused(`INSERT INTO messages (id, event_id, writer_id, text, written_at, deleted_at) VALUES ($1, $2, $3, NULL, $4, $5)`, [MESSAGE_2, EVENT_1, WRITER, T1, T2])).toBe('messages_deleted_pair_check')
    expect(await refused(`INSERT INTO messages (id, event_id, writer_id, text, written_at, deleted_by) VALUES ($1, $2, $3, 'Hallo', $4, 'host')`, [MESSAGE_2, EVENT_1, WRITER, T1])).toBe('messages_deleted_pair_check')
  })

  it('refuses a deleted_by that is neither host nor writer', async () => {
    expect(await refused(`INSERT INTO messages (id, event_id, writer_id, text, written_at, deleted_at, deleted_by) VALUES ($1, $2, $3, NULL, $4, $5, 'niemand')`, [MESSAGE_2, EVENT_1, WRITER, T1, T2])).toMatch(/invalid input value for enum/)
  })

  it('accepts a live Message, and a deleted one with no text, by the Host or by its writer', async () => {
    await client.query(`INSERT INTO messages (id, event_id, writer_id, text, written_at) VALUES ($1, $2, $3, 'Lebt', $4)`, [MESSAGE_2, EVENT_1, WRITER, T2])
    await client.query(`INSERT INTO messages (id, event_id, writer_id, text, written_at, deleted_at, deleted_by) VALUES ($1, $2, $3, NULL, $4, $5, 'host')`, [MESSAGE_3, EVENT_1, HOST, T1, T2])
    const { rows } = await client.query<{ id: string, deleted_by: string | null, text: string | null }>(`SELECT id, deleted_by, text FROM messages ORDER BY id`)
    expect(rows).toEqual([
      { id: MESSAGE_1, deleted_by: null, text: 'Hallo' },
      { id: MESSAGE_2, deleted_by: null, text: 'Lebt' },
      { id: MESSAGE_3, deleted_by: 'host', text: null },
    ])
  })

  it('has the index on the Event and the instant it is read by', async () => {
    const { rows } = await client.query<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE tablename = 'messages' AND indexname = 'messages_event_id_written_at_idx'`)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.indexdef).toMatch(/\(event_id, written_at\)/)
  })

  it('deletes an Event\'s Messages with the Event and not another Event\'s', async () => {
    await client.query(`INSERT INTO messages (id, event_id, writer_id, text, written_at) VALUES ($1, $2, $3, 'Zweites Event', $4)`, ['00000000-0000-4000-8000-0000000000e1', EVENT_2, WRITER, T1])
    await client.query(`DELETE FROM events WHERE id = $1`, [EVENT_1])

    const { rows } = await client.query<{ event_id: string }>(`SELECT event_id FROM messages`)
    expect(rows).toEqual([{ event_id: EVENT_2 }])
  })

  it('refuses to delete a User who wrote a Message: the rule of every reference to a User', async () => {
    await client.query(`INSERT INTO messages (id, event_id, writer_id, text, written_at) VALUES ($1, $2, $3, 'Bleibt', $4)`, ['00000000-0000-4000-8000-0000000000e2', EVENT_2, WRITER, T2])
    expect(await refused(`DELETE FROM users WHERE id = $1`, [WRITER])).toBe('messages_writer_id_users_id_fk')
  })

  it('changes no other table: the rows of the tables it does not touch are as before', async () => {
    const after = await counts()
    expect(after.users).toBe(countsBefore.users)
    expect(after.event_game_notes).toBe(countsBefore.event_game_notes)
    expect(after.rounds).toBe(countsBefore.rounds)
    expect(after.activity).toBe(countsBefore.activity)
  })

  it('applies once: a second run changes nothing', async () => {
    await migrate()
    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM messages`)
    expect(rows).toEqual([{ count: 2 }])
  })
})
