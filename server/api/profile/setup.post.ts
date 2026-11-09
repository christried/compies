import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readBody } from 'h3'
import { users } from '../../db/schema'
import { useDb } from '../../utils/db'
import { requireUser, userColumns } from '../../utils/user'
import { parseDisplayName, type SavedProfile } from '../../../shared/auth'

// The Display name, at profile setup (screen 03) and on the Profil page (#399). Better Auth never writes this column (ADR 0004).
export default defineEventHandler(async (event): Promise<SavedProfile> => {
  const { id } = await requireUser(event)
  const body = await readBody<{ displayName?: unknown } | null>(event)
  const displayName = parseDisplayName(body?.displayName)
  if (!displayName) throw createError({ statusCode: 400, statusMessage: 'Display name must be 1–32 characters' })

  // requireUser has just read this row, so the update returns it.
  const [user] = await useDb(event).update(users).set({ displayName }).where(eq(users.id, id)).returning(userColumns)
  return { user: user! }
})
