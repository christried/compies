import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that adds every Activity kind of 0.7 to the enum (#226, review 1.4 A6): the entries already written
// stay as they are, and a row of each new kind can be written. The code before 0.7 keeps writing the old kinds until
// the switch-over (ADR 0007), which the enum still takes.

const MIGRATION = '0016_activity_round_kinds'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const EVENT = '00000000-0000-4000-8000-0000000000e1'

const NEW_KINDS = {
  game_drawn: { roundId: 'r1', drawId: 'd1', gameId: 'g1' },
  vetoes_revealed: { roundId: 'r1', drawId: 'd1', gameId: 'g1', vetoes: [{ team: 2, userId: HOST }] },
  game_set: { roundId: 'r1', gameId: 'g1' },
  game_put_back: { roundId: 'r1', gameId: 'g1' },
  bonus_veto_granted: { team: 1 },
  coin_tossed: { side: 'heads' },
} as const

describe('migration: Activity kinds of 0.7', () => {
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

  it('takes an entry of every new kind, with its params', async () => {
    for (const [type, params] of Object.entries(NEW_KINDS)) {
      await client.query(`INSERT INTO activity (event_id, type, params) VALUES ($1, $2, $3::jsonb)`, [EVENT, type, JSON.stringify(params)])
    }

    const { rows } = await client.query<{ type: string, params: unknown }>(`SELECT type, params FROM activity WHERE event_id = $1`, [EVENT])

    expect(Object.fromEntries(rows.filter(row => row.type in NEW_KINDS).map(row => [row.type, row.params]))).toEqual(NEW_KINDS)
  })

  it('still takes the kinds the code before 0.7 writes during the switch-over', async () => {
    await client.query(`INSERT INTO activity (event_id, type, params) VALUES ($1, 'session_started', '{"sessionId":"s1","number":1}'::jsonb)`, [EVENT])

    const { rows } = await client.query(`SELECT 1 FROM activity WHERE event_id = $1 AND type = 'session_started'`, [EVENT])

    expect(rows).toHaveLength(1)
  })
})
