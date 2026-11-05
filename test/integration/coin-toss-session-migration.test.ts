import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that gives a toss its Session (#259, review 0.7 Q10): one nullable column `coin_tosses.session_id`. Tosses that
// exist, and those the code that serves until the switch-over writes (ADR 0007), have none; the new code shows such a toss in no Session.

const MIGRATION = '0020_coin_toss_session'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const EVENT = '00000000-0000-4000-8000-0000000000e1'
const SESSION = '00000000-0000-4000-8000-0000000000f1'
const TOSS = '00000000-0000-4000-8000-0000000000c1'

const T0 = '2090-11-07T19:00:00Z'
const T1 = '2090-11-07T19:00:05Z'

describe('migration: a toss belongs to its Session', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'freitag', 'token', $2, 'freitag', 'running')`, [EVENT, HOST])
    await client.query(`INSERT INTO sessions (id, event_id, starts_at, started_at) VALUES ($1, $2, $3, $3)`, [SESSION, EVENT, T0])
    await client.query(`INSERT INTO coin_tosses (id, event_id, side, tossed_by, started_at, lands_at) VALUES ($1, $2, 'heads', $3, $4, $5)`, [TOSS, EVENT, HOST, T0, T1])
    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('leaves a toss that exists without a Session: it is shown in none', async () => {
    const { rows } = await client.query<{ session_id: string | null }>(`SELECT session_id FROM coin_tosses WHERE id = $1`, [TOSS])

    expect(rows).toEqual([{ session_id: null }])
  })

  it('lets the old code insert a toss without the column', async () => {
    await client.query(`INSERT INTO coin_tosses (event_id, side, tossed_by, started_at, lands_at) VALUES ($1, 'tails', $2, $3, $4)`, [EVENT, HOST, T0, T1])

    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM coin_tosses WHERE session_id IS NULL`)
    expect(rows[0]!.count).toBe(2)
  })

  it('stores the Session a toss was made in', async () => {
    await client.query(`UPDATE coin_tosses SET session_id = $2 WHERE id = $1`, [TOSS, SESSION])

    const { rows } = await client.query<{ session_id: string }>(`SELECT session_id FROM coin_tosses WHERE id = $1`, [TOSS])
    expect(rows).toEqual([{ session_id: SESSION }])
  })

  it('removes the tosses with the Event: both foreign keys cascade', async () => {
    await client.query(`DELETE FROM events WHERE id = $1`, [EVENT])

    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM coin_tosses`)
    expect(rows[0]!.count).toBe(0)
  })
})
