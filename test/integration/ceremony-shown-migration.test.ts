import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds „shown“ to the Award ceremony (#445, spec #425, ADR 0007): `events` gets `ceremony_shown`, boolean NOT NULL DEFAULT false,
// and every Event finished before 0.12 is marked shown. The code that serves until the switch-over inserts and updates `events` with explicit columns
// and starts a ceremony by writing `ceremony_starts_at` and `ceremony_gag` only.

const MIGRATION = '0031_ceremony_shown'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const FINISHED = '00000000-0000-4000-8000-0000000000e1'
const ARCHIVED = '00000000-0000-4000-8000-0000000000e2'
const RUNNING = '00000000-0000-4000-8000-0000000000e3'
const POLL = '00000000-0000-4000-8000-0000000000e4'
const STARTED = '00000000-0000-4000-8000-0000000000e5'
const NEW = '00000000-0000-4000-8000-0000000000e6'
const LATE = '00000000-0000-4000-8000-0000000000e7'

const START = '2090-11-07T23:00:00Z'

describe('migration: the Award ceremony is shown', () => {
  let client: PGlite
  let folder: string
  let migrate: () => Promise<void>

  const shown = async () => {
    const { rows } = await client.query<{ id: string, ceremony_shown: boolean }>(`SELECT id, ceremony_shown FROM events ORDER BY id`)
    return Object.fromEntries(rows.map(row => [row.id, row.ceremony_shown]))
  }

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    migrate = () => migrateTo(before.db)
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(
      `INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES
        ($1, 'eins', 'token-eins', $5, 'eins', 'finished'), ($2, 'zwei', 'token-zwei', $5, 'zwei', 'archived'),
        ($3, 'drei', 'token-drei', $5, 'drei', 'running'), ($4, 'vier', 'token-vier', $5, 'vier', 'poll')`,
      [FINISHED, ARCHIVED, RUNNING, POLL, HOST],
    )
    await client.query(
      `INSERT INTO events (id, slug, invite_token, host_id, name, phase, ceremony_starts_at, ceremony_gag) VALUES ($1, 'fuenf', 'token-fuenf', $2, 'fuenf', 'finished', $3, 'trip')`,
      [STARTED, HOST, START],
    )
    await migrate()
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('marks every Event finished before 0.12 as shown, and no other', async () => {
    expect(await shown()).toEqual({ [FINISHED]: true, [ARCHIVED]: true, [RUNNING]: false, [POLL]: false, [STARTED]: true })
  })

  it('makes the column boolean NOT NULL DEFAULT false', async () => {
    const { rows } = await client.query<{ data_type: string, is_nullable: string, column_default: string }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'ceremony_shown'`,
    )
    expect(rows).toEqual([{ data_type: 'boolean', is_nullable: 'NO', column_default: 'false' }])
  })

  it('lets the code before the switch-over insert an Event (false) and update it without the column', async () => {
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'sechs', 'token-sechs', $2, 'sechs', 'poll')`, [NEW, HOST])
    await client.query(`UPDATE events SET name = 'sechs neu', updated_at = now() WHERE id = $1`, [NEW])
    await client.query(`UPDATE events SET name = 'eins neu', updated_at = now() WHERE id = $1`, [FINISHED])

    const states = await shown()
    expect(states[NEW]).toBe(false)
    expect(states[FINISHED]).toBe(true)
  })

  it('leaves false when the code before the switch-over starts a ceremony (it writes the start and the gag only), which the read counts as a stored start', async () => {
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'sieben', 'token-sieben', $2, 'sieben', 'finished')`, [LATE, HOST])
    await client.query(`UPDATE events SET ceremony_starts_at = $2, ceremony_gag = 'trip' WHERE id = $1`, [LATE, START])

    const { rows } = await client.query<{ ceremony_shown: boolean, ceremony_starts_at: Date | null }>(`SELECT ceremony_shown, ceremony_starts_at FROM events WHERE id = $1`, [LATE])
    expect(rows).toEqual([{ ceremony_shown: false, ceremony_starts_at: new Date(START) }])
  })

  it('applies once: a second run changes nothing', async () => {
    const before = await shown()
    await migrate()
    expect(await shown()).toEqual(before)
  })
})
