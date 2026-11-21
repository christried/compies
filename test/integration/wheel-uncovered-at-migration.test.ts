import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateThrough } from './harness'

// The migration that lets the Host uncover a Hidden wheel (#957, spec #961 § Uncover, ADR 0007): a nullable `events.wheel_uncovered_at`, null = not
// uncovered. The code that serves until the switch-over inserts and updates `events` with explicit columns and never names it. The database stops
// at this migration (`migrateThrough`), so a later migration of `events` leaves this test as it is. Every name and id is invented.

const MIGRATION = '0041_wheel_uncovered_at'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const RUNNING = '00000000-0000-4000-8000-0000000000e1'
const FINISHED = '00000000-0000-4000-8000-0000000000e2'
const NEW = '00000000-0000-4000-8000-0000000000e3'

describe('migration: events wheel_uncovered_at', () => {
  let client: PGlite
  let folder: string
  let db: Awaited<ReturnType<typeof createTestDbBefore>>['db']

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    db = before.db
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(
      `INSERT INTO events (id, slug, invite_token, host_id, name, phase, selection_mode, hidden_wheel) VALUES ($1, 'eins', 'token-eins', $3, 'eins', 'running', 'lucky_wheel', true), ($2, 'zwei', 'token-zwei', $3, 'zwei', 'finished', 'lucky_wheel', true)`,
      [RUNNING, FINISHED, HOST],
    )
    await migrateThrough(db, MIGRATION)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  const uncoveredAtOf = async (id: string) =>
    (await client.query<{ wheel_uncovered_at: Date | null }>(`SELECT wheel_uncovered_at FROM events WHERE id = $1`, [id])).rows[0]!.wheel_uncovered_at

  it('adds a nullable timestamp with time zone column', async () => {
    const { rows } = await client.query<{ data_type: string, is_nullable: string, column_default: string | null }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'wheel_uncovered_at'`,
    )
    expect(rows).toEqual([{ data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null }])
  })

  it('leaves every Event that existed with its wheel not uncovered', async () => {
    expect(await uncoveredAtOf(RUNNING)).toBeNull()
    expect(await uncoveredAtOf(FINISHED)).toBeNull()
  })

  it('still takes the previous deployment\'s statements, which never name the column', async () => {
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'drei', 'token-drei', $2, 'drei', 'poll')`, [NEW, HOST])
    await client.query(`UPDATE events SET name = 'drei neu', updated_at = now() WHERE id = $1`, [NEW])

    const { rows } = await client.query<{ name: string, wheel_uncovered_at: Date | null }>(`SELECT name, wheel_uncovered_at FROM events WHERE id = $1`, [NEW])
    expect(rows).toEqual([{ name: 'drei neu', wheel_uncovered_at: null }])
  })

  it('keeps an uncover through an update of the previous deployment', async () => {
    await client.query(`UPDATE events SET wheel_uncovered_at = '2026-11-21T21:00:00Z' WHERE id = $1`, [RUNNING])
    await client.query(`UPDATE events SET name = 'eins neu', game_count = 4, updated_at = now() WHERE id = $1`, [RUNNING])

    const { rows } = await client.query<{ name: string, wheel_uncovered_at: Date }>(`SELECT name, wheel_uncovered_at FROM events WHERE id = $1`, [RUNNING])
    expect(rows[0]!.name).toBe('eins neu')
    expect(rows[0]!.wheel_uncovered_at.toISOString()).toBe('2026-11-21T21:00:00.000Z')
  })
})
