import { defineEventHandler, getRouterParam } from 'h3'
import { changeEvent } from '../../../../../utils/event-access'
import { saveEventNotes } from '../../../../../utils/event-notes'
import type { EventNotesSaved } from '../../../../../../shared/event'

// Set or clear the Host's Event notes (`notes`) and the game's own Game notes (`gameNotes`, #835, spec #856) for one game, each optional, both in one transaction
// (#731, spec #717 § E). Host only, through changeEvent: a finished Event takes the Game notes alone (`allowFinished`, #857: they are the game's, in the library, so the Finish
// does not freeze them; `saveEventNotes` refuses the Event notes there with `wrong_phase`), and a Member is refused `not_host` before the body is looked at; the Host permission is not asked for. No room broadcast (#820): a Member's Event read does not change, so `saveEventNotes` names the
// Host alone, whose other tabs refresh. No Activity entry (the feed shows nothing of it).
export default defineEventHandler((event): Promise<EventNotesSaved> => changeEvent(event, { hostOnly: true, lock: 'update', allowFinished: true, broadcast: false }, change => saveEventNotes(change, getRouterParam(event, 'gameId') ?? '')))
