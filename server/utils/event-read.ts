import { asc, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { pollSlots, pollVotes } from '../db/schema'
import { canSeePoolGames, poolFactsOf } from '../domain/pool-preview'
import { isPast, pollStanding } from '../domain/poll'
import { missingDates, numberedSessions, openPoll } from '../domain/session'
import { shownName } from '../../shared/auth'
import { placeOf } from '../../shared/board'
import { runningOf } from '../../shared/session-state'
import type { EventView, SessionNote, SessionView } from '../../shared/event'
import type { PoolGame, PoolGameFace } from '../../shared/game'
import type { VoteRow } from '../../shared/poll'
import { floorsAt, settingsFromRow } from '../../shared/settings'
import type { Db } from './db'
import type { EventRow } from './event-access'
import { floorsOf, startOf, teamChoiceOf, teamNamesOf, type EventState } from './event-state'
import { inviteUrl } from './links'
import { eventPool } from './pools'
import { removedSessionNotices } from './sessions'

// The Event read (`GET /api/e/:slug`) as section builders (#183). Each builder returns its slice of EventView and the
// handler composes them. The facts the rules run on come from the Event state (event-state.ts, #416), read once in parts: the Sessions,
// the Members, the stored Team names, the Rounds with their draws and Places (one statement: a draw is never read without its Round, and a Round is
// never read as open while its Result is already in, #274, Spec N6, #288), the Coin flip and, for the viewers who need them, the Vetoes, Bonus Vetoes
// and the Game pool. What is no rule fact (the poll's Slots and Votes, the removed Sessions) is read next to it by readPollRows, and the pools need
// nothing from the state, so the handler reads all three at the same time. The board (#160) is one such builder.
// The stage (the rounds, the Results, the Lucky Wheel, the clip, the Countdown, the Coin flip, the Bonus Vetoes) is not here: its sections live in
// stage-read.ts (#256, #274), and the handler runs them after these.

/** Who reads the Event. */
export interface Viewer {
  id: string
  isHost: boolean
}

/** What the Event read holds besides the state: the poll's Slots and Votes and the removed Sessions' notices, read at the same time as the state. */
export interface PollRows {
  removedSessions: { id: string, previousStartsAt: Date }[]
  /** Every Slot of the Event, in Date order, also the ones a Session took. */
  slots: { id: string, startsAt: Date }[]
  votes: VoteRow[]
}

export async function readPollRows(db: Db, eventRow: EventRow): Promise<PollRows> {
  const [removedSessions, slots, votes] = await Promise.all([
    removedSessionNotices(db, eventRow.id),
    db
      .select({ id: pollSlots.id, startsAt: pollSlots.startsAt })
      .from(pollSlots)
      .where(eq(pollSlots.eventId, eventRow.id))
      .orderBy(asc(pollSlots.startsAt)),
    db
      .select({ slotId: pollVotes.slotId, userId: pollVotes.userId, value: pollVotes.value, note: pollVotes.note })
      .from(pollVotes)
      .innerJoin(pollSlots, eq(pollVotes.slotId, pollSlots.id))
      .where(eq(pollSlots.eventId, eventRow.id)),
  ])
  return { removedSessions, slots, votes }
}

/**
 * The poll (#52): the open Slots only, a Slot that became a Session's Date is gone from it, with its Votes. The Best
 * slot and how many Members have voted on every votable Slot count open future Slots.
 */
export function pollSection(state: EventState<'sessions' | 'members'>, polls: PollRows, viewer: Viewer, now: Date): Pick<EventView, 'slots' | 'votes' | 'bestSlotId' | 'progress'> {
  const { slots, votes } = openPoll(polls.slots, state.sessions.map(row => row.slotId), polls.votes)
  const standing = pollStanding({ slots, votes, memberIds: state.members.map(row => row.id), viewerId: viewer.id, now })
  return {
    slots: slots.map(slot => ({
      id: slot.id,
      startsAt: slot.startsAt.toISOString(),
      past: isPast(slot.startsAt, now),
    })),
    votes,
    bestSlotId: standing.bestSlot?.id ?? null,
    progress: standing.progress,
  }
}

export function sessionSection(state: EventState<'sessions'>, polls: PollRows): Pick<EventView, 'sessions' | 'removedSessions' | 'missingDates' | 'runningSessionId'> {
  return {
    // Sessions with a Date come first in Date order, with the number they are shown with (#49, #70); the
    // Sessions still waiting for a Date follow and only count as missing Dates.
    sessions: numberedSessions(state.sessions).map(row => sessionView(row, polls.votes)),
    // Removed Sessions that had a Date, only for their notice (#65); they count nowhere else.
    removedSessions: polls.removedSessions.map(row => ({ id: row.id, previousStartsAt: row.previousStartsAt.toISOString() })),
    missingDates: missingDates(state.sessions.map(row => row.startsAt)),
    // The Running Session (#164): started and not ended. At most one exists (a unique index).
    runningSessionId: runningOf(state.sessions)?.id ?? null,
  }
}

export function membersSection(state: EventState<'members'>): Pick<EventView, 'members'> {
  return {
    members: state.members.map(row => ({
      id: row.id,
      name: shownName(row),
      image: row.image,
      isHost: row.id === state.eventRow.hostId,
      zone: placeOf(row).zone, // a stored legacy `bench` seat is sent as the Stands (#437)
      team: row.team,
      teamWord: row.teamWord,
    })),
  }
}

/**
 * The Game board (#160): the teams the settings call for, with their Team names (#161, teamNamesOf), and whether Players may move
 * into and out of them now (teamChoiceOf).
 */
export function boardSection(state: EventState<'sessions' | 'members' | 'teams'>): Pick<EventView, 'teams' | 'teamChoiceOpen'> {
  return { teams: teamNamesOf(state), teamChoiceOpen: teamChoiceOf(state).open }
}

/**
 * The start rule for the Host (#164): the next Session, its shown number and why it cannot start now. Every other
 * Member gets null, as for the Invite link, so only the Host's page offers the start.
 */
export function startSection(state: EventState<'sessions' | 'members'>, viewer: Viewer): Pick<EventView, 'start'> {
  if (!viewer.isHost) return { start: null }
  const { next, rejection } = startOf(state)
  return { start: { sessionId: next?.id ?? null, number: next?.number ?? null, rejection } }
}

/**
 * The games of the Game pool the viewer may see, or null (the pool's rows; the ids the rules count from are the state's `pool` part). Nothing about the
 * pools is selected for a viewer who may not see them (#222).
 */
export function poolGamesOf(db: Db, eventRow: EventRow, viewer: Viewer): Promise<(PoolGame | PoolGameFace)[] | null> {
  return canSeePoolGames(poolFactsOf({ isHost: viewer.isHost, settings: settingsFromRow(eventRow) })) ? eventPool(db, eventRow.id, viewer.isHost) : Promise.resolve(null)
}

/** The Event's settings and the Host's floors (#147): what the pools section adds to the pool's games. The Members, Rounds and Vetoes the floors need are the state's. */
export function poolsSection(state: EventState<'members' | 'rounds' | 'vetoes'>, viewer: Viewer, pool: (PoolGame | PoolGameFace)[] | null): Pick<EventView, 'settings' | 'settingsFloors' | 'pool'> {
  return {
    settings: state.settings,
    // The floors at the saved team count; an Event that is not set up counts all teams (#197).
    settingsFloors: viewer.isHost ? floorsAt(floorsOf(state), state.settings?.teamCount) : null,
    // The Host sees the games of the Game pool; every other Member only while the Pool preview is on, else null: nothing
    // about the pools, not even how many (#146, #148, #222, #225). Then NO other field of this response may carry a pool
    // game (name, id, image key, video id, notes): the Members, Sessions and Votes in the other sections must stay free
    // of them. The one exception is a game a Round has set (roundsSection in stage-read.ts): it is every Member's from the moment it is set,
    // its notes the Host's alone. The tests hidden-wheel.test.ts and pool-preview.test.ts read the raw response to keep it so.
    pool,
  }
}

/** The Invite link is for the Host to share (#16). Members never get it, so they cannot pass it on. */
export function inviteSection(event: H3Event, eventRow: EventRow, viewer: Viewer): Pick<EventView, 'inviteUrl'> {
  return { inviteUrl: viewer.isHost ? inviteUrl(event, eventRow.slug, eventRow.inviteToken) : null }
}

/**
 * A Session as the Event page gets it (#14, #70): a dated one with its Date and the number it is shown with, an
 * undated one with the Date a Reopen withdrew while that notice is due.
 */
function sessionView(
  session: { id: string, number: number | null, startsAt: Date | null, previousStartsAt: Date | null, slotId: string | null, startedAt: Date | null, endedAt: Date | null },
  votes: VoteRow[],
): SessionView {
  return session.startsAt === null
    ? { id: session.id, number: null, startsAt: null, previousStartsAt: session.previousStartsAt?.toISOString() ?? null, startedAt: null, endedAt: null }
    : {
        id: session.id,
        number: session.number,
        startsAt: session.startsAt.toISOString(),
        previousStartsAt: null,
        notes: notesOn(session.slotId, votes),
        startedAt: session.startedAt?.toISOString() ?? null,
        endedAt: session.endedAt?.toISOString() ?? null,
      }
}

/** The Notes on a Slot (#102), for the Session whose Date came from it. */
function notesOn(slotId: string | null, votes: VoteRow[]): SessionNote[] {
  return votes.flatMap(vote => vote.slotId === slotId && vote.note !== null ? [{ userId: vote.userId, value: vote.value, note: vote.note }] : [])
}
