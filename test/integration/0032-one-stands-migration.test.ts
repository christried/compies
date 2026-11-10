import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that leaves one place outside the teams (#437, spec #425, ADR 0007): every `bench` seat becomes `stands`, and
// the column's default becomes `stands`. The enum value `bench` stays, because the deployment before 0.12 serves until the
// switch-over and may still write it (a move to the Bench from an old tab, a lowered team count); the new code reads such a row as
// the Stands. So this test also writes `bench` after the migration, as that code does, and checks that the table takes it.

const MIGRATION = '0032_one_stands'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const BENCHED = '00000000-0000-4000-8000-0000000000a2'
const STANDING = '00000000-0000-4000-8000-0000000000a3'
const PLAYER = '00000000-0000-4000-8000-0000000000a4'
const NEWCOMER = '00000000-0000-4000-8000-0000000000a5'
const EVENT = '00000000-0000-4000-8000-0000000000e1'

describe('migration: one Stands', () => {
  let client: PGlite
  let folder: string
  let migrate: () => Promise<void>

  const zoneOf = async (userId: string) => {
    const { rows } = await client.query<{ zone: string, team: number | null, team_joined_at: Date | null, team_word: string | null }>(
      `SELECT zone, team, team_joined_at, team_word FROM event_members WHERE user_id = $1`, [userId],
    )
    return rows[0]
  }

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    migrate = () => migrateTo(before.db)

    await client.query(
      `INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com'), ($2, 'Bank', 'bank@example.com'), ($3, 'Tribüne', 'stands@example.com'), ($4, 'Team', 'team@example.com'), ($5, 'Neu', 'neu@example.com')`,
      [HOST, BENCHED, STANDING, PLAYER, NEWCOMER],
    )
    await client.query(`INSERT INTO events (id, slug, invite_token, host_id, name, phase) VALUES ($1, 'freitags', 'tokenone000001', $2, 'Freitags', 'poll')`, [EVENT, HOST])
    // The Host and a Member on the old schema's default (bench), one on the Stands, one in team 1 with a Team word.
    await client.query(`INSERT INTO event_members (event_id, user_id) VALUES ($1, $2), ($1, $3)`, [EVENT, HOST, BENCHED])
    await client.query(`INSERT INTO event_members (event_id, user_id, zone) VALUES ($1, $2, 'stands')`, [EVENT, STANDING])
    await client.query(`INSERT INTO event_members (event_id, user_id, zone, team, team_joined_at, team_word) VALUES ($1, $2, 'team', 1, '2026-11-01T10:00:00Z', 'Wilde')`, [EVENT, PLAYER])
    const old = await client.query<{ zone: string }>(`SELECT zone FROM event_members WHERE user_id = $1`, [BENCHED])
    expect(old.rows).toEqual([{ zone: 'bench' }])

    await migrate()
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('turns every bench seat into the Stands, the Host\'s too', async () => {
    expect(await zoneOf(BENCHED)).toMatchObject({ zone: 'stands', team: null })
    expect(await zoneOf(HOST)).toMatchObject({ zone: 'stands', team: null })
    const { rows } = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM event_members WHERE zone = 'bench'`)
    expect(rows).toEqual([{ count: 0 }])
  })

  it('leaves the Stands seat and the team seat as they were, with the joining moment and the Team word', async () => {
    expect(await zoneOf(STANDING)).toMatchObject({ zone: 'stands', team: null })
    expect(await zoneOf(PLAYER)).toEqual({ zone: 'team', team: 1, team_joined_at: new Date('2026-11-01T10:00:00Z'), team_word: 'Wilde' })
  })

  it('seats a Member inserted without a zone on the Stands, and the column\'s default says so', async () => {
    await client.query(`INSERT INTO event_members (event_id, user_id) VALUES ($1, $2)`, [EVENT, NEWCOMER])
    expect(await zoneOf(NEWCOMER)).toMatchObject({ zone: 'stands', team: null })
    const { rows } = await client.query<{ column_default: string }>(
      `SELECT column_default FROM information_schema.columns WHERE table_name = 'event_members' AND column_name = 'zone'`,
    )
    expect(rows[0]?.column_default).toContain('stands')
  })

  it('keeps the enum value bench, so the code before the switch-over can still write it', async () => {
    const { rows } = await client.query<{ range: string }>(`SELECT enum_range(NULL::member_zone)::text AS range`)
    expect(rows[0]?.range).toBe('{bench,stands,team}')
    // What the old code does after the migration ran: a move to the Bench (the team check accepts it).
    await client.query(`UPDATE event_members SET zone = 'bench' WHERE user_id = $1`, [STANDING])
    expect(await zoneOf(STANDING)).toMatchObject({ zone: 'bench', team: null })
  })

  it('does not run again: a bench seat written after the migration stays as written (reading it as the Stands is the code\'s job)', async () => {
    await migrate()
    expect(await zoneOf(STANDING)).toMatchObject({ zone: 'bench', team: null })
  })
})
