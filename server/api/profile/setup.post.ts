import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readBody } from 'h3'
import { users } from '../../db/schema'
import { parseDisplayName } from '../../domain/profile'
import { useDb } from '../../utils/db'
import { requireUser, userColumns } from '../../utils/user'

// Profile setup (screen 03): the Display name. Better Auth never writes this column (ADR 0004).
export default defineEventHandler(async (event) => {
  const { id } = await requireUser(event)
  const body = await readBody<{ displayName?: unknown } | null>(event)
  const displayName = parseDisplayName(body?.displayName)
  if (!displayName) throw createError({ statusCode: 400, statusMessage: 'Display name must be 1–32 characters' })

  const [user] = await useDb(event).update(users).set({ displayName }).where(eq(users.id, id)).returning(userColumns)
  return { user }
})
