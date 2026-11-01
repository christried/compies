import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import readEvent from '../../server/api/e/[slug].get'
import type { EventView } from '../../shared/event'
import { createTestDbBefore, createTestServer, migrateTo } from './harness'
import { signIn, stubAuthEnv } from './sign-in'

// The migration that adds the Pool preview (#225): Events that are set up keep what they showed (Host pick and a
// visible wheel show the pools, a Hidden wheel does not), Events that are not set up stay without it, and a row the
// code before 0.6 writes during the switch-over (set up, no Pool preview) reads as it did there (ADR 0007).

const MIGRATION = '0014_pool_preview'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const GAME = '00000000-0000-4000-8000-0000000000d1'
const EVENTS = {
  notSetUp: '00000000-0000-4000-8000-0000000000e1',
  hostPick: '00000000-0000-4000-8000-0000000000e2',
  visibleWheel: '00000000-0000-4000-8000-0000000000e3',
  hiddenWheel: '00000000-0000-4000-8000-0000000000e4',
  oldCode: '00000000-0000-4000-8000-0000000000e5',
} as const

const SET_UP = `'teams', 2, 3, 10, '{"preset":"linear","values":[1,0]}'::jsonb`

describe('migration: Pool preview', () => {
  let client: PGlite
  let folder: string
  let db: Awaited<ReturnType<typeof createTestDbBefore>>['db']
  let memberCookie: string

  async function insertEvent(id: string, slug: string, settings: string) {
    await client.query(
      `INSERT INTO events (id, slug, invite_token, host_id, name, phase, format, team_count, team_size, game_count, points_table, selection_mode, hidden_wheel, veto_allowance)
       VALUES ($1, $2, $3, $4, $2, 'poll', ${settings})`,
      [id, slug, `token-${slug}`, HOST],
    )
    await client.query(`INSERT INTO event_pool_games (event_id, game_id, pool) VALUES ($1, $2, 'main')`, [id, GAME])
  }

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    db = before.db

    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Geheimspiel', $2)`, [GAME, HOST])
    await insertEvent(EVENTS.notSetUp, 'nicht-eingerichtet', 'NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL')
    await insertEvent(EVENTS.hostPick, 'host-wahl', `${SET_UP}, 'admin_pick', false, NULL`)
    await insertEvent(EVENTS.visibleWheel, 'offenes-rad', `${SET_UP}, 'lucky_wheel', false, 3`)
    await insertEvent(EVENTS.hiddenWheel, 'verdecktes-rad', `${SET_UP}, 'lucky_wheel', true, 3`)

    await migrateTo(before.db)

    // The code before 0.6 still serves until the switch-over: it creates an Event without the new column.
    await insertEvent(EVENTS.oldCode, 'alter-code', `${SET_UP}, 'admin_pick', false, NULL`)

    stubAuthEnv()
    memberCookie = (await signIn(db, { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined })).cookie
    const memberId = (await client.query<{ id: string }>(`SELECT id FROM users WHERE email = 'member@example.com'`)).rows[0]!.id
    for (const id of Object.values(EVENTS)) await client.query(`INSERT INTO event_members (event_id, user_id) VALUES ($1, $2)`, [id, memberId])
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  async function column(id: string) {
    return (await client.query<{ pool_preview: boolean | null }>(`SELECT pool_preview FROM events WHERE id = $1`, [id])).rows[0]!.pool_preview
  }

  async function memberRead(slug: string) {
    const request = createTestServer(db, { 'GET /api/e/:slug': readEvent })
    const response = await request(`/api/e/${slug}`, { headers: { cookie: memberCookie } })
    expect(response.status).toBe(200)
    return await response.json() as EventView
  }

  it('gives set-up Events what they showed: on for Host pick and a visible wheel, off for a Hidden wheel', async () => {
    expect(await column(EVENTS.hostPick)).toBe(true)
    expect(await column(EVENTS.visibleWheel)).toBe(true)
    expect(await column(EVENTS.hiddenWheel)).toBe(false)
  })

  it('leaves an Event that is not set up without a Pool preview', async () => {
    expect(await column(EVENTS.notSetUp)).toBeNull()
  })

  it('shows a Member the pools of Host pick and of a visible wheel, and nothing about the pools of a Hidden wheel or an Event not set up', async () => {
    expect((await memberRead('host-wahl')).pools).toMatchObject({ main: [{ name: 'Geheimspiel' }] })
    expect((await memberRead('offenes-rad')).pools).toMatchObject({ main: [{ name: 'Geheimspiel' }] })
    expect((await memberRead('verdecktes-rad')).pools).toBeNull()
    expect((await memberRead('nicht-eingerichtet')).pools).toBeNull()
  })

  it('reads an Event the old code wrote without a Pool preview (set up, visible wheel) as on', async () => {
    expect(await column(EVENTS.oldCode)).toBeNull()

    const view = await memberRead('alter-code')

    expect(view.settings?.poolPreview).toBe(true)
    expect(view.pools).toMatchObject({ main: [{ name: 'Geheimspiel' }] })
  })
})
