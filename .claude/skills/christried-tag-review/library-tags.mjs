// The Tags of the operator's own Game library, for /christried-tag-review (SKILL.md next to this file). One library: the games of the User named by --user, and
// nobody else's (ADR 0018, #730).
//
//   export <out.json> --user <User id>          reads the User's games (id, name, notes as text, Price, Suitabilities, players, Tags) into a file OUTSIDE the repo
//   <plan.json> --user <User id>                dry run: shows what the plan would change, writes nothing
//   <plan.json> --user <User id> --apply        writes the whole plan in one transaction
//
// A plan is a JSON array of { id, name, tagsBefore: [key, ...], add: [label, ...], remove: [label, ...] }.
// `tagsBefore` is the game's Tag keys in the export, in order. A game is written only while it is the User's and its Tags still equal them; one
// mismatch rolls the whole plan back. Added Tags go after the kept ones. A key some game of the library already carries keeps the label of
// its earliest row, as saveTags in server/utils/game-tags.ts does. At most 8 Tags per game, each at most 20 characters.
//
// Reads DATABASE_URL from the environment and never prints it, nor the User id. Keep both out of the files of the repo; the URL out of the command line:
//   node --env-file=.env.prod .claude/skills/christried-tag-review/library-tags.mjs export <out.json> --user <User id>
// What the queries do is in library-tags-core.mjs.
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { Pool } from '@neondatabase/serverless'
import { applyPlan, checkPlan, exportLibrary, UUID } from './library-tags-core.mjs'

function fail(message) {
  console.error(`Stopped: ${message}`)
  process.exit(1)
}

/** The flags out of the arguments, wherever they stand; what is left is the positional arguments. */
function parseArguments(argv) {
  const positional = []
  let user
  let apply = false
  for (let at = 0; at < argv.length; at++) {
    if (argv[at] === '--apply') {
      apply = true
    }
    else if (argv[at] === '--user') {
      const value = argv[at + 1]
      if (value !== undefined && !value.startsWith('--')) {
        user = value
        at++
      }
    }
    else {
      positional.push(argv[at])
    }
  }
  return { positional, user, apply }
}

const { positional, user, apply } = parseArguments(process.argv.slice(2))
if (!user || !UUID.test(user)) fail('--user <User id> is missing or is no uuid: the review reads and writes one User\'s library only.')
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
/** What the core takes: a query, and a transaction that rolls back when its work throws. */
const session = {
  query: (sql, params) => pool.query(sql, params),
  async transaction(run) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await run({ query: (sql, params) => client.query(sql, params) })
      await client.query('COMMIT')
      return result
    }
    catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    finally {
      client.release()
    }
  },
}

try {
  if (positional[0] === 'export') {
    if (!positional[1]) fail('export needs an output file.')
    const out = resolve(positional[1])
    if (!relative(process.cwd(), out).startsWith('..')) fail('write the export outside the repo: it holds library data.')
    const { loadNotesPlainText } = await import('./notes-text.mjs')
    const { games, tagsInUse } = await exportLibrary(session, user, await loadNotesPlainText())
      .catch(error => fail(error.message))
    writeFileSync(out, `${JSON.stringify(games, null, 2)}\n`)
    console.log(`Database ${endpoint}: exported ${games.length} games, ${games.filter(game => game.tags.length).length} with Tags, to ${out}`)
    console.log(`Tags in use: ${[...tagsInUse].sort((a, b) => b[1] - a[1]).map(([label, count]) => `${label} (${count})`).join(', ') || 'none'}`)
  }
  else {
    if (!positional[0]) fail('usage: export <out.json> --user <User id> | <plan.json> --user <User id> [--apply]')
    const plan = JSON.parse(readFileSync(resolve(positional[0]), 'utf8'))
    const { lines, problems } = await checkPlan(session, plan, user).catch(error => fail(error.message))
    console.log(`Database ${endpoint}: ${apply ? 'APPLYING' : 'dry run of'} ${plan.length} games\n`)
    console.log(lines.join('\n'))
    console.log('')
    if (problems.length > 0) fail(`${problems.length} games don't match the plan, nothing written:\n  ${problems.join('\n  ')}`)
    if (!apply) {
      console.log('Dry run: nothing written. Add --apply to write.')
    }
    else {
      await applyPlan(session, plan, user).catch(error => fail(`${error.message}; rolled back, nothing written.`))
      console.log(`Written: ${plan.length} games.`)
    }
  }
}
finally {
  await pool.end()
}
