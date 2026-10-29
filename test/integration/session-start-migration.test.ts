import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import readEvent from '../../server/api/e/[slug].get'
import { createTestDbBefore, createTestServer, migrateTo } from './harness'
import { signIn, stubAuthEnv } from './sign-in'

// The migration that adds Session start (#164): Sessions of Events from before it read as not started, the Event read
// has no Running Session, and the database keeps the rules the code relies on.

const MIGRATION = '0012_session_start'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const EVENT = '00000000-0000-4000-8000-0000000000e1'
const OTHER_EVENT = '00000000-0000-4000-8000-0000000000e2'
const SESSION = '00000000-0000-4000-8000-0000000000c1'
const SECOND = '00000000-0000-4000-8000-0000000000c2'
const OTHER_SESSION = '00000000-0000-4000-8000-0000000000c3'

describe('migration: Session start', () => {
  let client: PGlite
  let folder: string
  let db: Awaited<ReturnType<typeof createTestDbBefore>>['db']

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    db = before.db

    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(
      `INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'freitags-set', 'tokenset000001', $3, 'Freitags-Set', 'date_set'), ($2, 'samstags', 'tokenset000002', $3, 'Samstags', 'date_set')`,
      [EVENT, OTHER_EVENT, HOST],
    )
    await client.query(`INSERT INTO event_members (event_id, user_id) VALUES ($1, $2)`, [EVENT, HOST])
    await client.query(
      `INSERT INTO sessions (id, event_id, starts_at) VALUES ($1, $4, '2090-10-31T19:00:00Z'), ($2, $4, '2090-11-07T19:00:00Z'), ($3, $5, '2090-11-14T19:00:00Z')`,
      [SESSION, SECOND, OTHER_SESSION, EVENT, OTHER_EVENT],
    )

    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('shows no Running Session and no start time in the Event read of an existing Event', async () => {
    stubAuthEnv()
    const request = createTestServer(db, { 'GET /api/e/:slug': readEvent })
    // A Member who signs in after the migration (the seeded Host never signed in through Better Auth).
    const { cookie } = await signIn(db, { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined })
    const memberId = (await client.query<{ id: string }>(`SELECT id FROM users WHERE email = 'member@example.com'`)).rows[0]!.id
    await client.query(`INSERT INTO event_members (event_id, user_id) VALUES ($1, $2)`, [EVENT, memberId])

    const response = await request('/api/e/freitags-set', { headers: { cookie } })
    const view = await response.json() as { runningSessionId: string | null, sessions: { startedAt: string | null, endedAt: string | null }[], teams: unknown[] }

    expect(response.status).toBe(200)
    expect(view.runningSessionId).toBeNull()
    expect(view.sessions.map(session => [session.startedAt, session.endedAt])).toEqual([[null, null], [null, null]])
  })

  it('leaves every existing Session not started and not ended, and no team frozen', async () => {
    const { rows } = await client.query<{ started_at: Date | null, ended_at: Date | null }>(`SELECT started_at, ended_at FROM sessions`)
    expect(rows).toHaveLength(3)
    expect(rows.every(row => row.started_at === null && row.ended_at === null)).toBe(true)
    expect((await client.query(`SELECT 1 FROM event_teams`)).rows).toEqual([])
  })

  it('refuses an end without a start, and a second Running Session in one Event, but not one in another Event', async () => {
    await expect(client.query(`UPDATE sessions SET ended_at = now() WHERE id = $1`, [SESSION])).rejects.toThrow()
    await client.query(`UPDATE sessions SET started_at = now() WHERE id = $1`, [SESSION])
    await expect(client.query(`UPDATE sessions SET started_at = now() WHERE id = $1`, [SECOND])).rejects.toThrow()
    await client.query(`UPDATE sessions SET started_at = now() WHERE id = $1`, [OTHER_SESSION])
    await client.query(`UPDATE sessions SET ended_at = now() WHERE id = $1`, [SESSION])
    await client.query(`UPDATE sessions SET started_at = now() WHERE id = $1`, [SECOND])
  })

  it('keeps one frozen name per team position of an Event, from position 1', async () => {
    await client.query(`INSERT INTO event_teams (event_id, position, frozen_name) VALUES ($1, 1, 'Wilde Gurken'), ($1, 2, NULL)`, [EVENT])
    await expect(client.query(`INSERT INTO event_teams (event_id, position) VALUES ($1, 1)`, [EVENT])).rejects.toThrow()
    await expect(client.query(`INSERT INTO event_teams (event_id, position) VALUES ($1, 0)`, [EVENT])).rejects.toThrow()
  })
})
