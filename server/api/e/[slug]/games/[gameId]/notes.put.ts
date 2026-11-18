import { defineEventHandler, getRouterParam } from 'h3'
import { changeEvent } from '../../../../../utils/event-access'
import { saveEventNotes } from '../../../../../utils/event-notes'
import type { EventNotesSaved } from '../../../../../../shared/event'

// Set or clear the Host's Event notes for one game (#731, spec #717 § E). Host only, through changeEvent: a finished Event refuses it (`wrong_phase`) like every
// write, and a Member is refused `not_host` before the body is looked at. No room broadcast (#820): a Member's Event read does not change, so `saveEventNotes` names the
// Host alone, whose other tabs refresh. No Activity entry (the feed shows nothing of it).
export default defineEventHandler((event): Promise<EventNotesSaved> => changeEvent(event, { hostOnly: true, lock: 'update', broadcast: false }, change => saveEventNotes(change, getRouterParam(event, 'gameId') ?? '')))
