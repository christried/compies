import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { createApp, createRouter, eventHandler, toWebHandler, type EventHandler, type RouterMethod } from 'h3'
import * as schema from '../../server/db/schema'
import type { Db } from '../../server/utils/db'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

/** A fresh in-memory Postgres with the committed migrations applied. */
export async function createTestDb() {
  const client = new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder })
  return { db, client }
}

/**
 * A fresh in-memory Postgres with only the migrations before `tag` applied, the database as it was
 * just before that migration. The migrator reads a journal and the SQL files of the folder it is given,
 * so a temporary folder gets the committed journal cut before `tag` and copies of those SQL files. The
 * committed migrations, `tag` included, then apply with `migrateTo` on the same database.
 */
export async function createTestDbBefore(tag: string) {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  const index = journal.entries.findIndex(entry => entry.tag === tag)
  if (index < 0) throw new Error(`No migration ${tag}`)
  const earlier = journal.entries.slice(0, index)

  const folder = mkdtempSync(join(tmpdir(), 'compies-migrations-'))
  mkdirSync(join(folder, 'meta'))
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: earlier }))
  for (const entry of earlier) copyFileSync(join(migrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`))

  const client = new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: folder })
  return { db, client, folder }
}

/** Applies the committed migrations that the database has not seen yet, as a deploy does. */
export async function migrateTo(db: Awaited<ReturnType<typeof createTestDb>>['db']) {
  await migrate(db, { migrationsFolder })
}

/**
 * The same database, but the first statement matching `pattern` waits for `competitor` (at most
 * `waitMs`) before it runs. This puts a competing request between a handler's read and its write,
 * the window a real race needs. PGlite runs one transaction at a time, so a competitor that needs the
 * database while the handler holds a transaction waits; the wait then times out and the handler goes
 * first, the order a Postgres row lock would give.
 */
export function createInterleavingDb(client: PGlite, pattern: RegExp, competitor: () => Promise<unknown>, waitMs = 250): Db {
  let armed = true
  const beforeStatement = async (statement: string) => {
    if (!armed || !pattern.test(statement)) return
    armed = false
    await Promise.race([competitor(), new Promise(resolve => setTimeout(resolve, waitMs))])
  }
  const wrap = <T extends object>(target: T): T => new Proxy(target, {
    get(object, property) {
      const value: unknown = Reflect.get(object, property, object)
      if (typeof value !== 'function') return value
      if (property === 'query') {
        return async (statement: string, ...rest: unknown[]) => {
          await beforeStatement(statement)
          return value.call(object, statement, ...rest)
        }
      }
      if (property === 'transaction') {
        return (run: (tx: object) => unknown) => value.call(object, (tx: object) => run(wrap(tx)))
      }
      return value.bind(object)
    },
  })
  return drizzle({ client: wrap(client), schema })
}

type Route = `${Uppercase<RouterMethod>} /${string}`

/**
 * Serves the given handlers the way Nitro would, with `db` in place of the per-request Neon Pool.
 * Routes are keyed like Nitro's file names, e.g. `{ 'GET /api/health': health }`.
 */
export function createTestServer(db: Db, routes: Record<Route, EventHandler>) {
  const app = createApp()
  app.use(eventHandler((event) => {
    event.context.db = db
  }))
  const router = createRouter()
  for (const [route, handler] of Object.entries(routes)) {
    const [method, path] = route.split(' ') as [string, string]
    router.add(path, handler, method.toLowerCase() as RouterMethod)
  }
  app.use(router)
  const handle = toWebHandler(app)
  return (path: string, init?: RequestInit) => handle(new Request(new URL(path, 'http://localhost'), init))
}
