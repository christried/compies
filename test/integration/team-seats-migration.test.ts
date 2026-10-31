import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that gives Members a team seat (#160). Members of Events from before it stay on the Bench.

const MIGRATION = '0010_team_seats'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const MEMBER = '00000000-0000-4000-8000-0000000000a2'
const EVENT = '00000000-0000-4000-8000-0000000000e1'

describe('migration: team seats', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder

    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com'), ($2, 'Gast', 'member@example.com')`, [HOST, MEMBER])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'freitags-poll', 'tokenpoll00001', $2, 'Freitags-Poll', 'poll')`, [EVENT, HOST])
    await client.query(`INSERT INTO event_members (event_id, user_id) VALUES ($1, $2), ($1, $3)`, [EVENT, HOST, MEMBER])

    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('leaves every existing Member on the Bench, in no team', async () => {
    const { rows } = await client.query<{ zone: string, team: number | null, team_joined_at: Date | null }>(`SELECT zone, team, team_joined_at FROM event_members`)
    expect(rows).toEqual([
      { zone: 'bench', team: null, team_joined_at: null },
      { zone: 'bench', team: null, team_joined_at: null },
    ])
  })

  it('keeps a team seat and the team zone together', async () => {
    await expect(client.query(`UPDATE event_members SET zone = 'team' WHERE user_id = $1`, [MEMBER])).rejects.toThrow()
    await expect(client.query(`UPDATE event_members SET team = 1, team_joined_at = now() WHERE user_id = $1`, [MEMBER])).rejects.toThrow()
    await expect(client.query(`UPDATE event_members SET zone = 'team', team = 1 WHERE user_id = $1`, [MEMBER])).rejects.toThrow()
    await client.query(`UPDATE event_members SET zone = 'team', team = 1, team_joined_at = now() WHERE user_id = $1`, [MEMBER])
    await client.query(`UPDATE event_members SET zone = 'stands', team = NULL, team_joined_at = NULL WHERE user_id = $1`, [MEMBER])
  })
})
