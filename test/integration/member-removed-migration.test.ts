import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds the Activity type `member_removed` to the enum (#697, spec #894): the entries already written stay as they are, and a row of
// the new type can be written. The code of 0.21 keeps writing the old types until the switch-over (ADR 0007), which the enum still takes.

const MIGRATION = '0045_member_removed'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const MEMBER = '00000000-0000-4000-8000-0000000000a2'
const EVENT = '00000000-0000-4000-8000-0000000000e1'

describe('migration: the Activity type member_removed (0.22)', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder

    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'abend', 'token-abend', $2, 'Abend', 'running')`, [EVENT, HOST])
    await client.query(`INSERT INTO activity (event_id, type, actor_id, params) VALUES ($1, 'team_size_changed', $2, '{"from":2,"to":3}'::jsonb), ($1, 'member_joined', $2, '{}'::jsonb)`, [EVENT, HOST])

    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('keeps the entries that were written before', async () => {
    const { rows } = await client.query<{ type: string, params: unknown }>(`SELECT type, params FROM activity WHERE event_id = $1 ORDER BY type`, [EVENT])

    expect(rows).toEqual([
      { type: 'member_joined', params: {} },
      { type: 'team_size_changed', params: { from: 2, to: 3 } },
    ])
  })

  it('takes an entry of the new type, with its params', async () => {
    await client.query(`INSERT INTO activity (event_id, type, actor_id, params) VALUES ($1, 'member_removed', $2, $3::jsonb)`, [EVENT, HOST, JSON.stringify({ userId: MEMBER })])

    const { rows } = await client.query<{ params: unknown }>(`SELECT params FROM activity WHERE event_id = $1 AND type = 'member_removed'`, [EVENT])

    expect(rows).toEqual([{ params: { userId: MEMBER } }])
  })

  it('still takes the type the code before writes during the switch-over', async () => {
    await client.query(`INSERT INTO activity (event_id, type, params) VALUES ($1, 'member_joined', '{}'::jsonb)`, [EVENT])

    const { rows } = await client.query(`SELECT 1 FROM activity WHERE event_id = $1 AND type = 'member_joined'`, [EVENT])

    expect(rows).toHaveLength(2)
  })
})
