import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, createTestDbBefore, migrateTo } from './harness'

// The migration that drops `event_pool_games.pool` and the `pool_kind` type (#301, step 2 of #286): every pool row keeps its
// Event and game, the column and the type are gone. The 0.9 code that serves while this runs never names the column (ADR 0007).

const MIGRATION = '0026_drop_pool_column'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const E1 = '00000000-0000-4000-8000-0000000000e1'
const E2 = '00000000-0000-4000-8000-0000000000e2'
const A = '00000000-0000-4000-8000-0000000000a2'
const B = '00000000-0000-4000-8000-0000000000b2'

describe('migration: the pool column and its type are dropped', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'eins', 'token-eins', $3, 'eins', 'poll'), ($2, 'zwei', 'token-zwei', $3, 'zwei', 'poll')`, [E1, E2, HOST])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Alpha', $3), ($2, 'Beta', $3)`, [A, B, HOST])
    await client.query(`INSERT INTO event_pool_games (event_id, game_id, pool) VALUES ($1, $3, 'main'), ($1, $4, 'main'), ($2, $3, 'main')`, [E1, E2, A, B])
    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('keeps every pool row with its Event and game', async () => {
    const { rows } = await client.query<{ event_id: string, game_id: string }>(`SELECT event_id, game_id FROM event_pool_games ORDER BY event_id, game_id`)

    expect(rows).toEqual([{ event_id: E1, game_id: A }, { event_id: E1, game_id: B }, { event_id: E2, game_id: A }])
  })

  it('drops the column', async () => {
    const { rows } = await client.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'event_pool_games' ORDER BY column_name`)

    expect(rows).toEqual([{ column_name: 'event_id' }, { column_name: 'game_id' }])
  })

  it('drops the type', async () => {
    const { rows } = await client.query(`SELECT typname FROM pg_type WHERE typname = 'pool_kind'`)

    expect(rows).toEqual([])
  })

  it('keeps the primary key on Event and game', async () => {
    await expect(client.query(`INSERT INTO event_pool_games (event_id, game_id) VALUES ($1, $2)`, [E1, A])).rejects.toThrow(/event_pool_games_event_id_game_id_pk/)
  })
})

describe('migration: the pool table on a fresh database', () => {
  it('migrates from nothing and takes a Game pool row of Event and game alone', async () => {
    const { client } = await createTestDb()

    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'eins', 'token-eins', $2, 'eins', 'poll')`, [E1, HOST])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Alpha', $2)`, [A, HOST])
    await client.query(`INSERT INTO event_pool_games (event_id, game_id) VALUES ($1, $2)`, [E1, A])

    const { rows } = await client.query(`SELECT * FROM event_pool_games`)
    expect(rows).toEqual([{ event_id: E1, game_id: A }])
    await client.close()
  })
})
