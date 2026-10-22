import { defineEventHandler, setResponseStatus } from 'h3'
import { sessions } from '../db/schema'
import { useDb } from '../utils/db'

// Reads a domain table, so it fails when the database is unreachable or not migrated.
export default defineEventHandler(async (event) => {
  try {
    await useDb(event).select({ id: sessions.id }).from(sessions).limit(1)
    return { status: 'ok' }
  }
  catch (error) {
    console.error('Health check failed', error)
    setResponseStatus(event, 503)
    return { status: 'error' }
  }
})
