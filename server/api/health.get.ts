import { defineEventHandler, setResponseStatus } from 'h3'
import { events } from '../db/schema'
import { useDb } from '../utils/db'

// Reads a domain table, so it fails when the database is unreachable or not migrated.
export default defineEventHandler(async (event) => {
  try {
    await useDb(event).select({ id: events.id }).from(events).limit(1)
    return { status: 'ok' }
  }
  catch (error) {
    console.error('Health check failed', error)
    setResponseStatus(event, 503)
    return { status: 'error' }
  }
})
