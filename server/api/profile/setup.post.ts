import { createError, defineEventHandler, readBody } from 'h3'
import { users } from '../../db/schema'
import { useDb } from '../../utils/db'
import { authUserOf, requireUser, signInRequired, userRowColumns } from '../../utils/user'
import { liveUser } from '../../utils/live-user'
import { parseDisplayName, type SavedProfile } from '../../../shared/auth'

// The Display name, at profile setup (screen 03) and on the Profil page (#399). Better Auth never writes this column (ADR 0004).
export default defineEventHandler(async (event): Promise<SavedProfile> => {
  const { id } = await requireUser(event)
  const body = await readBody<{ displayName?: unknown } | null>(event)
  const displayName = parseDisplayName(body?.displayName)
  if (!displayName) throw createError({ statusCode: 400, statusMessage: 'Display name must be 1–32 characters' })

  // The update returns the row `requireUser` read, unless the User was deleted since: then it changes no row and the answer is 401 (#991).
  const [row] = await useDb(event).update(users).set({ displayName }).where(liveUser(id)).returning(userRowColumns)
  if (!row) throw signInRequired()
  return { user: authUserOf(row) }
})
