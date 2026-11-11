import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDbBefore, migrateTo } from './harness'

// The migration that raises a short Clip to the floor of 10 s (#507, spec #501 § Clip length): data only. A clip under 10 s runs
// 10 s from the same start; 10 s and more stay. The previous deployment serves until the switch-over (ADR 0007) and may store 5 to 9 s
// after the migration: the column has no CHECK, so that write is legal.

const MIGRATION = '0034_clip_length_floor'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const FIVE = '00000000-0000-4000-8000-0000000000d1'
const NINE = '00000000-0000-4000-8000-0000000000d2'
const TEN = '00000000-0000-4000-8000-0000000000d3'
const SIXTY = '00000000-0000-4000-8000-0000000000d4'

describe('migration: the clip floor of 10 s', () => {
  let client: PGlite
  let folder: string

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
    await client.query(
      `INSERT INTO games (id, name, created_by, clip_start, clip_length) VALUES ($1, 'Fünf', $5, 72, 5), ($2, 'Neun', $5, 0, 9), ($3, 'Zehn', $5, 0, 10), ($4, 'Sechzig', $5, 0, 60)`,
      [FIVE, NINE, TEN, SIXTY, HOST],
    )
    await migrateTo(before.db)
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  const clipOf = async (id: string) => (await client.query<{ clip_start: number, clip_length: number }>(`SELECT clip_start, clip_length FROM games WHERE id = $1`, [id])).rows[0]

  it('raises 5 s and 9 s to 10 s', async () => {
    expect(await clipOf(FIVE)).toMatchObject({ clip_length: 10 })
    expect(await clipOf(NINE)).toMatchObject({ clip_length: 10 })
  })

  it('keeps the start of a clip it raises', async () => {
    expect(await clipOf(FIVE)).toMatchObject({ clip_start: 72 })
  })

  it('leaves 10 s and 60 s alone', async () => {
    expect(await clipOf(TEN)).toMatchObject({ clip_length: 10 })
    expect(await clipOf(SIXTY)).toMatchObject({ clip_length: 60 })
  })

  it('lets the previous deployment store a 5 s clip after the migration', async () => {
    await client.query(`UPDATE games SET clip_length = 5 WHERE id = $1`, [TEN])

    expect(await clipOf(TEN)).toMatchObject({ clip_length: 5 })
  })
})
