import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that stores the Host's skip of a clip (#230, spec #218 § Clip): one nullable column on `draws`, so the skip
// reaches Members who join later. Draws that exist keep their clip (no skip), and the code that serves until the switch-over
// (ADR 0007) neither reads nor writes the column.

const MIGRATION = '0018_clip_skipped_at'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const GAME = '00000000-0000-4000-8000-0000000000d1'
const EVENT = '00000000-0000-4000-8000-0000000000e1'
const ROUND = '00000000-0000-4000-8000-0000000000b1'
const DRAW = '00000000-0000-4000-8000-0000000000c1'

const T0 = '2090-11-07T19:00:00Z'
const T1 = '2090-11-07T19:00:05Z'

describe('migration: the Host\'s skip of a clip', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Halo', $2)`, [GAME, HOST])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'freitag', 'token', $2, 'freitag', 'running')`, [EVENT, HOST])
    await client.query(`INSERT INTO rounds (id, event_id, game_id, started_at, set_at) VALUES ($1, $2, $3, $4, $4)`, [ROUND, EVENT, GAME, T0])
    await client.query(`INSERT INTO draws (id, round_id, game_id, source, kind, committed_at, stop_at) VALUES ($1, $2, $3, 'pool', 'set', $4, $4)`, [DRAW, ROUND, GAME, T0])
    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('leaves a draw that exists without a skip: its clip still plays', async () => {
    const { rows } = await client.query<{ clip_skipped_at: Date | null }>(`SELECT clip_skipped_at FROM draws WHERE id = $1`, [DRAW])

    expect(rows).toEqual([{ clip_skipped_at: null }])
  })

  it('stores the instant of a skip', async () => {
    await client.query(`UPDATE draws SET clip_skipped_at = $2 WHERE id = $1`, [DRAW, T1])

    const { rows } = await client.query<{ clip_skipped_at: Date }>(`SELECT clip_skipped_at FROM draws WHERE id = $1`, [DRAW])
    expect(rows[0]!.clip_skipped_at).toEqual(new Date(T1))
  })

  it('lets the old code insert a draw without the column', async () => {
    await client.query(`INSERT INTO draws (round_id, game_id, source, kind, committed_at, stop_at) VALUES ($1, $2, 'library', 'set', $3, $3)`, [ROUND, GAME, T1])

    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM draws WHERE clip_skipped_at IS NULL`)
    expect(rows[0]!.count).toBe(1)
  })
})
