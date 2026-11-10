import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds a User's Appearance (#401, spec #398, ADR 0007): a text column on `users`, not null, default `light`,
// with a CHECK for the three values. The code that serves until the switch-over (0.10.1) inserts and updates `users` with
// explicit columns and never reads the new one.

const MIGRATION = '0029_user_appearance'

const KITTY = '00000000-0000-4000-8000-0000000000a1'
const DOM = '00000000-0000-4000-8000-0000000000a2'
const NEW = '00000000-0000-4000-8000-0000000000a3'

describe('migration: a User takes an Appearance', () => {
  let client: PGlite
  let folder: string
  let migrate: () => Promise<void>

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    migrate = () => migrateTo(before.db)
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Kitty', 'kitty@example.com'), ($2, 'Dom', 'dom@example.com')`, [KITTY, DOM])
    await migrate()
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  async function appearanceOf(id: string) {
    const { rows } = await client.query<{ appearance: string }>(`SELECT appearance FROM users WHERE id = $1`, [id])
    return rows[0]?.appearance
  }

  it('makes every existing User light', async () => {
    const { rows } = await client.query<{ appearance: string }>(`SELECT appearance FROM users WHERE id IN ($1, $2)`, [KITTY, DOM])
    expect(rows).toEqual([{ appearance: 'light' }, { appearance: 'light' }])
  })

  it('has a text column, not nullable, light by default', async () => {
    const { rows } = await client.query<{ data_type: string, is_nullable: string, column_default: string }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'appearance'`,
    )
    expect(rows).toEqual([{ data_type: 'text', is_nullable: 'NO', column_default: expect.stringMatching(/^'light'/) }])
  })

  it('accepts the three Appearances', async () => {
    for (const appearance of ['dark', 'system', 'light']) {
      await client.query(`UPDATE users SET appearance = $2 WHERE id = $1`, [DOM, appearance])
      expect(await appearanceOf(DOM)).toBe(appearance)
    }
  })

  it('refuses a fourth value', async () => {
    await expect(client.query(`UPDATE users SET appearance = 'sepia' WHERE id = $1`, [DOM])).rejects.toThrow(/users_appearance_check/)
  })

  it('refuses another spelling of a value', async () => {
    await expect(client.query(`UPDATE users SET appearance = 'Dark' WHERE id = $1`, [DOM])).rejects.toThrow(/users_appearance_check/)
  })

  it('refuses no Appearance', async () => {
    await expect(client.query(`UPDATE users SET appearance = NULL WHERE id = $1`, [DOM])).rejects.toThrow(/not-null|null value/)
  })

  it('lets the code before the switch-over create a User, who is light, and update one, who keeps their Appearance', async () => {
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Neu', 'neu@example.com')`, [NEW])
    expect(await appearanceOf(NEW)).toBe('light')

    await client.query(`UPDATE users SET appearance = 'dark' WHERE id = $1`, [KITTY])
    await client.query(`UPDATE users SET display_name = 'Kitty', updated_at = now() WHERE id = $1`, [KITTY])
    await client.query(`UPDATE users SET can_host = true WHERE id = $1`, [KITTY])
    expect(await appearanceOf(KITTY)).toBe('dark')
  })

  it('applies once: a second run changes nothing', async () => {
    const before = await client.query(`SELECT id, appearance FROM users ORDER BY id`)
    await migrate()
    const after = await client.query(`SELECT id, appearance FROM users ORDER BY id`)
    expect(after.rows).toEqual(before.rows)
  })
})
