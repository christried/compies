import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that remembers when a Countdown was last started or resumed (#441, spec #425, ADR 0007): `countdowns` gets `last_started_at`,
// nullable, backfilled from `started_at`. The code that serves until the switch-over writes `started_at` only and never names the new column.

const MIGRATION = '0030_countdown_last_started'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const RUNNING = '00000000-0000-4000-8000-0000000000e1'
const PAUSED = '00000000-0000-4000-8000-0000000000e2'
const NEW = '00000000-0000-4000-8000-0000000000e3'

const STARTED = '2090-11-07T20:00:00Z'
const LATER = '2090-11-07T20:30:00Z'

describe('migration: a Countdown remembers its last start', () => {
  let client: PGlite
  let folder: string
  let migrate: () => Promise<void>

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    migrate = () => migrateTo(before.db)
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(
      `INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'eins', 'token-eins', $3, 'eins', 'running'), ($2, 'zwei', 'token-zwei', $3, 'zwei', 'running')`,
      [RUNNING, PAUSED, HOST],
    )
    await client.query(
      `INSERT INTO countdowns (event_id, duration_ms, remaining_ms, started_at) VALUES ($1, 60000, 60000, $3), ($2, 60000, 40000, NULL)`,
      [RUNNING, PAUSED, STARTED],
    )
    await migrate()
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('gives a Countdown that runs its start as the last start, and leaves a paused or ready one without', async () => {
    const { rows } = await client.query<{ event_id: string, last_started_at: Date | null }>(`SELECT event_id, last_started_at FROM countdowns ORDER BY event_id`)
    expect(rows).toEqual([
      { event_id: RUNNING, last_started_at: new Date(STARTED) },
      { event_id: PAUSED, last_started_at: null },
    ])
  })

  it('has the column nullable, with the type of an instant', async () => {
    const { rows } = await client.query<{ data_type: string, is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = 'countdowns' AND column_name = 'last_started_at'`,
    )
    expect(rows).toEqual([{ data_type: 'timestamp with time zone', is_nullable: 'YES' }])
  })

  it('lets the code before the switch-over insert and start a Countdown without the column, which then keeps what it had', async () => {
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'drei', 'token-drei', $2, 'drei', 'running')`, [NEW, HOST])
    await client.query(`INSERT INTO countdowns (event_id, duration_ms, remaining_ms) VALUES ($1, 30000, 30000)`, [NEW])
    await client.query(`UPDATE countdowns SET started_at = $2 WHERE event_id = $1`, [NEW, LATER])
    await client.query(`UPDATE countdowns SET remaining_ms = 10000, started_at = NULL WHERE event_id = $1`, [RUNNING])

    const { rows } = await client.query<{ event_id: string, started_at: Date | null, last_started_at: Date | null }>(
      `SELECT event_id, started_at, last_started_at FROM countdowns WHERE event_id IN ($1, $2) ORDER BY event_id`,
      [RUNNING, NEW],
    )
    expect(rows).toEqual([
      { event_id: RUNNING, started_at: null, last_started_at: new Date(STARTED) },
      { event_id: NEW, started_at: new Date(LATER), last_started_at: null },
    ])
  })
})
