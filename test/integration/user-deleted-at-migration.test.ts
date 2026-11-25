import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds the mark of a Deleted User (#915, spec #907, ADR 0020, ADR 0007): a nullable timestamptz on `users`, no default.
// The code that serves until the switch-over inserts and updates `users` with explicit columns and never names it.

const MIGRATION = '0043_user_deleted_at'

const KITTY = '00000000-0000-4000-8000-0000000000b1'
const DOM = '00000000-0000-4000-8000-0000000000b2'
const NEW = '00000000-0000-4000-8000-0000000000b3'

describe('migration: a User can be marked deleted', () => {
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

  async function deletedAtOf(id: string) {
    const { rows } = await client.query<{ deleted_at: Date | null }>(`SELECT deleted_at FROM users WHERE id = $1`, [id])
    return rows[0]?.deleted_at
  }

  it('leaves every existing User not deleted', async () => {
    const { rows } = await client.query<{ deleted_at: Date | null }>(`SELECT deleted_at FROM users WHERE id IN ($1, $2)`, [KITTY, DOM])
    expect(rows).toEqual([{ deleted_at: null }, { deleted_at: null }])
  })

  it('has a timestamp with time zone column, nullable, without a default', async () => {
    const { rows } = await client.query<{ data_type: string, is_nullable: string, column_default: string | null }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'deleted_at'`,
    )
    expect(rows).toEqual([{ data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null }])
  })

  it('lets the code before the switch-over create a User and update one, who stay not deleted', async () => {
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Neu', 'neu@example.com')`, [NEW])
    await client.query(`UPDATE users SET display_name = 'Kitty', updated_at = now() WHERE id = $1`, [KITTY])
    expect(await deletedAtOf(NEW)).toBeNull()
    expect(await deletedAtOf(KITTY)).toBeNull()
  })
})
