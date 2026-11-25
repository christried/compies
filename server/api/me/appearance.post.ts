import { defineEventHandler, readBody } from 'h3'
import { users } from '../../db/schema'
import { asRecord } from '../../../shared/record'
import { isAppearance } from '../../../shared/appearance'
import type { SavedAppearance } from '../../../shared/auth'
import { useDb } from '../../utils/db'
import { writeAppearanceCookie } from '../../utils/appearance-cookie'
import { apiError } from '../../utils/errors'
import { requireUser, signInRequired } from '../../utils/user'
import { liveUser } from '../../utils/live-user'

// The User's Appearance (#401, GLOSSARY): stored with the User, so every device they sign in on agrees. After the save it
// also sets this device's cookie for the signed-out pages, or removes it for Hell (#403). Not an Event change, so no room
// message (ADR 0013).
export default defineEventHandler(async (event): Promise<SavedAppearance> => {
  const { id } = await requireUser(event)
  const appearance = asRecord(await readBody(event)).appearance
  if (!isAppearance(appearance)) throw apiError('invalid_value')

  // A User deleted since `requireUser` read them changes no row (#991).
  const saved = await useDb(event).update(users).set({ appearance }).where(liveUser(id)).returning({ id: users.id })
  if (saved.length === 0) throw signInRequired()
  await writeAppearanceCookie(event, appearance)
  return { appearance }
})
