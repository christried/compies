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
