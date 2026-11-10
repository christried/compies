import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './app'
import { createTestDbBefore, migrateTo } from './harness'
import { signIn, stubAuthEnv } from './sign-in'

// The migration that opens the Team names (#438, spec #425, ADR 0007): data only. In every Event that is not finished the frozen names go, and a team
// whose frozen name is NULL (the Host reset it after the start) loses its words; a finished or archived Event keeps its rows and its words. The
// previous deployment may still freeze at a start while the build migrates: the new code ignores such rows until the Finish.

const MIGRATION = '0030_team_names_open'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const PLAYERS = ['00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b3']
const RUNNING = '00000000-0000-4000-8000-0000000000e1'
const DATE_SET = '00000000-0000-4000-8000-0000000000e2'
const FINISHED = '00000000-0000-4000-8000-0000000000e3'
const ARCHIVED = '00000000-0000-4000-8000-0000000000e4'
const SETTINGS = `'teams', 2, 3, 10, '{"preset":"linear","values":[1,0]}'::jsonb, 'admin_pick', false, true, NULL`

const rowsOf = async (client: PGlite, eventId: string) =>
  (await client.query<{ position: number, frozen_name: string | null }>(`SELECT position, frozen_name FROM event_teams WHERE event_id = $1 ORDER BY position`, [eventId])).rows
const wordsOf = async (client: PGlite, eventId: string) =>
  (await client.query<{ team: number | null, team_word: string | null }>(`SELECT team, team_word FROM event_members WHERE event_id = $1 AND user_id = ANY($2) ORDER BY team_joined_at, user_id`, [eventId, PLAYERS])).rows.map(row => [row.team, row.team_word])

describe('migration: Team names open', () => {
  let client: PGlite
  let folder: string
  let db: Awaited<ReturnType<typeof createTestDbBefore>>['db']

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    db = before.db

    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com'), ($2, 'Eins', 'one@example.com'), ($3, 'Zwei', 'two@example.com'), ($4, 'Drei', 'three@example.com')`, [HOST, ...PLAYERS])
    const event = (id: string, slug: string, phase: string, finishedAt: string | null) => client.query(
      `INSERT INTO events (id, slug, invite_token, host_id, name, phase, finished_at, format, team_count, team_size, game_count, points_table, selection_mode, hidden_wheel, pool_preview, veto_allowance)
       VALUES ($1, $2, $3, $4, $2, $5, $6, ${SETTINGS})`,
      [id, slug, `token-${slug}`, HOST, phase, finishedAt],
    )
    await event(RUNNING, 'laeuft', 'running', null)
    await event(DATE_SET, 'termin', 'date_set', null)
    await event(FINISHED, 'vorbei', 'finished', '2090-10-31T22:00:00Z')
    await event(ARCHIVED, 'archiv', 'archived', '2090-10-31T22:00:00Z')

    // Players One and Two in team 1, Three in team 2, in the join order One, Two, Three, each with a word.
    for (const id of [RUNNING, DATE_SET, FINISHED, ARCHIVED]) {
      await client.query(
        `INSERT INTO event_members (event_id, user_id, zone, team, team_word, team_joined_at)
         VALUES ($1, $2, 'team', 1, 'Wilde', '2090-10-30T20:00:01Z'), ($1, $3, 'team', 1, 'Gurken', '2090-10-30T20:00:02Z'), ($1, $4, 'team', 2, 'Rote', '2090-10-30T20:00:03Z')`,
        [id, ...PLAYERS],
      )
    }
    // A running Event froze at its start, then the Host reset team 2 (frozen NULL). A finished and an archived one are Events from before 0.12.
    await client.query(`INSERT INTO event_teams (event_id, position, frozen_name) VALUES ($1, 1, 'Wilde Gurken'), ($1, 2, NULL)`, [RUNNING])
    for (const id of [FINISHED, ARCHIVED]) await client.query(`INSERT INTO event_teams (event_id, position, frozen_name) VALUES ($1, 1, 'Alte Hasen'), ($1, 2, NULL)`, [id])

    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('removes the frozen names of a running Event, keeps the words of a team that had a name and clears those of a reset team', async () => {
    expect(await rowsOf(client, RUNNING)).toEqual([])
    expect(await wordsOf(client, RUNNING)).toEqual([[1, 'Wilde'], [1, 'Gurken'], [2, null]])
  })

  it('leaves an Event in the poll untouched', async () => {
    expect(await rowsOf(client, DATE_SET)).toEqual([])
    expect(await wordsOf(client, DATE_SET)).toEqual([[1, 'Wilde'], [1, 'Gurken'], [2, 'Rote']])
  })

  it('keeps the rows and the words of a finished and of an archived Event, also a team whose stored name is the colour name', async () => {
    for (const id of [FINISHED, ARCHIVED]) {
      expect(await rowsOf(client, id)).toEqual([{ position: 1, frozen_name: 'Alte Hasen' }, { position: 2, frozen_name: null }])
      expect(await wordsOf(client, id)).toEqual([[1, 'Wilde'], [1, 'Gurken'], [2, 'Rote']])
    }
  })

  it('keeps the table and its primary key, which the previous deployment inserts into', async () => {
    const columns = await client.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'event_teams' ORDER BY ordinal_position`)
    expect(columns.rows.map(row => row.column_name)).toEqual(['event_id', 'position', 'frozen_name'])
    await expect(client.query(`INSERT INTO event_teams (event_id, position, frozen_name) VALUES ($1, 1, 'Doppelt')`, [FINISHED])).rejects.toThrow()
  })

  describe('after the previous deployment froze a start during the switch-over', () => {
    /** The Event read of a Member who signs in after the migration (the seeded Players never signed in through Better Auth). */
    async function readNames(slug: string) {
      stubAuthEnv()
      const request = createTestApp(db)
      const { cookie } = await signIn(db, { provider: 'discord', id: '9', name: 'Gast', email: 'member@example.com', image: undefined })
      const viewer = (await client.query<{ id: string }>(`SELECT id FROM users WHERE email = 'member@example.com'`)).rows[0]!.id
      await client.query(`INSERT INTO event_members (event_id, user_id) SELECT id, $1 FROM events WHERE slug = $2 ON CONFLICT DO NOTHING`, [viewer, slug])

      const response = await request(`/api/e/${slug}`, { headers: { cookie } })
      expect(response.status).toBe(200)
      return (await response.json() as { teams: { position: number, name: string | null }[] }).teams
    }

    it('shows the composed names of the unfinished Event and the stored names of the finished one', async () => {
      // What freezeTeamNames wrote at a first start, and a Host's reset after it.
      await client.query(`INSERT INTO event_teams (event_id, position, frozen_name) VALUES ($1, 1, 'Eingefroren'), ($1, 2, 'Auch eingefroren')`, [RUNNING])

      expect(await readNames('laeuft')).toEqual([{ position: 1, name: 'Wilde Gurken' }, { position: 2, name: null }])
      expect(await readNames('vorbei')).toEqual([{ position: 1, name: 'Alte Hasen' }, { position: 2, name: null }])
      expect(await readNames('archiv')).toEqual([{ position: 1, name: 'Alte Hasen' }, { position: 2, name: null }])
    })
  })
})
