import { eq } from 'drizzle-orm'
import { defineEventHandler, readBody } from 'h3'
import { users } from '../../db/schema'
import { asRecord } from '../../../shared/record'
import { compareVersions, isVersion, seenAfter } from '../../../shared/changelog'
import type { SavedNewsSeen } from '../../../shared/auth'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { CURRENT_RELEASE } from '../../utils/release'
import { requireUser } from '../../utils/user'

// „Was ist neu“ was shown and closed (#184): the User has seen this Release, on every device. Only a version
// up to the newest Release counts, and the value only ever goes up, except a value above the newest Release,
// which the next save replaces (#242).
export default defineEventHandler(async (event): Promise<SavedNewsSeen> => {
  const { id, newsSeen } = await requireUser(event)
  const version = asRecord(await readBody(event)).version
  if (!isVersion(version) || compareVersions(version, CURRENT_RELEASE) > 0) throw apiError('invalid_value')
  const next = seenAfter(newsSeen, version, CURRENT_RELEASE)
  if (next === newsSeen) return { newsSeen }

  await useDb(event).update(users).set({ newsSeen: next }).where(eq(users.id, id))
  return { newsSeen: next }
})
