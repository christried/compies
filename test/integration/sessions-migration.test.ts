import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that gives each Event its Session (ADR 0011, #48). It is the one step that cannot be
// undone on prod, so this test seeds the database as it was before the migration, applies it and checks
// that every Event keeps everything and ends with one Session that carries its Date.

const MIGRATION = '0003_sessions'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const GUEST = '00000000-0000-4000-8000-0000000000a2'

// Three Events of the pre-#48 shape: one in the poll, one with a set Date and a withdrawn Date, and one
// direct Event whose Date is no Slot.
const POLL = '00000000-0000-4000-8000-0000000000e1'
const SET = '00000000-0000-4000-8000-0000000000e2'
const DIRECT = '00000000-0000-4000-8000-0000000000e3'

const POLL_SLOT_1 = '00000000-0000-4000-8000-0000000000b1'
const POLL_SLOT_2 = '00000000-0000-4000-8000-0000000000b2'
const SET_SLOT_1 = '00000000-0000-4000-8000-0000000000b3'
const SET_SLOT_2 = '00000000-0000-4000-8000-0000000000b4'

const iso = (value: string) => new Date(value).toISOString()

describe('migration: Event Date moves to its Session', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder

    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com'), ($2, 'Gast', 'guest@example.com')`, [HOST, GUEST])

    // Event rows in the pre-#48 columns: date_mode, starts_at, previous_starts_at and ics_sequence sit on the Event.
    await client.query(`
      INSERT INTO events (id, slug, invite_token, host_id, name, phase, date_mode, starts_at, previous_starts_at, ics_sequence)
      VALUES
        ($1, 'freitags-poll', 'tokenpoll00001', $3, 'Freitags-Poll', 'poll', 'poll', NULL, NULL, 0),
        ($2, 'freitags-set', 'tokenset000001', $3, 'Freitags-Set', 'date_set', 'poll', '2090-10-31T19:00:00Z', '2090-10-29T18:00:00Z', 3),
        ($4, 'abend-direkt', 'tokendirect0001', $3, 'Abend Direkt', 'date_set', 'direct', '2090-11-07T19:00:00Z', NULL, 1)
    `, [POLL, SET, HOST, DIRECT])

    await client.query(`
      INSERT INTO poll_slots (id, event_id, starts_at) VALUES
        ($1, $5, '2090-10-30T19:00:00Z'),
        ($2, $5, '2090-10-31T19:00:00Z'),
        ($3, $6, '2090-10-31T19:00:00Z'),
        ($4, $6, '2090-11-01T18:00:00Z')
    `, [POLL_SLOT_1, POLL_SLOT_2, SET_SLOT_1, SET_SLOT_2, POLL, SET])

    await client.query(`
      INSERT INTO poll_votes (slot_id, user_id, value) VALUES
        ($1, $3, 'yes'), ($1, $4, 'no'), ($2, $3, 'maybe'),
        ($5, $3, 'yes'), ($6, $4, 'maybe')
    `, [POLL_SLOT_1, POLL_SLOT_2, HOST, GUEST, SET_SLOT_1, SET_SLOT_2])

    await client.query(`
      INSERT INTO event_members (event_id, user_id) VALUES
        ($1, $3), ($1, $4), ($2, $3), ($2, $4), ($5, $3)
    `, [POLL, SET, HOST, GUEST, DIRECT])

    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('gives every Event exactly one Session, with the Event id so calendar UIDs stay the same', async () => {
    const { rows } = await client.query<{ id: string, event_id: string }>(`SELECT id, event_id FROM sessions ORDER BY event_id`)
    expect(rows).toEqual([
      { id: POLL, event_id: POLL },
      { id: SET, event_id: SET },
      { id: DIRECT, event_id: DIRECT },
    ])
  })

  it('moves the Date, the withdrawn Date and the calendar sequence onto the Session', async () => {
    const { rows } = await client.query<{ id: string, starts_at: Date | null, previous_starts_at: Date | null, ics_sequence: number }>(
      `SELECT id, starts_at, previous_starts_at, ics_sequence FROM sessions ORDER BY id`,
    )
    const byId = Object.fromEntries(rows.map(row => [row.id, row]))

    expect(byId[POLL]).toMatchObject({ starts_at: null, previous_starts_at: null, ics_sequence: 0 })
    expect(new Date(byId[SET]!.starts_at!).toISOString()).toBe(iso('2090-10-31T19:00:00Z'))
    expect(new Date(byId[SET]!.previous_starts_at!).toISOString()).toBe(iso('2090-10-29T18:00:00Z'))
    expect(byId[SET]!.ics_sequence).toBe(3)
    expect(new Date(byId[DIRECT]!.starts_at!).toISOString()).toBe(iso('2090-11-07T19:00:00Z'))
    expect(byId[DIRECT]).toMatchObject({ previous_starts_at: null, ics_sequence: 1 })
  })

  it('refers the Session to the Slot its Date came from, and to no Slot when none has that time', async () => {
    const { rows } = await client.query<{ id: string, slot_id: string | null }>(`SELECT id, slot_id FROM sessions`)
    const slotOf = Object.fromEntries(rows.map(row => [row.id, row.slot_id]))

    expect(slotOf[POLL]).toBeNull()
    expect(slotOf[SET]).toBe(SET_SLOT_1)
    expect(slotOf[DIRECT]).toBeNull()
  })

  it('keeps every Slot, Vote and Member of every Event', async () => {
    const count = async (sql: string) => Number((await client.query<{ n: number }>(sql)).rows[0]!.n)
    expect(await count('SELECT count(*)::int AS n FROM poll_slots')).toBe(4)
    expect(await count('SELECT count(*)::int AS n FROM poll_votes')).toBe(5)
    expect(await count('SELECT count(*)::int AS n FROM event_members')).toBe(5)
    expect(await count('SELECT count(*)::int AS n FROM events')).toBe(3)
  })

  it('leaves the Event with its phase and without the Date columns', async () => {
    const { rows } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'events' ORDER BY column_name`,
    )
    const columns = rows.map(row => row.column_name)
    expect(columns).toContain('phase')
    for (const dropped of ['date_mode', 'starts_at', 'previous_starts_at', 'ics_sequence']) {
      expect(columns).not.toContain(dropped)
    }

    const { rows: phases } = await client.query<{ slug: string, phase: string }>(`SELECT slug, phase FROM events ORDER BY slug`)
    expect(phases).toEqual([
      { slug: 'abend-direkt', phase: 'date_set' },
      { slug: 'freitags-poll', phase: 'poll' },
      { slug: 'freitags-set', phase: 'date_set' },
    ])
  })
})
