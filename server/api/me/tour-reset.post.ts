import { defineEventHandler } from 'h3'
import { users } from '../../db/schema'
import type { SavedTourSeen } from '../../../shared/auth'
import { useDb } from '../../utils/db'
import { requireUser, signInRequired } from '../../utils/user'
import { liveUser } from '../../utils/live-user'

// The Profil row „Rundgang wiederholen“ (#646, GLOSSARY: Tour): sets the User's own Tour number back to 0, so the Tour
// shows again. The body is ignored. Not an Event change, so no room message (ADR 0013).
export default defineEventHandler(async (event): Promise<SavedTourSeen> => {
  const { id } = await requireUser(event)

  // A User deleted since `requireUser` read them changes no row (#991).
  const saved = await useDb(event).update(users).set({ tourSeen: 0 }).where(liveUser(id)).returning({ id: users.id })
  if (saved.length === 0) throw signInRequired()
  return { tourSeen: 0 }
})
