import { asc, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { eventMembers, eventTeams, pollSlots, pollVotes, users } from '../db/schema'
import { poolsVisibleTo } from '../domain/pool-visibility'
import { isPast, pollStanding } from '../domain/poll'
import { missingDates, numberedSessions, openPoll } from '../domain/session'
import { shownName } from '../../shared/auth'
import { composedTeamName, placeOf, runningOf, teamWords } from '../../shared/board'
import type { EventView, SessionNote, SessionView } from '../../shared/event'
import type { VoteRow } from '../../shared/poll'
import { settingsFromRow } from '../../shared/settings'
import type { Db } from './db'
import type { EventRow } from './event-access'
import { inviteUrl } from './links'
import { startOf, teamChoiceOf } from './board'
import { eventPools } from './pools'
import { eventSessions, removedSessionNotices, type SessionRow } from './sessions'
import { settingsFloors } from './settings-floors'

// The Event read (`GET /api/e/:slug`) as section builders (#183). Each builder returns its slice of EventView and the
// handler composes them. Rows that more than one section needs are read once, together, by readEventRows; the pools
// need nothing from them, so the handler reads both at the same time. The board (#160) is one such builder.

/** Who reads the Event. */
export interface Viewer {
  id: string
  isHost: boolean
}

/** The rows of an Event that more than one section builds from, all read at the same time. */
export interface EventRows {
  /** The Sessions that are not removed. */
  sessions: SessionRow[]
  removedSessions: { id: string, previousStartsAt: Date }[]
  /** Every Slot of the Event, in Date order, also the ones a Session took. */
  slots: { id: string, startsAt: Date }[]
  votes: VoteRow[]
  /** The Members in the order they joined. */
  members: { id: string, name: string, displayName: string | null, image: string | null, zone: 'bench' | 'stands' | 'team', team: number | null, teamWord: string | null, teamJoinedAt: Date | null }[]
  /** The frozen teams (#164): none before the first Session start. A null name is the Team colour's name. */
  frozenTeams: { position: number, frozenName: string | null }[]
}

export async function readEventRows(db: Db, eventRow: EventRow): Promise<EventRows> {
  const [sessions, removedSessions, slots, votes, members, frozenTeams] = await Promise.all([
    eventSessions(db, eventRow.id),
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
    db
      .select({ id: users.id, name: users.name, displayName: users.displayName, image: users.image, zone: eventMembers.zone, team: eventMembers.team, teamWord: eventMembers.teamWord, teamJoinedAt: eventMembers.teamJoinedAt })
      .from(eventMembers)
      .innerJoin(users, eq(eventMembers.userId, users.id))
      .where(eq(eventMembers.eventId, eventRow.id))
      .orderBy(asc(eventMembers.joinedAt)),
    db
      .select({ position: eventTeams.position, frozenName: eventTeams.frozenName })
      .from(eventTeams)
      .where(eq(eventTeams.eventId, eventRow.id)),
  ])
  return { sessions, removedSessions, slots, votes, members, frozenTeams }
}

/**
 * The poll (#52): the open Slots only, a Slot that became a Session's Date is gone from it, with its Votes. The Best
 * slot and how many Members have voted on every votable Slot count open future Slots.
 */
export function pollSection(rows: EventRows, viewer: Viewer, now: Date): Pick<EventView, 'slots' | 'votes' | 'bestSlotId' | 'progress'> {
  const { slots, votes } = openPoll(rows.slots, rows.sessions.map(row => row.slotId), rows.votes)
  const standing = pollStanding({ slots, votes, memberIds: rows.members.map(row => row.id), viewerId: viewer.id, now })
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

export function sessionSection(rows: EventRows): Pick<EventView, 'sessions' | 'removedSessions' | 'missingDates' | 'runningSessionId'> {
  return {
    // Sessions with a Date come first in Date order, with the number they are shown with (#49, #70); the
    // Sessions still waiting for a Date follow and only count as missing Dates.
    sessions: numberedSessions(rows.sessions).map(row => sessionView(row, rows.votes)),
    // Removed Sessions that had a Date, only for their notice (#65); they count nowhere else.
    removedSessions: rows.removedSessions.map(row => ({ id: row.id, previousStartsAt: row.previousStartsAt.toISOString() })),
    missingDates: missingDates(rows.sessions.map(row => row.startsAt)),
    // The Running Session (#164): started and not ended. At most one exists (a unique index).
    runningSessionId: runningOf(rows.sessions)?.id ?? null,
  }
}

export function membersSection(eventRow: EventRow, rows: EventRows): Pick<EventView, 'members'> {
  return {
    members: rows.members.map(row => ({
      id: row.id,
      name: shownName(row),
      image: row.image,
      isHost: row.id === eventRow.hostId,
      zone: row.zone,
      team: row.team,
      teamWord: row.teamWord,
    })),
  }
}

/**
 * The Game board (#160): the teams the settings call for, with their Team names (#161), and whether Players may move
 * into and out of them now. A name is composed from the words of the team's Players in the order they joined it,
 * until the first Session starts (#164): from then on it is the frozen name, null for the colour's name.
 */
export function boardSection(eventRow: EventRow, rows: EventRows): Pick<EventView, 'teams' | 'teamChoiceOpen'> {
  const { settings, open } = teamChoiceOf(eventRow, rows.sessions)
  return {
    teams: Array.from({ length: settings?.teamCount ?? 0 }, (_, index) => {
      const position = index + 1
      const seats = rows.members
        .filter(row => row.team === position)
        .map(row => ({ word: row.teamWord, joinedAt: row.teamJoinedAt?.getTime() ?? 0 }))
      const frozen = rows.frozenTeams.find(row => row.position === position)
      return { position, name: composedTeamName({ frozen: frozen?.frozenName, words: teamWords(seats) }), frozen: frozen !== undefined }
    }),
    teamChoiceOpen: open,
  }
}

/**
 * The start rule for the Host (#164): the next Session, its shown number and why it cannot start now. Every other
 * Member gets null, as for the Invite link, so only the Host's page offers the start.
 */
export function startSection(eventRow: EventRow, rows: EventRows, viewer: Viewer): Pick<EventView, 'start'> {
  if (!viewer.isHost) return { start: null }
  const { next, rejection } = startOf(eventRow, rows.sessions, rows.members.map(row => placeOf(row)))
  const number = next === null ? null : numberedSessions(rows.sessions).find(row => row.id === next.id)?.number ?? null
  return { start: { sessionId: next?.id ?? null, number, rejection } }
}

export async function poolsSection(db: Db, eventRow: EventRow, viewer: Viewer): Promise<Pick<EventView, 'settings' | 'settingsFloors' | 'pools'>> {
  const settings = settingsFromRow(eventRow)
  const [floors, pools] = await Promise.all([
    viewer.isHost ? settingsFloors(db, eventRow.id) : null,
    eventPools(db, eventRow.id, poolsVisibleTo({ isHost: viewer.isHost, settings })),
  ])
  return {
    settings,
    settingsFloors: floors,
    // The Host sees the games of both pools; every other Member only while the wheel is not hidden, else how many
    // there are (#146, #148). Under a Hidden wheel NO other field of this response may carry a pool game (name, id,
    // image key, video id): the Members, Sessions and Votes in the other sections must stay free of them. The test
    // hidden-wheel.test.ts reads the raw response to keep it so.
    pools,
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
