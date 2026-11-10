import type { ShareImageSource } from '../../shared/share-image'
import type { Db } from './db'
import type { EventRow } from './event-access'
import { boardSection, membersSection, readPollRows, sessionSection, type Viewer } from './event-read'
import { readEventState } from './event-state'
import { resultsSection } from './stage-read'

/**
 * What the Share image may know of a finished Event (#313): the fields of the Event read the picture is made from, composed from the same
 * section builders the read uses, never a second query. The games come only from `resultsSection`, which applies `drawGameKnown` (#258),
 * so a game that was never played, or that this viewer may not know, is not here. The Members are the read's; the model counts the
 * Players from them and says nothing else about anyone. The facts are the Event state's (#416): the Sessions, Members, teams and Rounds.
 */
export async function shareImageSource(db: Db, eventRow: EventRow, viewer: Viewer, now: Date): Promise<ShareImageSource> {
  const [state, polls] = await Promise.all([readEventState(db, eventRow, now, ['sessions', 'members', 'teams', 'rounds']), readPollRows(db, eventRow)])
  const { results, standings } = await resultsSection({ state, viewer, now })
  return {
    event: { slug: eventRow.slug, name: eventRow.name, phase: eventRow.phase, isHost: viewer.isHost },
    sessions: sessionSection(state, polls).sessions,
    members: membersSection(state).members,
    teams: boardSection(state).teams,
    results,
    standings,
  }
}
