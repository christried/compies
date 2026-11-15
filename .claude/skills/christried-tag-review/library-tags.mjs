// The Tags of the production Game library, for /christried-tag-review (SKILL.md next to this file).
//
//   export <out.json>        reads every game (id, name, notes, Price, Suitabilities, players, Tags) into a file OUTSIDE the repo
//   <plan.json>              dry run: shows what the plan would change, writes nothing
//   <plan.json> --apply      writes the whole plan in one transaction
//
// A plan is a JSON array of { id, name, tagsBefore: [key, ...], add: [label, ...], remove: [label, ...] }.
// `tagsBefore` is the game's Tag keys in the export, in order. A game is written only while its Tags still equal them; one
// mismatch rolls the whole plan back. Added Tags go after the kept ones. A key some game already carries keeps the label of
// its earliest row, as saveTags in server/utils/game-tags.ts does. At most 8 Tags per game, each at most 20 characters.
//
// Reads DATABASE_URL from the environment and never prints it. Keep the URL out of the command line:
//   node --env-file=.env.prod .claude/skills/christried-tag-review/library-tags.mjs export <out.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { Pool } from '@neondatabase/serverless'

const TAG_MAX = 20
const TAGS_PER_GAME_MAX = 8
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const graphemes = new Intl.Segmenter('de', { granularity: 'grapheme' })

function fail(message) {
  console.error(`Stopped: ${message}`)
  process.exit(1)
}

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

const args = process.argv.slice(2)
const url = process.env.DATABASE_URL
if (!url) fail('DATABASE_URL is not set (node --env-file=<file> ...).')
let endpoint
try {
  endpoint = new URL(url).hostname.split('.')[0]
}
catch {
  fail('DATABASE_URL is not a URL.')
}

const pool = new Pool({ connectionString: url })
try {
  if (args[0] === 'export') {
    if (!args[1]) fail('export needs an output file.')
    const out = resolve(args[1])
    if (!relative(process.cwd(), out).startsWith('..')) fail('write the export outside the repo: it holds library data.')
    const { rows } = await pool.query(`
      SELECT g.id, g.name, g.notes, g.price_cents, g.price_source, g.suitabilities, g.players_min, g.players_max, g.created_at,
             COALESCE((SELECT json_agg(json_build_object('key', t.key, 'label', t.label) ORDER BY t.position) FROM game_tags t WHERE t.game_id = g.id), '[]') AS tags
      FROM games g ORDER BY g.name`)
    const inUse = new Map()
    for (const row of rows) for (const tag of row.tags) inUse.set(tag.label, (inUse.get(tag.label) ?? 0) + 1)
    writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`)
    console.log(`Database ${endpoint}: exported ${rows.length} games, ${rows.filter(row => row.tags.length).length} with Tags, to ${out}`)
    console.log(`Tags in use: ${[...inUse].sort((a, b) => b[1] - a[1]).map(([label, count]) => `${label} (${count})`).join(', ') || 'none'}`)
  }
  else {
    if (!args[0]) fail('usage: export <out.json> | <plan.json> [--apply]')
    const apply = args.includes('--apply')
    const plan = JSON.parse(readFileSync(resolve(args[0]), 'utf8'))
    if (!Array.isArray(plan) || plan.length === 0) fail('the plan is not a non-empty array.')
    plan.forEach((entry, index) => {
      const problem = entryProblem(entry)
      if (problem) fail(`entry ${index} (${entry?.name ?? entry?.id}): ${problem}`)
    })
    if (new Set(plan.map(entry => entry.id)).size !== plan.length) fail('the plan names a game twice.')

    const { rows } = await pool.query(`
      SELECT g.id, g.name, ARRAY(SELECT t.key FROM game_tags t WHERE t.game_id = g.id ORDER BY t.position) AS tag_keys
      FROM games g WHERE g.id = ANY($1::uuid[])`, [plan.map(entry => entry.id)])
    const current = new Map(rows.map(row => [row.id, row]))
    const mismatches = []
    console.log(`Database ${endpoint}: ${apply ? 'APPLYING' : 'dry run of'} ${plan.length} games\n`)
    for (const entry of plan) {
      const row = current.get(entry.id)
      const { kept, added } = keysAfter(entry)
      const problem = !row
        ? 'no such game'
        : row.tag_keys.join('|') !== entry.tagsBefore.join('|')
          ? 'Tags changed since the export'
          : kept.length + added.length > TAGS_PER_GAME_MAX ? `would have ${kept.length + added.length} Tags, 8 at most` : null
      if (problem) mismatches.push(`${entry.name ?? entry.id}: ${problem}`)
      console.log(`■ ${row?.name ?? entry.name ?? entry.id}${problem ? `   !! ${problem}` : ''}`)
      if (entry.add?.length) console.log(`  + ${entry.add.join(', ')}`)
      if (entry.remove?.length) console.log(`  − ${entry.remove.join(', ')}`)
    }
    console.log('')
    if (mismatches.length > 0) fail(`${mismatches.length} games don't match the plan, nothing written:\n  ${mismatches.join('\n  ')}`)
    if (!apply) {
      console.log('Dry run: nothing written. Add --apply to write.')
    }
    else {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        for (const entry of plan) {
          const { kept, added } = keysAfter(entry)
          const removedKeys = entry.tagsBefore.filter(key => !kept.includes(key))
          if (removedKeys.length) await client.query(`DELETE FROM game_tags WHERE game_id = $1 AND key = ANY($2::text[])`, [entry.id, removedKeys])
          for (const [position, key] of kept.entries()) {
            await client.query(`UPDATE game_tags SET position = $3 WHERE game_id = $1 AND key = $2`, [entry.id, key, position])
          }
          for (const [index, key] of added.entries()) {
            const label = (entry.add ?? []).map(tagOf).find(tag => tag.key === key).label
            await client.query(
              `INSERT INTO game_tags (game_id, key, label, position)
               VALUES ($1, $2, COALESCE((SELECT label FROM game_tags WHERE key = $2 ORDER BY created_at, game_id LIMIT 1), $3), $4)`,
              [entry.id, key, label, kept.length + index],
            )
          }
          const { rows: [{ count }] } = await client.query(`SELECT count(*)::int AS count FROM game_tags WHERE game_id = $1`, [entry.id])
          if (count !== kept.length + added.length || count > TAGS_PER_GAME_MAX) throw new Error(`${entry.name ?? entry.id} changed during the write`)
          await client.query(`UPDATE games SET updated_at = now() WHERE id = $1`, [entry.id])
        }
        await client.query('COMMIT')
        console.log(`Written: ${plan.length} games.`)
      }
      catch (error) {
        await client.query('ROLLBACK')
        fail(`${error.message}; rolled back, nothing written.`)
      }
      finally {
        client.release()
      }
    }
  }
}
finally {
  await pool.end()
}
