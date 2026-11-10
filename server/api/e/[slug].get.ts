import { defineEventHandler, getRouterParam } from 'h3'
import { useClock } from '../../utils/clock'
import { useDb } from '../../utils/db'
import { loadEvent } from '../../utils/event-access'
import { boardSection, inviteSection, membersSection, poolGamesOf, poolsSection, pollSection, readPollRows, sessionSection, startSection } from '../../utils/event-read'
import { readEventState, withParts } from '../../utils/event-state'
import { hostGameIds, readHostGameFacts } from '../../utils/library'
import { READ_PARTS, stageParts, stageSections, type StageFields } from '../../utils/stage-read'
import { settleBeforeRead } from '../../utils/rounds'
import { requireUser } from '../../utils/user'
import type { EventView } from '../../../shared/event'

// The Event link (ADR 0006): only Members can open it. A non-Member and an unknown slug get the
// same 404, so nobody can probe which Events exist. A former Member of a deleted Event gets
// 410 "Event deleted" instead (#10).
// The poll UI refetches this every 15 s (ADR 0001). The answer is composed from the section builders of
// server/utils/event-read.ts and from the stage sections of server/utils/stage-read.ts, which run together too (#256): a new stage
// piece is one entry in `stageSections`. Their facts are the Event state's (server/utils/event-state.ts, #416): read once, in parts, in two steps. The
// first reads, at the same time, the parts every viewer needs, the poll's rows and the pool's games; the second reads, through `withParts`, only the
// parts this viewer's sections need (`stageParts`): a Member who does not see the wheel reads nothing more. No part is read twice.
// A draw whose stop has passed is settled first (#229, ADR 0013: no timer runs, the first read or write after an instant settles
// it): a cheap select finds it, and only then a locked transaction sets its game. A read with nothing due takes no lock.
export default defineEventHandler(async (event): Promise<EventView> => {
  const user = await requireUser(event)
  const db = useDb(event)
  const now = useClock(event).now()
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id)
  const viewer = { id: user.id, isHost: eventRow.hostId === user.id }
  await settleBeforeRead(db, eventRow, now)

  const [read, polls, pool] = await Promise.all([readEventState(db, eventRow, now, READ_PARTS), readPollRows(db, eventRow), poolGamesOf(db, eventRow, viewer)])
  const state = await withParts(db, read, stageParts(read, viewer))
  const fixed = {
    event: {
      slug: eventRow.slug,
      name: eventRow.name,
      phase: eventRow.phase,
      isHost: viewer.isHost,
    },
    ...poolsSection(state, viewer, pool),
    ...sessionSection(state, polls),
    ...inviteSection(event, eventRow, viewer),
    viewerId: user.id,
    ...pollSection(state, polls, viewer, now),
    ...membersSection(state),
    ...boardSection(state),
    ...startSection(state, viewer),
  }
  // The stage sections run together (#256). `StageFields` is derived from what they return, so `{ ...fixed, ...stage }` fails to compile when
  // a field of the view is in neither part (review 0.8 Q7); the integration test "the stage sections of the Event read" (rounds.test.ts) is the runtime backstop.
  const stage: StageFields = Object.assign({}, ...await Promise.all(stageSections.map(section => section({ db, eventRow, state, viewer, now }))))
  // The Host's game dialog (#443): the Tags and Notes of the games the finished sections name as tiles, never from a second look at the database.
  const view = { ...fixed, ...stage }
  return { ...view, hostGames: viewer.isHost ? await readHostGameFacts(db, hostGameIds(view)) : null }
})
