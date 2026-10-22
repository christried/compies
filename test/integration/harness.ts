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
