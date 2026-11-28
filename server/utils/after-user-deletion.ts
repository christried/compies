import type { H3Event } from 'h3'
import { removeImages, type UserDeletion } from './delete-user'
import { afterCommit } from './event-access'
import { useImageStore } from './image-store'

/**
 * Everything that follows the commit of `deleteUser` (#681, #917; shared by the User's own route, `server/api/me.delete.ts`, and the Platform admin's, #941), so the two
 * cannot drift: the objects of the store, then the rooms. It is a file of its own because `delete-user.ts` imports no `h3`. Nothing here fails the answer: the deletion is committed. The session cookie is the own route's.
 */
export async function afterUserDeletion(event: H3Event, userId: string, deletion: UserDeletion): Promise<void> {
  // A deployment without R2 configuration has no store to ask, and a User with no picture needs none.
  if (deletion.imageKeys.length > 0) {
    try {
      await removeImages(useImageStore(event), deletion.imageKeys)
    }
    catch (failure) {
      console.error('Image cleanup failed', deletion.imageKeys, failure)
    }
  }

  // Everyone in the room learns the Event changed and which Messages lost their text; the Deleted User's own sockets get `event.changed` last and are closed,
  // in a finished Event too (ADR 0013, amendment of 2026-11-20). Their page refetches, reads 401 (the session is gone) and goes to the sign-in page.
  for (const { eventId, deletedMessageIds } of deletion.events) {
    afterCommit(event, { id: eventId }, deletedMessageIds.map(id => ({ type: 'chat.deleted', id, deletedBy: 'writer' })), [], true, [{ users: [userId], messages: [{ type: 'event.changed' }] }])
  }

  // The Events the User hosted are gone: each room learns it, with no `event.changed` (the read would answer 404). The Host's own sockets hear it too; the Members'
  // are not closed from here (no Member list in the room, ADR 0013): the page closes its own socket (#917).
  for (const eventId of deletion.goneEvents) afterCommit(event, { id: eventId }, [{ type: 'event.gone' }], [], false)
}
