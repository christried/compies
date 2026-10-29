import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that gives Members a Team word (#161). Members of Events from before it have none.

const MIGRATION = '0011_team_words'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const MEMBER = '00000000-0000-4000-8000-0000000000a2'
const EVENT = '00000000-0000-4000-8000-0000000000e1'

describe('migration: team words', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder

    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com'), ($2, 'Gast', 'member@example.com')`, [HOST, MEMBER])
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'freitags-poll', 'tokenpoll00001', $2, 'Freitags-Poll', 'poll')`, [EVENT, HOST])
    await client.query(`INSERT INTO event_members (event_id, user_id, zone, team, team_joined_at) VALUES ($1, $2, 'bench', NULL, NULL), ($1, $3, 'team', 1, now())`, [EVENT, HOST, MEMBER])

    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('leaves every existing Member without a word', async () => {
    const { rows } = await client.query<{ team_word: string | null }>(`SELECT team_word FROM event_members`)
    expect(rows).toEqual([{ team_word: null }, { team_word: null }])
  })

  it('keeps a word to a Player in a team', async () => {
    await expect(client.query(`UPDATE event_members SET team_word = 'Wilde' WHERE user_id = $1`, [HOST])).rejects.toThrow()
    await client.query(`UPDATE event_members SET team_word = 'Wilde' WHERE user_id = $1`, [MEMBER])
    await expect(client.query(`UPDATE event_members SET zone = 'bench', team = NULL, team_joined_at = NULL WHERE user_id = $1`, [MEMBER])).rejects.toThrow()
    await client.query(`UPDATE event_members SET zone = 'bench', team = NULL, team_joined_at = NULL, team_word = NULL WHERE user_id = $1`, [MEMBER])
  })

  it('keeps whitespace and the empty string out of a word', async () => {
    await client.query(`UPDATE event_members SET zone = 'team', team = 1, team_joined_at = now() WHERE user_id = $1`, [MEMBER])
    await expect(client.query(`UPDATE event_members SET team_word = '' WHERE user_id = $1`, [MEMBER])).rejects.toThrow()
    await expect(client.query(`UPDATE event_members SET team_word = 'Wilde Gurken' WHERE user_id = $1`, [MEMBER])).rejects.toThrow()
    await expect(client.query(`UPDATE event_members SET team_word = E'Wilde\\t' WHERE user_id = $1`, [MEMBER])).rejects.toThrow()
    await client.query(`UPDATE event_members SET team_word = 'Gurken' WHERE user_id = $1`, [MEMBER])
  })
})
