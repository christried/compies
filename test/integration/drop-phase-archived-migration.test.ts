import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, createTestDbBefore, migrateTo } from './harness'

// The migration that drops the Phase `archived` from the `event_phase` type and from the two Finish checks (#887, spec #683, Release 0.20): finished is the last
// Phase. Every row of the five Phases keeps its Phase, Finish time and ceremony start; an Event still in `archived` stops the migration instead of being rewritten.
// The 0.19 code that serves while this runs never writes `archived` (ADR 0007).

const MIGRATION = '0042_drop_phase_archived'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const DRAFT = '00000000-0000-4000-8000-0000000000d1'
const POLL = '00000000-0000-4000-8000-0000000000d2'
const DATE_SET = '00000000-0000-4000-8000-0000000000d3'
const RUNNING = '00000000-0000-4000-8000-0000000000d4'
const FINISHED = '00000000-0000-4000-8000-0000000000d5'
const ARCHIVED = '00000000-0000-4000-8000-0000000000d6'

const FINISHED_AT = '2026-05-01T20:00:00.000Z'
const CEREMONY_AT = '2026-05-01T19:00:00.000Z'

async function insertHost(client: PGlite) {
  await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
}

async function insertEvent(client: PGlite, id: string, phase: string) {
  await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, $2, $3, $4, $2, $5)`, [id, `event-${id.slice(-2)}`, `token-${id.slice(-2)}`, HOST, phase])
}

describe('migration: the Phase archived is dropped', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    await insertHost(client)
    await insertEvent(client, DRAFT, 'draft')
    await insertEvent(client, POLL, 'poll')
    await insertEvent(client, DATE_SET, 'date_set')
    await insertEvent(client, RUNNING, 'running')
    await insertEvent(client, FINISHED, 'finished')
    await client.query(`UPDATE events SET finished_at = $2, ceremony_starts_at = $3, ceremony_gag = 'trip' WHERE id = $1`, [FINISHED, FINISHED_AT, CEREMONY_AT])
    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('keeps every Event with its Phase, Finish time and ceremony start', async () => {
    const { rows } = await client.query<{ id: string, phase: string, finished_at: Date | null, ceremony_starts_at: Date | null, ceremony_gag: string | null }>(`SELECT id, phase, finished_at, ceremony_starts_at, ceremony_gag FROM events ORDER BY id`)

    expect(rows.map(row => [row.id, row.phase, row.finished_at?.toISOString() ?? null, row.ceremony_starts_at?.toISOString() ?? null, row.ceremony_gag])).toEqual([
      [DRAFT, 'draft', null, null, null],
      [POLL, 'poll', null, null, null],
      [DATE_SET, 'date_set', null, null, null],
      [RUNNING, 'running', null, null, null],
      [FINISHED, 'finished', FINISHED_AT, CEREMONY_AT, 'trip'],
    ])
  })

  it('leaves five Phases in the type and no old copy of it', async () => {
    const { rows } = await client.query<{ phases: string[] }>(`SELECT enum_range(NULL::event_phase)::text[] AS phases`)
    const old = await client.query(`SELECT typname FROM pg_type WHERE typname = 'event_phase_old'`)

    expect(rows[0]!.phases).toEqual(['draft', 'poll', 'date_set', 'running', 'finished'])
    expect(old.rows).toEqual([])
  })

  it('refuses the Phase archived', async () => {
    await expect(client.query(`UPDATE events SET phase = 'archived' WHERE id = $1`, [DRAFT])).rejects.toThrow(/invalid input value for enum event_phase/)
  })

  it('still refuses a Finish time on a running Event, and takes it on a finished one', async () => {
    await expect(client.query(`UPDATE events SET finished_at = $2 WHERE id = $1`, [RUNNING, FINISHED_AT])).rejects.toThrow(/events_finished_at_phase_check/)

    await client.query(`UPDATE events SET finished_at = $2 WHERE id = $1`, [FINISHED, FINISHED_AT])
  })

  it('still refuses a ceremony start on a running Event, and takes it on a finished one', async () => {
    await expect(client.query(`UPDATE events SET ceremony_starts_at = $2, ceremony_gag = 'bonk' WHERE id = $1`, [RUNNING, CEREMONY_AT])).rejects.toThrow(/events_ceremony_phase_check/)

    await client.query(`UPDATE events SET ceremony_starts_at = $2, ceremony_gag = 'bonk' WHERE id = $1`, [FINISHED, CEREMONY_AT])
  })

  it('names the Phase archived in neither check', async () => {
    const { rows } = await client.query<{ conname: string, def: string }>(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname IN ('events_finished_at_phase_check', 'events_ceremony_phase_check') ORDER BY conname`)

    expect(rows.map(row => row.conname)).toEqual(['events_ceremony_phase_check', 'events_finished_at_phase_check'])
    for (const row of rows) expect(row.def).not.toContain('archived')
  })
})

describe('migration: an Event still in the Phase archived stops it', () => {
  let client: PGlite
  let folder: string
  let db: Awaited<ReturnType<typeof createTestDbBefore>>['db']

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    db = before.db
    await insertHost(client)
    await insertEvent(client, ARCHIVED, 'archived')
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('fails with an error that names the Phase, and rolls everything back', async () => {
    const error = await migrateTo(db).then(() => null, (e: unknown) => e as Error & { cause?: Error })

    expect(error).not.toBeNull()
    // Drizzle's message is the failed query's text, which holds the RAISE line too; Postgres's own error is its `cause`.
    expect(error!.cause?.message).toBe('Event in the Phase archived (1): move it by hand before this migration')
    const row = await client.query<{ phase: string }>(`SELECT phase FROM events WHERE id = $1`, [ARCHIVED])
    const type = await client.query<{ phases: string[] }>(`SELECT enum_range(NULL::event_phase)::text[] AS phases`)
    expect(row.rows).toEqual([{ phase: 'archived' }])
    expect(type.rows[0]!.phases).toEqual(['draft', 'poll', 'date_set', 'running', 'finished', 'archived'])
  })

  it('migrates once the operator has moved the Event by hand', async () => {
    await client.query(`UPDATE events SET phase = 'finished' WHERE id = $1`, [ARCHIVED])

    await migrateTo(db)

    const { rows } = await client.query<{ phase: string }>(`SELECT phase FROM events WHERE id = $1`, [ARCHIVED])
    expect(rows).toEqual([{ phase: 'finished' }])
  })

  it('does nothing when it runs again', async () => {
    await migrateTo(db)

    const { rows } = await client.query<{ phase: string }>(`SELECT phase FROM events WHERE id = $1`, [ARCHIVED])
    expect(rows).toEqual([{ phase: 'finished' }])
  })
})

describe('migration: the Phase archived on a fresh database', () => {
  it('is refused', async () => {
    const { client } = await createTestDb()

    await insertHost(client)
    await expect(insertEvent(client, ARCHIVED, 'archived')).rejects.toThrow(/invalid input value for enum event_phase/)
    await client.close()
  })
})
