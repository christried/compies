import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { users } from '../../db/schema'
import type { SavedTourSeen } from '../../../shared/auth'
import { useDb } from '../../utils/db'
import { requireUser } from '../../utils/user'

// The Profil row „Rundgang wiederholen“ (#646, GLOSSARY: Tour): sets the User's own Tour number back to 0, so the Tour
// shows again. The body is ignored. Not an Event change, so no room message (ADR 0013).
export default defineEventHandler(async (event): Promise<SavedTourSeen> => {
  const { id } = await requireUser(event)

  await useDb(event).update(users).set({ tourSeen: 0 }).where(eq(users.id, id))
  return { tourSeen: 0 }
})
