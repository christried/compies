import { rmSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GAME_NOTES_MAX } from '../../shared/game'
import { notesFromLines, parseNotes } from '../../shared/notes-doc'
import { createTestDb, createTestDbBefore, migrateTo } from './harness'

// The migration that stores the Game notes as a document (#727, spec #717 § C, ADR 0019 and ADR 0007): a `notes_doc` jsonb column beside the 0.15
// text column, filled from it, one paragraph per line. The code that serves until the switch-over keeps writing `notes`; a trigger carries what it writes.

const MIGRATION = '0038_game_notes_document'

const HOST = '00000000-0000-4000-8000-0000000000a1'
const OTHER_HOST = '00000000-0000-4000-8000-0000000000a2'
const id = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`

// Every game of the 0.15 row set: its note as the old code stored it.
const OLD: { id: string, name: string, notes: string | null, lines: string[] | null, host?: string }[] = [
  { id: id(1), name: 'Eins', notes: 'Settings: 3 Runden', lines: ['Settings: 3 Runden'] },
  { id: id(2), name: 'Zwei', notes: 'a\nb', lines: ['a', 'b'] },
  { id: id(3), name: 'Drei', notes: 'a\r\nb', lines: ['a', 'b'] },
  { id: id(4), name: 'Vier', notes: 'a\n\nb', lines: ['a', '', 'b'] },
  { id: id(5), name: 'Fuenf', notes: 'a\r\n\nb\nc', lines: ['a', '', 'b', 'c'] },
  { id: id(6), name: 'Sechs', notes: null, lines: null },
  { id: id(7), name: 'Sieben', notes: '', lines: null },
  { id: id(8), name: 'Acht', notes: ' \n ', lines: null },
  { id: id(9), name: 'Neun', notes: '  eingerueckt \nund hinten  ', lines: ['  eingerueckt ', 'und hinten  '] },
  { id: id(10), name: 'Zehn', notes: '<b>x</b> "Zitat" \\ 🎮', lines: ['<b>x</b> "Zitat" \\ 🎮'] },
  { id: id(11), name: 'Elf', notes: 'Regeln: https://example.com/regeln', lines: ['Regeln: https://example.com/regeln'] },
  // A copy as 0036 makes it: another Host's row with the original's note.
  { id: id(12), name: 'Vier', notes: 'a\n\nb', lines: ['a', '', 'b'], host: OTHER_HOST },
]

describe('migration: Game notes as a document', () => {
  let client: PGlite
  let folder: string
  let migrate: () => Promise<void>

  beforeAll(async () => {
    const before = await createTestDbBefore(MIGRATION)
    client = before.client
    folder = before.folder
    migrate = () => migrateTo(before.db)
    await client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com'), ($2, 'Anderer Host', 'other@example.com')`, [HOST, OTHER_HOST])
    for (const game of OLD) {
      await client.query(`INSERT INTO games (id, name, notes, created_by) VALUES ($1, $2, $3, $4)`, [game.id, game.name, game.notes, game.host ?? HOST])
    }
    await migrate()
  })

  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  const docOf = async (gameId: string) => {
    const { rows } = await client.query<{ notes_doc: unknown }>(`SELECT notes_doc FROM games WHERE id = $1`, [gameId])
    return rows[0]?.notes_doc
  }

  it.each(OLD)('converts the note of $name ($id) the way notesFromLines builds it', async ({ id: gameId, lines }) => {
    const doc = await docOf(gameId)
    if (lines === null) {
      expect(doc).toBeNull()
      return
    }
    expect(doc).toEqual(notesFromLines(lines))
    expect(parseNotes(doc, GAME_NOTES_MAX)).toEqual(doc)
  })

  it('makes an empty line a paragraph without content', async () => {
    expect(await docOf(id(4))).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }, { type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'b' }] }],
    })
  })

  it('keeps the text of a link, a tag and a quote as text, with no mark', async () => {
    expect(await docOf(id(11))).toEqual({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Regeln: https://example.com/regeln' }] }] })
    expect(JSON.stringify(await docOf(id(10)))).not.toContain('marks')
  })

  it('converts a copy made by 0036 like its original', async () => {
    expect(await docOf(id(12))).toEqual(await docOf(id(4)))
  })

  it('leaves the old column as it was: the text, for every row', async () => {
    const { rows } = await client.query<{ id: string, notes: string | null }>(`SELECT id, notes FROM games ORDER BY id`)
    expect(rows).toEqual(OLD.map(game => ({ id: game.id, notes: game.notes })).sort((a, b) => a.id.localeCompare(b.id)))
  })

  it('has the document as a nullable jsonb column without a default, and the old column as text', async () => {
    const { rows } = await client.query<{ column_name: string, data_type: string, is_nullable: string, column_default: string | null }>(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'games' AND column_name IN ('notes', 'notes_doc') ORDER BY column_name`,
    )
    expect(rows).toEqual([
      { column_name: 'notes', data_type: 'text', is_nullable: 'YES', column_default: null },
      { column_name: 'notes_doc', data_type: 'jsonb', is_nullable: 'YES', column_default: null },
    ])
  })

  describe('the previous deployment (ADR 0007) while it still serves', () => {
    const NEW_1 = id(50)
    const NEW_2 = id(51)

    it('inserts a game with a note and without a document: the document follows the note', async () => {
      await client.query(`INSERT INTO games (id, name, notes, created_by) VALUES ($1, 'Neu', E'x\\ny', $2)`, [NEW_1, HOST])
      expect(await docOf(NEW_1)).toEqual(notesFromLines(['x', 'y']))
    })

    it('inserts a game without a note: the document stays null', async () => {
      await client.query(`INSERT INTO games (id, name, created_by) VALUES ($1, 'Ohne', $2)`, [NEW_2, HOST])
      expect(await docOf(NEW_2)).toBeNull()
    })

    it('updates the note: the document follows it', async () => {
      await client.query(`UPDATE games SET notes = E'neu\\n\\nText' WHERE id = $1`, [NEW_1])
      expect(await docOf(NEW_1)).toEqual(notesFromLines(['neu', '', 'Text']))
    })

    it('updates the note to null or to blank: the document is null', async () => {
      await client.query(`UPDATE games SET notes = NULL WHERE id = $1`, [NEW_1])
      expect(await docOf(NEW_1)).toBeNull()
      await client.query(`UPDATE games SET notes = E'a' WHERE id = $1`, [NEW_1])
      await client.query(`UPDATE games SET notes = '   ' WHERE id = $1`, [NEW_1])
      expect(await docOf(NEW_1)).toBeNull()
    })

    it('updates another column: the document stays', async () => {
      await client.query(`UPDATE games SET name = 'Umbenannt' WHERE id = $1`, [id(4)])
      expect(await docOf(id(4))).toEqual(notesFromLines(['a', '', 'b']))
    })

    it('takes the 0.16 write of the document and keeps it, whatever the old column holds', async () => {
      const doc = notesFromLines(['nur das Dokument'])
      await client.query(`UPDATE games SET notes_doc = $2::jsonb WHERE id = $1`, [id(4), JSON.stringify(doc)])
      expect(await docOf(id(4))).toEqual(doc)
      await client.query(`UPDATE games SET name = 'Wieder' WHERE id = $1`, [id(4)])
      expect(await docOf(id(4))).toEqual(doc)
    })
  })

  it('takes an insert with a document on a fresh database', async () => {
    const fresh = await createTestDb()
    try {
      await fresh.client.query(`INSERT INTO users (id, name, email) VALUES ($1, 'Host', 'host@example.com')`, [HOST])
      await fresh.client.query(`INSERT INTO games (id, name, notes_doc, created_by) VALUES ($1, 'Frisch', $2::jsonb, $3)`, [id(1), JSON.stringify(notesFromLines(['a'])), HOST])
      const { rows } = await fresh.client.query<{ notes_doc: unknown, notes: string | null }>(`SELECT notes_doc, notes FROM games`)
      expect(rows).toEqual([{ notes_doc: notesFromLines(['a']), notes: null }])
    }
    finally {
      await fresh.client.close()
    }
  })
})
