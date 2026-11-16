import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { applyPlan, checkPlan, exportLibrary } from '../../.claude/skills/christried-tag-review/library-tags-core.mjs'
import { notesPlainText, type NotesDoc } from '../../shared/notes-doc'
import { createTestDb, resetDatabase } from './harness'

// The Tag review on the operator's own library (#730, spec #717 § A and § C, ADR 0018): the core of /christried-tag-review reads and writes one User's games
// only, and turns the note document into text. It runs here against PGlite with a session like the script's Neon one; what a test pins is what the export
// holds, what the dry run prints and what the rows are afterwards.

const A = '00000000-0000-4000-8000-0000000000a1'
const B = '00000000-0000-4000-8000-0000000000b2'
const MISSING = '00000000-0000-4000-8000-0000000000c3'
const gameId = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const item = (text: string) => ({ type: 'listItem', content: [paragraph(text)] })

describe('the Tag review of one library (#730)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let client: PGlite
  let session: Parameters<typeof applyPlan>[0]

  beforeAll(async () => {
    testDb = await createTestDb()
    client = testDb.client
    // The script's Neon session, on PGlite: a query, and a transaction that rolls back when its work throws.
    session = {
      query: (sql, params) => client.query(sql, params),
      transaction: run => client.transaction(tx => run({ query: (sql, params) => tx.query(sql, params) })),
    }
  })

  afterAll(async () => {
    await client.close()
  })

  beforeEach(async () => {
    await resetDatabase(testDb.db)
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Besitzer', 'a@example.com'), ($2, 'Fremder', 'b@example.com')`, [A, B])
  })

  async function addGame(id: string, owner: string, name: string, extra: { notesDoc?: unknown, archived?: boolean } = {}) {
    await client.query(
      `INSERT INTO games (id, name, notes_doc, archived_at, created_by) VALUES ($1, $2, $3, $4, $5)`,
      [id, name, extra.notesDoc === undefined ? null : JSON.stringify(extra.notesDoc), extra.archived ? new Date('2026-01-01') : null, owner],
    )
  }

  async function addTag(id: string, label: string, position: number, createdAt = '2026-01-01T00:00:00Z') {
    await client.query(`INSERT INTO game_tags (game_id, key, label, position, created_at) VALUES ($1, $2, $3, $4, $5)`, [id, label.toLocaleLowerCase('de'), label, position, createdAt])
  }

  async function tagsOf(id: string) {
    const { rows } = await client.query<{ label: string }>(`SELECT label FROM game_tags WHERE game_id = $1 ORDER BY position`, [id])
    return rows.map(row => row.label)
  }

  async function tagRows() {
    const { rows } = await client.query(`SELECT game_id, key, label, position FROM game_tags ORDER BY game_id, key`)
    return rows
  }

  describe('export', () => {
    it('holds the games of the one User and no row of another library', async () => {
      await addGame(gameId(1), A, 'Alpha Spiel')
      await addGame(gameId(2), A, 'Beta Spiel')
      await addGame(gameId(3), B, 'Fremdwort Spiel', { notesDoc: { type: 'doc', content: [paragraph('Fremdnotiz')] } })
      await addTag(gameId(1), 'Shooter', 0)
      await addTag(gameId(3), 'Fremdtag', 0)

      const { games, tagsInUse } = await exportLibrary(session, A, notesPlainText)

      expect(games.map(game => game.name)).toEqual(['Alpha Spiel', 'Beta Spiel'])
      expect([...tagsInUse]).toEqual([['Shooter', 1]])
      const text = JSON.stringify(games)
      for (const marker of ['Fremdwort', 'Fremdnotiz', 'Fremdtag']) expect(text).not.toContain(marker)
    })

    it('exports an empty library and a library of one game', async () => {
      expect((await exportLibrary(session, A, notesPlainText)).games).toEqual([])
      await addGame(gameId(1), A, 'Einzig')
      expect((await exportLibrary(session, A, notesPlainText)).games.map(game => game.name)).toEqual(['Einzig'])
    })

    it('keeps an archived game in the export', async () => {
      await addGame(gameId(1), A, 'Archiviert', { archived: true })
      expect((await exportLibrary(session, A, notesPlainText)).games.map(game => game.name)).toEqual(['Archiviert'])
    })

    it('throws when the User does not exist', async () => {
      await expect(exportLibrary(session, MISSING, notesPlainText)).rejects.toThrow('no such User')
    })

    it('writes the note as plain text from the document, and null for none', async () => {
      const doc: NotesDoc = {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Setup' }] },
          { type: 'bulletList', content: [item('Ohne Spectator') as never, item('Mods an') as never] },
          { type: 'orderedList', content: [item('Erst') as never, item('Dann') as never] },
          { type: 'paragraph', content: [{ type: 'text', text: 'fett', marks: [{ type: 'bold' }] }, { type: 'text', text: ' und ' }, { type: 'text', text: 'Link', marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }] }] },
        ],
      }
      await addGame(gameId(1), A, 'Mit Notiz', { notesDoc: doc })
      await addGame(gameId(2), A, 'Ohne Notiz')

      const { games } = await exportLibrary(session, A, notesPlainText)

      expect(games.find(game => game.name === 'Mit Notiz')?.notes).toBe('Setup\n- Ohne Spectator\n- Mods an\n1. Erst\n2. Dann\nfett und Link')
      expect(games.find(game => game.name === 'Ohne Notiz')?.notes).toBeNull()
    })

    it('does not read the 0.15 text column', async () => {
      const doc = { type: 'doc', content: [paragraph('Neu')] }
      await addGame(gameId(1), A, 'Spiel', { notesDoc: doc })
      // The migration's trigger would carry the legacy text into notes_doc: switch it off to put the stale column last.
      await client.query(`ALTER TABLE games DISABLE TRIGGER games_sync_notes_doc_update`)
      await client.query(`UPDATE games SET notes = 'Alt' WHERE id = $1`, [gameId(1)])
      const { rows } = await client.query<{ notes_doc: unknown }>(`SELECT notes_doc FROM games WHERE id = $1`, [gameId(1)])
      expect(rows[0]?.notes_doc).toEqual(doc)

      expect((await exportLibrary(session, A, notesPlainText)).games[0]?.notes).toBe('Neu')
    })
  })

  describe('plan', () => {
    const entry = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: 'egal', tagsBefore: [] as string[], add: ['Neu'], remove: [] as string[], ...extra })

    it('shows the names of the User\'s games in a dry run and writes nothing', async () => {
      await addGame(gameId(1), A, 'Alpha Spiel')
      await addTag(gameId(1), 'Coop', 0)
      const before = await tagRows()

      const result = await checkPlan(session, [entry(gameId(1), { tagsBefore: ['coop'], add: ['Shooter'] })], A)

      expect(result.problems).toEqual([])
      expect(result.lines.join('\n')).toContain('Alpha Spiel')
      expect(await tagRows()).toEqual(before)
    })

    it('refuses another User\'s game and an unknown id in the same words, with no name', async () => {
      await addGame(gameId(1), A, 'Alpha Spiel')
      await addGame(gameId(2), B, 'Fremdes Spiel')

      const foreign = await checkPlan(session, [entry(gameId(1)), entry(gameId(2), { name: 'Fremdes Spiel' })], A)
      const unknown = await checkPlan(session, [entry(gameId(1)), entry(gameId(9), { name: 'Fremdes Spiel' })], A)

      expect(foreign.problems).toEqual(['entry 1 (' + gameId(2) + '): not a game of your library'])
      expect(unknown.problems).toEqual(['entry 1 (' + gameId(9) + '): not a game of your library'])
      for (const result of [foreign, unknown]) expect([...result.lines, ...result.problems].join('\n')).not.toContain('Fremdes Spiel')
    })

    it('writes nothing for any entry when one is refused', async () => {
      await addGame(gameId(1), A, 'Alpha Spiel')
      await addGame(gameId(2), B, 'Fremdes Spiel')
      await addTag(gameId(2), 'Coop', 0)
      const before = await tagRows()

      await expect(applyPlan(session, [entry(gameId(1)), entry(gameId(2), { tagsBefore: ['coop'] })], A)).rejects.toThrow('not a game of your library')

      expect(await tagRows()).toEqual(before)
    })

    it('gives a new Tag the label of the earliest row in this library, never another library\'s', async () => {
      await addGame(gameId(1), A, 'Eins')
      await addGame(gameId(2), A, 'Zwei')
      await addGame(gameId(3), B, 'Fremd')
      await addTag(gameId(3), 'SHOOTER', 0, '2025-01-01T00:00:00Z')
      await addTag(gameId(3), 'coop', 1, '2025-01-01T00:00:00Z')
      await addTag(gameId(1), 'Shooter', 0, '2026-01-01T00:00:00Z')

      await applyPlan(session, [entry(gameId(2), { add: ['shooter', 'Coop'] })], A)

      expect(await tagsOf(gameId(2))).toEqual(['Shooter', 'Coop'])
    })

    it('stops for a game whose Tags changed since the export, rolling the whole plan back', async () => {
      await addGame(gameId(1), A, 'Eins')
      await addGame(gameId(2), A, 'Zwei')
      await addTag(gameId(2), 'Coop', 0)

      await expect(applyPlan(session, [entry(gameId(1)), entry(gameId(2), { tagsBefore: [] })], A)).rejects.toThrow('Tags changed since the export')

      expect(await tagsOf(gameId(1))).toEqual([])
      expect(await tagsOf(gameId(2))).toEqual(['Coop'])
    })

    it('refuses a ninth Tag', async () => {
      await addGame(gameId(1), A, 'Eins')
      const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      for (const [position, key] of keys.entries()) await addTag(gameId(1), key, position)

      await expect(applyPlan(session, [entry(gameId(1), { tagsBefore: keys })], A)).rejects.toThrow('would have 9 Tags, 8 at most')

      expect(await tagsOf(gameId(1))).toEqual(keys)
    })

    it('puts a new Tag after the kept ones in consecutive positions and moves updated_at of the touched games only', async () => {
      await addGame(gameId(1), A, 'Eins')
      await addGame(gameId(2), A, 'Zwei')
      await addTag(gameId(1), 'Alt', 0)
      await addTag(gameId(1), 'Bleibt', 1)
      await addTag(gameId(1), 'Weg', 2)
      await client.query(`UPDATE games SET updated_at = '2020-01-01T00:00:00Z'`)

      await applyPlan(session, [entry(gameId(1), { tagsBefore: ['alt', 'bleibt', 'weg'], add: ['Neu'], remove: ['Weg'] })], A)

      expect(await tagsOf(gameId(1))).toEqual(['Alt', 'Bleibt', 'Neu'])
      const { rows } = await client.query<{ id: string, touched: boolean }>(`SELECT id, updated_at > '2021-01-01' AS touched FROM games`)
      expect(rows.find(row => row.id === gameId(1))?.touched).toBe(true)
      expect(rows.find(row => row.id === gameId(2))?.touched).toBe(false)
    })
  })
})
