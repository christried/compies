import { utcToBerlin } from '../../shared/time'

// The game-day rule behind the Worker deploy guard (#157, spec #153 § Deploys). Deploying the production Worker drops
// every open socket, so it must not happen while Members are playing. Pure: the endpoint loads the Sessions and asks.
// The answer names each blocking Session by its Event's slug (retro 0.9, finding 1): the user has no other way to see
// which Event blocks a deploy on production, where agents cannot look into the database.

export interface DeployCheck {
  ok: boolean
  /** Why a deploy must wait, or null when it may go ahead. */
  reason: string | null
}

/** A Session the check looks at: its Event's slug, its number on the Event page (null for an Event's only Session), its Date and, while it runs, its start. */
export interface CheckedSession {
  event: string
  number: number | null
  startsAt: Date | null
  /** When the Running Session started (#164), null unless it is started and not ended. */
  runningSince: Date | null
}

/** The Berlin calendar day of an instant, `YYYY-MM-DD` (ADR 0003). */
const berlinDay = (instant: Date) => utcToBerlin(instant).slice(0, 10)

/** Whether the Date falls on the Berlin day of `now`. A Session without a Date falls on no day. */
const isToday = (startsAt: Date | null, now: Date) => startsAt !== null && berlinDay(startsAt) === berlinDay(now)

/**
 * How long a Running Session blocks a deploy after its start (#200). Ending a Session is a manual hold button, so a
 * Session nobody ended would block every production deploy for ever; no game night runs this long.
 */
export const RUNNING_BLOCKS_FOR_MS = 16 * 60 * 60 * 1000

/** „Session 2 of `slug`“, or „the Session of `slug`“ for an Event's only Session, as the Event page numbers them. */
const nameOf = (session: CheckedSession) => `${session.number === null ? 'the Session' : `Session ${session.number}`} of \`${session.event}\``

const listOf = (sessions: CheckedSession[]) => sessions.map(nameOf).join(', ')

/**
 * Whether a deploy may drop the sockets: not while a Session runs (#164), and not on a day with a dated Session.
 * `sessions` holds every Session (not removed) of every Event that is not deleted. A Running Session counts only while
 * it started less than RUNNING_BLOCKS_FOR_MS before `now` (#200). The reason names the Sessions that block.
 */
export function deployCheck(input: { sessions: CheckedSession[], now: Date }): DeployCheck {
  const running = input.sessions.filter(session => session.runningSince !== null && input.now.getTime() - session.runningSince.getTime() < RUNNING_BLOCKS_FOR_MS)
  if (running.length > 0) {
    const sessions = running.length === 1 ? '1 Session is' : `${running.length} Sessions are`
    return { ok: false, reason: `${sessions} running (${listOf(running)}). A deploy would drop every open socket.` }
  }
  const today = input.sessions.filter(session => isToday(session.startsAt, input.now))
  if (today.length === 0) return { ok: true, reason: null }
  const sessions = today.length === 1 ? '1 Session is' : `${today.length} Sessions are`
  return { ok: false, reason: `Today is a game day: ${sessions} dated today in Europe/Berlin (${listOf(today)}). A deploy would drop every open socket.` }
}
