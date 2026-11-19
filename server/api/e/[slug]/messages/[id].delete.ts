import { defineEventHandler, getRouterParam } from 'h3'
import { changeEvent } from '../../../../utils/event-access'
import { deleteMessage } from '../../../../utils/chat'
import type { Message } from '../../../../../shared/chat'

// Deletes a Message (#760, spec #719 § A): the Host any, a Member their own; the text is erased from the row and the room hears `chat.deleted`.
// It still runs after the Finish (the fourth write a finished Event takes, with rotate, the ceremony and the Event's own delete). `broadcast: false`, so only
// `chat.deleted` leaves and no `event.changed` (nothing in the Event read changes, ADR 0013). No `hostOnly`: a Member deletes their own.
export default defineEventHandler((event): Promise<Message> => changeEvent(event, { lock: 'share', allowFinished: true, broadcast: false }, change => deleteMessage(change, getRouterParam(event, 'id'))))
