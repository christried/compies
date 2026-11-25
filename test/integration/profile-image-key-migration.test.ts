import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateThrough } from './harness'

// The migration that gives a User an uploaded Profile picture (#678, spec #907, ADR 0007): a nullable `users.profile_image_key`, null = none, with a
// unique index because the image route looks a User up by it. The code that serves until the switch-over inserts and updates `users` with explicit
// columns and never names it. The database stops at this migration (`migrateThrough`), so a later migration of `users` leaves this test as it is.
// Every name and id is invented.

const MIGRATION = '0044_profile_image_key'

const FIRST = '00000000-0000-4000-8000-0000000000a1'
const SECOND = '00000000-0000-4000-8000-0000000000a2'
const NEW = '00000000-0000-4000-8000-0000000000a3'
const OTHER = '00000000-0000-4000-8000-0000000000a4'

describe('migration: users profile_image_key', () => {
  let client: PGlite
  let folder: string
  let db: Awaited<ReturnType<typeof createTestDbBefore>>['db']

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    db = before.db
    await client.query(`INSERT INTO users (id, name, email, image) VALUES ($1, 'Erste', 'erste@example.com', 'https://img.example/erste.png'), ($2, 'Zweite', 'zweite@example.com', NULL)`, [FIRST, SECOND])
    await migrateThrough(db, MIGRATION)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  const keyOf = async (id: string) =>
    (await client.query<{ profile_image_key: string | null }>(`SELECT profile_image_key FROM users WHERE id = $1`, [id])).rows[0]!.profile_image_key

  it('adds a nullable text column without a default', async () => {
    const { rows } = await client.query<{ data_type: string, is_nullable: string, column_default: string | null }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'profile_image_key'`,
    )
    expect(rows).toEqual([{ data_type: 'text', is_nullable: 'YES', column_default: null }])
  })

  it('leaves every User that existed without an uploaded picture', async () => {
    expect(await keyOf(FIRST)).toBeNull()
    expect(await keyOf(SECOND)).toBeNull()
  })

  it('has a unique index on the key', async () => {
    const { rows } = await client.query<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_profile_image_key_idx'`)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.indexdef).toMatch(/CREATE UNIQUE INDEX .* \(profile_image_key\)/)
  })

  it('lets two Users have no key and refuses two with the same key', async () => {
    // FIRST and SECOND both have a null key already.
    await client.query(`UPDATE users SET profile_image_key = 'profile-eins.webp' WHERE id = $1`, [FIRST])

    await expect(client.query(`UPDATE users SET profile_image_key = 'profile-eins.webp' WHERE id = $1`, [SECOND])).rejects.toThrow(/users_profile_image_key_idx|duplicate key/)

    await client.query(`UPDATE users SET profile_image_key = NULL WHERE id = $1`, [FIRST])
  })

  it('still takes the previous deployment\'s statements, which never name the column', async () => {
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Neu', 'neu@example.com')`, [NEW])
    expect(await keyOf(NEW)).toBeNull()

    await client.query(`UPDATE users SET display_name = 'Neue', can_host = true, image = 'https://img.example/neu.png', updated_at = now() WHERE id = $1`, [NEW])

    const { rows } = await client.query<{ display_name: string, can_host: boolean, image: string, profile_image_key: string | null }>(
      `SELECT display_name, can_host, image, profile_image_key FROM users WHERE id = $1`,
      [NEW],
    )
    expect(rows).toEqual([{ display_name: 'Neue', can_host: true, image: 'https://img.example/neu.png', profile_image_key: null }])
  })

  it('keeps a key set before through an update of the previous deployment', async () => {
    await client.query(`INSERT INTO users (id, name, email, profile_image_key) VALUES ($1, 'Andere', 'andere@example.com', 'profile-zwei.webp')`, [OTHER])

    await client.query(`UPDATE users SET name = 'Andere neu', image = 'https://img.example/andere.png', display_name = 'Anders', can_host = true, updated_at = now() WHERE id = $1`, [OTHER])

    expect(await keyOf(OTHER)).toBe('profile-zwei.webp')
  })
})
