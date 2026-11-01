import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that renumbers the Releases from 1.N.p to 0.(N+1).p (#220): each User's „Was ist neu“ version
// follows the same map. Null and a value that is no mapped Release stay as they are.

const MIGRATION = '0013_renumber_releases'

const seeds: Record<string, string | null> = {
  '00000000-0000-4000-8000-0000000000b1': '1.0.0',
  '00000000-0000-4000-8000-0000000000b2': '1.1.0',
  '00000000-0000-4000-8000-0000000000b3': '1.1.1',
  '00000000-0000-4000-8000-0000000000b4': '1.1.2',
  '00000000-0000-4000-8000-0000000000b5': '1.2.0',
  '00000000-0000-4000-8000-0000000000b6': '1.3.0',
  '00000000-0000-4000-8000-0000000000b7': '1.4.0',
  '00000000-0000-4000-8000-0000000000b8': '1.5.0',
  '00000000-0000-4000-8000-0000000000b9': null,
}

describe('migration: renumber releases', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder

    for (const [id, version] of Object.entries(seeds)) {
      await client.query(`INSERT INTO users (id, name, email, news_seen_version) VALUES ($1, 'Gast', $2, $3)`, [id, `${id.slice(-2)}@example.com`, version])
    }

    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  async function seenAfterMigration() {
    const { rows } = await client.query<{ id: string, news_seen_version: string | null }>(`SELECT id, news_seen_version FROM users`)
    return Object.fromEntries(rows.map(row => [row.id, row.news_seen_version]))
  }

  it('moves every old Release a User has seen to its new number', async () => {
    const seen = await seenAfterMigration()

    expect({
      b1: seen['00000000-0000-4000-8000-0000000000b1'],
      b2: seen['00000000-0000-4000-8000-0000000000b2'],
      b3: seen['00000000-0000-4000-8000-0000000000b3'],
      b4: seen['00000000-0000-4000-8000-0000000000b4'],
      b5: seen['00000000-0000-4000-8000-0000000000b5'],
      b6: seen['00000000-0000-4000-8000-0000000000b6'],
      b7: seen['00000000-0000-4000-8000-0000000000b7'],
    }).toEqual({ b1: '0.1.0', b2: '0.2.0', b3: '0.2.1', b4: '0.2.2', b5: '0.3.0', b6: '0.4.0', b7: '0.5.0' })
  })

  it('keeps a version that is no mapped Release', async () => {
    expect((await seenAfterMigration())['00000000-0000-4000-8000-0000000000b8']).toBe('1.5.0')
  })

  it('keeps a User who has seen no Release without one', async () => {
    expect((await seenAfterMigration())['00000000-0000-4000-8000-0000000000b9']).toBeNull()
  })
})
