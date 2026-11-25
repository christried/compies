import { defineEventHandler, readBody } from 'h3'
import { users } from '../../db/schema'
import { asRecord } from '../../../shared/record'
import { compareVersions, isVersion, seenAfter } from '../../../shared/changelog'
import type { SavedNewsSeen } from '../../../shared/auth'
import { useDb } from '../../utils/db'
import { apiError } from '../../utils/errors'
import { CURRENT_RELEASE } from '../../utils/release'
import { requireUser, signInRequired } from '../../utils/user'
import { liveUser } from '../../utils/live-user'

// „Was ist neu“ was shown and closed (#184): the User has seen this Release, on every device. Only a version
// up to the newest Release counts, and the value only ever goes up, except a value above the newest Release,
// which the next save replaces (#242).
export default defineEventHandler(async (event): Promise<SavedNewsSeen> => {
  const { id, newsSeen } = await requireUser(event)
  const version = asRecord(await readBody(event)).version
  if (!isVersion(version) || compareVersions(version, CURRENT_RELEASE) > 0) throw apiError('invalid_value')
  const next = seenAfter(newsSeen, version, CURRENT_RELEASE)
  if (next === newsSeen) return { newsSeen }

  // A User deleted since `requireUser` read them changes no row (#991).
  const saved = await useDb(event).update(users).set({ newsSeen: next }).where(liveUser(id)).returning({ id: users.id })
  if (saved.length === 0) throw signInRequired()
  return { newsSeen: next }
})
