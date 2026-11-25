import { sql } from 'drizzle-orm'
import { defineEventHandler, readBody } from 'h3'
import { users } from '../../db/schema'
import { asRecord } from '../../../shared/record'
import type { SavedTourSeen } from '../../../shared/auth'
import { parseTourVersion } from '../../../shared/tour'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { requireUser, signInRequired } from '../../utils/user'
import { liveUser } from '../../utils/live-user'

// The Tour was shown and finished or skipped (#646, GLOSSARY: Tour): the User has seen this version, on every device. The
// number only ever goes up, in SQL, so two devices saving at once keep the larger without a lock. Not an Event change, so
// no room message (ADR 0013).
export default defineEventHandler(async (event): Promise<SavedTourSeen> => {
  const { id } = await requireUser(event)
  const version = parseTourVersion(asRecord(await readBody(event)).version)
  if (version === null) throw apiError('invalid_value')

  const [saved] = await useDb(event).update(users)
    .set({ tourSeen: sql`greatest(${users.tourSeen}, ${version})` })
    .where(liveUser(id))
    .returning({ tourSeen: users.tourSeen })
  // A User deleted since `requireUser` read them changes no row (#991).
  if (!saved) throw signInRequired()
  return { tourSeen: saved.tourSeen }
})
