import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { events } from '../../server/db/schema'
import { settingsFromRow } from '../../shared/settings'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds the Event settings columns (#138, #144). Events from before it must read as not
// set up (all columns null) and keep everything else.

const MIGRATION = '0006_game_library_and_event_settings'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const EVENT = '00000000-0000-4000-8000-0000000000e1'
const SLOT = '00000000-0000-4000-8000-0000000000b1'

describe('migration: Event settings', () => {
  let client: PGlite
  let folder: string
  let db: Awaited<ReturnType<typeof createTestDbBefore>>['db']

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    db = before.db

    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'freitags-poll', 'tokenpoll00001', $2, 'Freitags-Poll', 'poll')`, [EVENT, HOST])
    await client.query(`INSERT INTO sessions (event_id) VALUES ($1)`, [EVENT])
    await client.query(`INSERT INTO poll_slots (id, event_id, starts_at) VALUES ($1, $2, '2090-10-30T19:00:00Z')`, [SLOT, EVENT])
    await client.query(`INSERT INTO poll_votes (slot_id, user_id, value) VALUES ($1, $2, 'yes')`, [SLOT, HOST])
    await client.query(`INSERT INTO event_members (event_id, user_id) VALUES ($1, $2)`, [EVENT, HOST])

    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('reads an Event from before it as not set up', async () => {
    const [row] = await db.select().from(events).where(eq(events.id, EVENT))

    expect(row).toMatchObject({ format: null, teamCount: null, teamSize: null, gameCount: null, pointsTable: null, selectionMode: null, hiddenWheel: null, vetoAllowance: null })
    expect(settingsFromRow(row!)).toBeNull()
  })

  it('keeps the Event, its Session, Slot, Vote and Member as they were', async () => {
    const [row] = await db.select().from(events).where(eq(events.id, EVENT))
    expect(row).toMatchObject({ slug: 'freitags-poll', name: 'Freitags-Poll', phase: 'poll', hostId: HOST, inviteToken: 'tokenpoll00001' })
    for (const [table, count] of [['sessions', 1], ['poll_slots', 1], ['poll_votes', 1], ['event_members', 1]] as const) {
      const { rows } = await client.query(`SELECT 1 FROM ${table}`)
      expect(rows).toHaveLength(count)
    }
  })
})
