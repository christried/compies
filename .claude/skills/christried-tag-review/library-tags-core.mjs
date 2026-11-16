// What /christried-tag-review's script (library-tags.mjs) reads, checks and writes, on one User's library (#730, spec #717 § A, ADR 0018): since 0.16 a Tag
// exists only inside one library, as loadTagsInUse and saveTags in server/utils/game-tags.ts have it. The core never opens a connection and never ends the process:
// the script hands it a session and turns a thrown Error into `Stopped: …`, and a test hands it one on PGlite (test/integration/library-tag-review.test.ts).

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TAG_MAX = 20
const TAGS_PER_GAME_MAX = 8
const graphemes = new Intl.Segmenter('de', { granularity: 'grapheme' })

/**
 * @typedef {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} Queryable
 * @typedef {Queryable & { transaction: <T>(run: (tx: Queryable) => Promise<T>) => Promise<T> }} Session
 * `transaction` runs the work in one transaction and rolls it back when the work throws.
 * @typedef {{ id: string, name?: string, tagsBefore: string[], add?: string[], remove?: string[] }} PlanEntry
 */

/** A Tag as typed, as normaliseTag in shared/game.ts makes it. */
function tagOf(raw) {
  if (typeof raw !== 'string') return null
  const label = raw.normalize('NFC').trim().replace(/\s+/g, ' ')
  return label === '' ? null : { key: label.toLocaleLowerCase('de'), label }
}

function isTagList(list) {
  return Array.isArray(list) && list.every((raw) => {
    const tag = tagOf(raw)
    return tag && [...graphemes.segment(tag.label)].length <= TAG_MAX
  })
}

/** What is wrong with one plan entry, or null. */
function entryProblem(entry) {
  if (!entry || typeof entry !== 'object') return 'not an object'
  if (typeof entry.id !== 'string' || !UUID.test(entry.id)) return 'id is not a uuid'
  if (!Array.isArray(entry.tagsBefore) || !entry.tagsBefore.every(key => typeof key === 'string')) return 'tagsBefore is not a list of keys'
  if (!isTagList(entry.add ?? []) || !isTagList(entry.remove ?? [])) return 'add or remove holds an empty Tag or one longer than 20 characters'
  if ((entry.add ?? []).length + (entry.remove ?? []).length === 0) return 'changes nothing'
  return null
}

/** The game's keys after the plan: the kept ones in order, then the added ones. */
function keysAfter(entry) {
  const removed = new Set((entry.remove ?? []).map(raw => tagOf(raw).key))
  const kept = entry.tagsBefore.filter(key => !removed.has(key))
  const added = (entry.add ?? []).map(raw => tagOf(raw).key).filter(key => !kept.includes(key))
  return { kept, added: [...new Set(added)] }
}

/**
 * The User's games with their Tags, and the Tags in use (label to count) over these games only. `notes` is the note document as plain text, null for none; an
 * archived game stays in, the review covers the library. Throws when the User does not exist.
 * @param {Queryable} session
 * @param {string} userId
 * @param {(doc: any) => string} notesPlainText shared/notes-doc.ts' function, which the script loads (notes-text.mjs)
 */
export async function exportLibrary(session, userId, notesPlainText) {
  const { rows: users } = await session.query(`SELECT id FROM users WHERE id = $1`, [userId])
  if (users.length === 0) throw new Error('no such User')
  const { rows } = await session.query(`
    SELECT g.id, g.name, g.notes_doc AS notes, g.price_cents, g.price_source, g.suitabilities, g.players_min, g.players_max, g.created_at,
           COALESCE((SELECT json_agg(json_build_object('key', t.key, 'label', t.label) ORDER BY t.position) FROM game_tags t WHERE t.game_id = g.id), '[]') AS tags
    FROM games g WHERE g.created_by = $1 ORDER BY g.name`, [userId])
  const games = rows.map(row => ({ ...row, notes: row.notes === null ? null : notesPlainText(row.notes) }))
  const tagsInUse = new Map()
  for (const game of games) for (const tag of game.tags) tagsInUse.set(tag.label, (tagsInUse.get(tag.label) ?? 0) + 1)
  return { games, tagsInUse }
}

/**
 * What the plan would do to the User's library: the lines to print and what is wrong. A game that is not the User's, or does not exist, is refused with one wording
 * and shown by its index and id, never by a name; only a game that the scoped query returned is shown by its own name. Throws when the plan itself is malformed.
 * @param {Queryable} session
 * @param {PlanEntry[]} plan
 * @param {string} userId
 * @returns {Promise<{ lines: string[], problems: string[] }>}
 */
export async function checkPlan(session, plan, userId) {
  if (!Array.isArray(plan) || plan.length === 0) throw new Error('the plan is not a non-empty array.')
  plan.forEach((entry, index) => {
    const problem = entryProblem(entry)
    if (problem) throw new Error(`entry ${index}: ${problem}`)
  })
  if (new Set(plan.map(entry => entry.id)).size !== plan.length) throw new Error('the plan names a game twice.')

  const { rows } = await session.query(`
    SELECT g.id, g.name, ARRAY(SELECT t.key FROM game_tags t WHERE t.game_id = g.id ORDER BY t.position) AS tag_keys
    FROM games g WHERE g.id = ANY($1::uuid[]) AND g.created_by = $2`, [plan.map(entry => entry.id), userId])
  const current = new Map(rows.map(row => [row.id, row]))
  const lines = []
  const problems = []
  for (const [index, entry] of plan.entries()) {
    const row = current.get(entry.id)
    const { kept, added } = keysAfter(entry)
    const problem = !row
      ? 'not a game of your library'
      : row.tag_keys.join('|') !== entry.tagsBefore.join('|')
        ? 'Tags changed since the export'
        : kept.length + added.length > TAGS_PER_GAME_MAX ? `would have ${kept.length + added.length} Tags, ${TAGS_PER_GAME_MAX} at most` : null
    const shown = row ? row.name : `entry ${index} (${entry.id})`
    if (problem) problems.push(`${shown}: ${problem}`)
    lines.push(`■ ${shown}${problem ? `   !! ${problem}` : ''}`)
    if (entry.add?.length) lines.push(`  + ${entry.add.join(', ')}`)
    if (entry.remove?.length) lines.push(`  − ${entry.remove.join(', ')}`)
  }
  return { lines, problems }
}

/**
 * Writes the whole plan in one transaction, or nothing: any refused entry, a game that changed during the write or a failed query throws and rolls it back. A new Tag
 * takes the label of the earliest row of its key in this User's library, as saveTags does.
 * @param {Session} session
 * @param {PlanEntry[]} plan
 * @param {string} userId
 */
export async function applyPlan(session, plan, userId) {
  await session.transaction(async (tx) => {
    const { problems } = await checkPlan(tx, plan, userId)
    if (problems.length > 0) throw new Error(`${problems.length} games don't match the plan, nothing written:\n  ${problems.join('\n  ')}`)
    for (const [index, entry] of plan.entries()) {
      const { kept, added } = keysAfter(entry)
      const removedKeys = entry.tagsBefore.filter(key => !kept.includes(key))
      if (removedKeys.length) await tx.query(`DELETE FROM game_tags WHERE game_id = $1 AND key = ANY($2::text[])`, [entry.id, removedKeys])
      for (const [position, key] of kept.entries()) {
        await tx.query(`UPDATE game_tags SET position = $3 WHERE game_id = $1 AND key = $2`, [entry.id, key, position])
      }
      for (const [at, key] of added.entries()) {
        const label = (entry.add ?? []).map(tagOf).find(tag => tag.key === key).label
        await tx.query(
          `INSERT INTO game_tags (game_id, key, label, position)
           VALUES ($1, $2, COALESCE((SELECT t.label FROM game_tags t JOIN games g ON g.id = t.game_id WHERE t.key = $2 AND g.created_by = $5 ORDER BY t.created_at, t.game_id LIMIT 1), $3), $4)`,
          [entry.id, key, label, kept.length + at, userId],
        )
      }
      const { rows: [{ count }] } = await tx.query(`SELECT count(*)::int AS count FROM game_tags WHERE game_id = $1`, [entry.id])
      if (count !== kept.length + added.length || count > TAGS_PER_GAME_MAX) throw new Error(`a game changed during the write (entry ${index})`)
      const { rows: touched } = await tx.query(`UPDATE games SET updated_at = now() WHERE id = $1 AND created_by = $2 RETURNING id`, [entry.id, userId])
      if (touched.length !== 1) throw new Error(`a game changed during the write (entry ${index})`)
    }
  })
}
