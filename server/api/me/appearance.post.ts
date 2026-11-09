import { eq } from 'drizzle-orm'
import { defineEventHandler, readBody } from 'h3'
import { users } from '../../db/schema'
import { asRecord } from '../../../shared/record'
import { isAppearance, type SavedAppearance } from '../../../shared/auth'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { requireUser } from '../../utils/user'

// The User's Appearance (#401, GLOSSARY): stored with the User, so every device they sign in on agrees. Not an Event
// change, so no room message (ADR 0013).
export default defineEventHandler(async (event): Promise<SavedAppearance> => {
  const { id } = await requireUser(event)
  const appearance = asRecord(await readBody(event)).appearance
  if (!isAppearance(appearance)) throw apiError('invalid_value')

  await useDb(event).update(users).set({ appearance }).where(eq(users.id, id))
  return { appearance }
})
