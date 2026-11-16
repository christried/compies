import { defineEventHandler, getRouterParam } from 'h3'
import { changeEvent } from '../../../../../utils/event-access'
import { saveEventNotes } from '../../../../../utils/event-notes'
import type { EventNotesSaved } from '../../../../../../shared/event'

// Set or clear the Host's Event notes for one game (#731, spec #717 § E). Host only, through changeEvent: a finished Event refuses it (`wrong_phase`) like every
// write, and a Member is refused `not_host` before the body is looked at. The default `event.changed` follows: it carries no text, and that a Host's note
// changed is no secret. No Activity entry (the feed shows nothing of it).
export default defineEventHandler((event): Promise<EventNotesSaved> => changeEvent(event, { hostOnly: true, lock: 'update' }, change => saveEventNotes(change, getRouterParam(event, 'gameId') ?? '')))
