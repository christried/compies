import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type { H3Event } from 'h3'
import * as schema from '../db/schema'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

declare module 'h3' {
  interface H3EventContext {
    db?: Db
    dbPool?: Pool
  }
}

/**
 * The database for this request. A Neon Pool must not outlive its request (ADR 0005), so each
 * request gets its own, created on first use and ended by the `db` Nitro plugin. Tests set
 * `event.context.db` beforehand to run handlers against PGlite.
 */
export function useDb(event: H3Event): Db {
  if (!event.context.db) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    event.context.dbPool = pool
    event.context.db = drizzle({ client: pool, schema })
  }
  return event.context.db
}
