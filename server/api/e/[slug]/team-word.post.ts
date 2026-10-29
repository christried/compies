import { and, eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { eventMembers } from '../../../db/schema'
import { readSeats, teamChoiceOf } from '../../../utils/board'
import { apiError } from '../../../utils/errors'
import { changeEvent } from '../../../utils/event-access'
import { eventSessions } from '../../../utils/sessions'
import type { TeamWordSet } from '../../../../shared/event'
import { asRecord } from '../../../../shared/record'
import { parseTeamWord } from '../../../../shared/team-word'

// A Player sets their own Team word (#161, spec #153 § API contracts): `{ word }`, an empty word removes it. Only a
// Player in a team has one. The Event row is locked, so a word and a move of the same Player queue up.
export default defineEventHandler((event): Promise<TeamWordSet> => changeEvent(event, { lock: 'update' }, async ({ tx, eventRow, user, body, publish }) => {
  const seat = (await readSeats(tx, eventRow.id)).find(row => row.userId === user.id)
  if (seat?.place.zone !== 'team') throw apiError('not_in_team')

  // After the first Session start (#164) the Team names are frozen, so a word changes nothing any more.
  if (teamChoiceOf(eventRow, await eventSessions(tx, eventRow.id)).started) throw apiError('teams_locked')

  const parsed = parseTeamWord(asRecord(body).word)
  if (!parsed.ok) throw apiError(parsed.error)

  await tx
    .update(eventMembers)
    .set({ teamWord: parsed.word })
    .where(and(eq(eventMembers.eventId, eventRow.id), eq(eventMembers.userId, user.id)))
  publish({ type: 'team.wordSet', team: seat.place.team, userId: user.id, word: parsed.word })
  return { team: seat.place.team, word: parsed.word }
}))
