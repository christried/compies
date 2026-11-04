import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds the end of an Event (#277, spec #272, ADR 0007): `events` gets `finished_at`, nullable, with the check that a stored
// end belongs to a finished or archived Event. The code that serves until the switch-over inserts and updates `events` without the column.

const MIGRATION = '0023_finished_at'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const RUNNING = '00000000-0000-4000-8000-0000000000e1'
const FINISHED = '00000000-0000-4000-8000-0000000000e2'
const NEW = '00000000-0000-4000-8000-0000000000e3'

const T1 = '2090-11-07T23:00:00Z'

describe('migration: an Event takes its end', () => {
  let client: PGlite
  let folder: string
  let migrate: () => Promise<void>

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    migrate = () => migrateTo(before.db)
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'eins', 'token-eins', $3, 'eins', 'running'), ($2, 'zwei', 'token-zwei', $3, 'zwei', 'finished')`, [RUNNING, FINISHED, HOST])
    await migrate()
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('leaves the Events that exist without an end', async () => {
    const { rows } = await client.query<{ id: string, finished_at: string | null }>(`SELECT id, finished_at FROM events ORDER BY slug`)
    expect(rows).toEqual([
      { id: RUNNING, finished_at: null },
      { id: FINISHED, finished_at: null },
    ])
  })

  it('lets the code before the switch-over insert an Event and update it without the column', async () => {
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'drei', 'token-drei', $2, 'drei', 'poll')`, [NEW, HOST])
    await client.query(`UPDATE events SET name = 'drei neu', updated_at = now() WHERE id = $1`, [NEW])

    const { rows } = await client.query<{ name: string, finished_at: string | null }>(`SELECT name, finished_at FROM events WHERE id = $1`, [NEW])
    expect(rows).toEqual([{ name: 'drei neu', finished_at: null }])
  })

  it('refuses an end on a running Event, and takes one on a finished Event', async () => {
    await expect(client.query(`UPDATE events SET finished_at = $2 WHERE id = $1`, [RUNNING, T1])).rejects.toThrow(/events_finished_at_phase_check/)
    await client.query(`UPDATE events SET finished_at = $2 WHERE id = $1`, [FINISHED, T1])

    const { rows } = await client.query<{ finished_at: Date }>(`SELECT finished_at FROM events WHERE id = $1`, [FINISHED])
    expect(rows).toEqual([{ finished_at: new Date(T1) }])
  })

  it('takes a Phase of finished without an end, since the check does not ask for the converse', async () => {
    await client.query(`UPDATE events SET phase = 'finished' WHERE id = $1`, [RUNNING])

    const { rows } = await client.query<{ phase: string, finished_at: string | null }>(`SELECT phase, finished_at FROM events WHERE id = $1`, [RUNNING])
    expect(rows).toEqual([{ phase: 'finished', finished_at: null }])
  })

  it('applies once: a second run changes nothing', async () => {
    await migrate()
    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM events`)
    expect(rows).toEqual([{ count: 3 }])
  })
})
