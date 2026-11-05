import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds the Award ceremony's start (#309, spec #308, ADR 0007): `events` gets `ceremony_starts_at` and `ceremony_gag`
// (the new enum), nullable, with the checks that both are set together and only in a finished or archived Event. The code that serves
// until the switch-over inserts and updates `events` without the columns and finishes an Event with `phase = 'finished'` alone.

const MIGRATION = '0025_award_ceremony'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const RUNNING = '00000000-0000-4000-8000-0000000000e1'
const FINISHED = '00000000-0000-4000-8000-0000000000e2'
const NEW = '00000000-0000-4000-8000-0000000000e3'

const T1 = '2090-11-07T23:00:00Z'

describe('migration: an Event takes the Award ceremony\'s start', () => {
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

  it('leaves the Events that exist without a start and a gag', async () => {
    const { rows } = await client.query<{ id: string, ceremony_starts_at: string | null, ceremony_gag: string | null }>(`SELECT id, ceremony_starts_at, ceremony_gag FROM events ORDER BY slug`)
    expect(rows).toEqual([
      { id: RUNNING, ceremony_starts_at: null, ceremony_gag: null },
      { id: FINISHED, ceremony_starts_at: null, ceremony_gag: null },
    ])
  })

  it('has the gags trip and bonk', async () => {
    const { rows } = await client.query<{ enumlabel: string }>(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'ceremony_gag' ORDER BY e.enumsortorder`)
    expect(rows.map(row => row.enumlabel)).toEqual(['trip', 'bonk'])
  })

  it('lets the code before the switch-over insert an Event and update it without the columns', async () => {
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'drei', 'token-drei', $2, 'drei', 'poll')`, [NEW, HOST])
    await client.query(`UPDATE events SET name = 'drei neu', updated_at = now() WHERE id = $1`, [NEW])

    const { rows } = await client.query<{ name: string, ceremony_starts_at: string | null, ceremony_gag: string | null }>(`SELECT name, ceremony_starts_at, ceremony_gag FROM events WHERE id = $1`, [NEW])
    expect(rows).toEqual([{ name: 'drei neu', ceremony_starts_at: null, ceremony_gag: null }])
  })

  it('refuses one column without the other, in both directions', async () => {
    await expect(client.query(`UPDATE events SET ceremony_starts_at = $2 WHERE id = $1`, [FINISHED, T1])).rejects.toThrow(/events_ceremony_pair_check/)
    await expect(client.query(`UPDATE events SET ceremony_gag = 'trip' WHERE id = $1`, [FINISHED])).rejects.toThrow(/events_ceremony_pair_check/)
  })

  it('refuses both on a running Event, and takes them on a finished Event', async () => {
    await expect(client.query(`UPDATE events SET ceremony_starts_at = $2, ceremony_gag = 'bonk' WHERE id = $1`, [RUNNING, T1])).rejects.toThrow(/events_ceremony_phase_check/)
    await client.query(`UPDATE events SET ceremony_starts_at = $2, ceremony_gag = 'bonk' WHERE id = $1`, [FINISHED, T1])

    const { rows } = await client.query<{ ceremony_starts_at: Date, ceremony_gag: string }>(`SELECT ceremony_starts_at, ceremony_gag FROM events WHERE id = $1`, [FINISHED])
    expect(rows).toEqual([{ ceremony_starts_at: new Date(T1), ceremony_gag: 'bonk' }])
  })

  it('takes a Phase of finished without a start, as the code before the switch-over finishes an Event', async () => {
    await client.query(`UPDATE events SET phase = 'finished' WHERE id = $1`, [RUNNING])

    const { rows } = await client.query<{ phase: string, ceremony_starts_at: string | null, ceremony_gag: string | null }>(`SELECT phase, ceremony_starts_at, ceremony_gag FROM events WHERE id = $1`, [RUNNING])
    expect(rows).toEqual([{ phase: 'finished', ceremony_starts_at: null, ceremony_gag: null }])
  })

  it('applies once: a second run changes nothing', async () => {
    await migrate()
    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM events`)
    expect(rows).toEqual([{ count: 3 }])
  })
})
