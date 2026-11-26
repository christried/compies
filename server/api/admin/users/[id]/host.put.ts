import { eq } from 'drizzle-orm'
import { defineEventHandler, readBody } from 'h3'
import { users } from '../../../../db/schema'
import { adminUserIdParam, requirePlatformAdmin } from '../../../../utils/admin'
import { useDb } from '../../../../utils/db'
import { apiError, apiNotFound } from '../../../../utils/errors'
import { liveUser } from '../../../../utils/live-user'
import { asRecord } from '../../../../../shared/record'
import type { SavedHostPermission } from '../../../../../shared/admin'

// The Host switch of the Admin page (#682, spec #938, ADR 0002 as amended on 2026-11-20): sets the Host permission of one User by id. Permission checks read the
// database on every request, so the User creates an Event and sees the library at the next request, without signing in again. Their Events stay theirs, running
// ones included. An unknown id, text that is no id and a Deleted User answer like a missing route; a Platform admin always hosts, so taking it from one is refused
// with `platform_admin_hosts` (the page locks the switch, the server holds the rule without the page). The value the User has already succeeds and writes nothing.
// Nothing is published: the User sees the change at their next load (ADR 0013). The log line holds the action and the two User ids, never a name.
export default defineEventHandler(async (event): Promise<SavedHostPermission> => {
  const admin = await requirePlatformAdmin(event)
  const id = adminUserIdParam(event)
  const canHost = asRecord(await readBody(event)).canHost
  if (typeof canHost !== 'boolean') throw apiError('invalid_value')

  // The row is read and written under one lock, so a sign-in that sets the admin mark meanwhile (it also sets the Host permission) is waited for.
  await useDb(event).transaction(async (tx) => {
    const [row] = await tx.select({ canHost: users.canHost, isAdmin: users.isAdmin }).from(users).where(liveUser(id)).for('update')
    if (!row) throw apiNotFound()
    if (!canHost && row.isAdmin) throw apiError('platform_admin_hosts')
    if (row.canHost !== canHost) await tx.update(users).set({ canHost }).where(eq(users.id, id))
  })
  console.info(`admin.host.${canHost ? 'grant' : 'take'}`, admin.id, id)
  return { canHost }
})
