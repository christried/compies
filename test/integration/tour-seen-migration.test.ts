import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds the Tour version a User has seen (#646, spec #622, ADR 0007): an integer column on `users`, not null,
// default 0. The code that serves until the switch-over inserts and updates `users` with explicit columns and never names it.

const MIGRATION = '0035_tour_seen'

const KITTY = '00000000-0000-4000-8000-0000000000a1'
const DOM = '00000000-0000-4000-8000-0000000000a2'
const NEW = '00000000-0000-4000-8000-0000000000a3'

describe('migration: a User takes a Tour version', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Kitty', 'kitty@example.com'), ($2, 'Dom', 'dom@example.com')`, [KITTY, DOM])
    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  async function tourSeenOf(id: string) {
    const { rows } = await client.query<{ tour_seen_version: number }>(`SELECT tour_seen_version FROM users WHERE id = $1`, [id])
    return rows[0]?.tour_seen_version
  }

  it('makes every existing User a User who has not seen the Tour', async () => {
    const { rows } = await client.query<{ tour_seen_version: number }>(`SELECT tour_seen_version FROM users WHERE id IN ($1, $2)`, [KITTY, DOM])
    expect(rows).toEqual([{ tour_seen_version: 0 }, { tour_seen_version: 0 }])
  })

  it('has an integer column, not nullable, 0 by default', async () => {
    const { rows } = await client.query<{ data_type: string, is_nullable: string, column_default: string }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tour_seen_version'`,
    )
    expect(rows).toEqual([{ data_type: 'integer', is_nullable: 'NO', column_default: '0' }])
  })

  it('lets the code before the switch-over create a User, who has not seen the Tour, and update one, who keeps the number', async () => {
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Neu', 'neu@example.com')`, [NEW])
    expect(await tourSeenOf(NEW)).toBe(0)

    await client.query(`UPDATE users SET tour_seen_version = 1 WHERE id = $1`, [KITTY])
    await client.query(`UPDATE users SET display_name = 'Kitty', updated_at = now() WHERE id = $1`, [KITTY])
    await client.query(`UPDATE users SET can_host = true WHERE id = $1`, [KITTY])
    expect(await tourSeenOf(KITTY)).toBe(1)
  })
})
