// Deletes one account for the operator (#919, spec #907, ADR 0020): the same deletion as DELETE /api/me (`deleteUser` and `removeImages` of
// server/utils/delete-user.ts) for the User id given, against the database and the image store this process's environment names. The User's Messages lose their
// text, their Events and games go, their Membership of other Hosts' Events ends, and the row stays as a nameless one.
//
//   node scripts/prod/delete-account.mjs <User id>            dry run: counts what would go and deletes nothing
//   node scripts/prod/delete-account.mjs <User id> --apply    deletes, then removes the images
//
// Without --apply nothing is deleted: the whole deletion runs inside a transaction that is rolled back, so a refusal shows too and the numbers are the ones
// --apply prints. Reads DATABASE_URL from the environment; --apply also needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET (R2_JURISDICTION
// when the bucket is in the EU), the names of server/utils/image-store.ts. It never prints the User id, a name, an address, a Message's text, an image key, the URL
// or an R2_* value, and it tells no room (0.21-7, #914): every open page finds out at its next read. A button for the same deletion is the Admin page's (#682).
//
// Against production, with the URL never typed on a command line and never in a transcript: write the gitignored .env.prod (`.gitignore` holds .env.*) with
// DATABASE_URL and the R2_* variables of production for the run, and delete it afterwards:
//   node --env-file=.env.prod scripts/prod/delete-account.mjs <User id>
//   node --env-file=.env.prod scripts/prod/delete-account.mjs <User id> --apply
//
// Plain Node loads the TypeScript modules (register-ts.mjs), which works while server/utils/delete-user.ts and what it imports stay in erasable syntax: no
// `enum`, no parameter property, no `namespace` (test/unit/delete-account-script.test.ts fails otherwise). What the work does is in delete-account-core.mjs.
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { deleteAccount, reportLines, Stopped, UUID } from './delete-account-core.mjs'

function fail(message) {
  console.error(`Stopped: ${message}`)
  process.exitCode = 1
}

const R2_NAMES = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']

/** What the arguments hold: every `--` word is a flag, the rest are positional. */
function parseArguments(argv) {
  const positional = argv.filter(argument => !argument.startsWith('--'))
  const flags = argv.filter(argument => argument.startsWith('--'))
  return { userId: positional[0], apply: flags.includes('--apply'), unknown: positional.length > 1 || flags.some(flag => flag !== '--apply') }
}

/** The first reason not to run, checked before any module is loaded and any connection is made; nothing here names the id or the URL. */
function problem({ userId, apply, unknown }) {
  if (!userId || !UUID.test(userId)) return 'give the User id as a uuid: node scripts/prod/delete-account.mjs <User id> [--apply].'
  const url = process.env.DATABASE_URL
  if (!url) return 'DATABASE_URL is not set (node --env-file=<file> ...).'
  try {
    new URL(url)
  }
  catch {
    return 'DATABASE_URL is not a URL.'
  }
  if (apply && R2_NAMES.some(name => !process.env[name])) return `--apply needs ${R2_NAMES.slice(0, -1).join(', ')} and ${R2_NAMES.at(-1)}.`
  if (unknown) return 'unknown argument; the command takes one User id and --apply.'
  return null
}

const parsed = parseArguments(process.argv.slice(2))
const refusal = problem(parsed)
if (refusal) {
  fail(refusal)
}
else {
  const { userId, apply } = parsed
  const url = /** @type {string} */ (process.env.DATABASE_URL)
  const endpoint = new URL(url).hostname.split('.')[0]
  // A Pool does not outlive its job (ADR 0005). A real run gains nothing from waiting long for a connection.
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 })
  pool.on('error', () => {})
  let phase = 'running'
  try {
    phase = 'loading the modules'
    await import('./register-ts.mjs')
    const schema = await import(new URL('../../server/db/schema.ts', import.meta.url).href)
    const deletion = await import(new URL('../../server/utils/delete-user.ts', import.meta.url).href)
    let store
    if (apply) {
      const { r2ImageStore } = await import(new URL('../../server/utils/r2-store.ts', import.meta.url).href)
      const env = process.env
      store = r2ImageStore({ accountId: env.R2_ACCOUNT_ID, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, bucket: env.R2_BUCKET, jurisdiction: env.R2_JURISDICTION })
    }
    phase = 'running'
    const report = await deleteAccount({ db: drizzle({ client: pool, schema }), schema, userId, apply, now: new Date(), deletion, store })
    console.log(`Database ${endpoint}: ${apply ? 'APPLYING' : 'dry run (nothing is deleted)'}`)
    console.log(reportLines(report, { apply }).join('\n'))
  }
  catch (error) {
    if (error instanceof Stopped) {
      fail(error.message)
    }
    else {
      // Never the message: a driver's can carry the host or the URL.
      const name = typeof error?.name === 'string' && /^\w+$/.test(error.name) ? error.name : 'Error'
      fail(`could not run the deletion (${phase === 'running' ? '' : `${phase}, `}${name}); nothing was committed.`)
    }
  }
  finally {
    await pool.end().catch(() => {})
  }
}
