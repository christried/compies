import { utcToBerlin } from '../../shared/time'

// The game-day rule behind the Worker deploy guard (#157, spec #153 § Deploys). Deploying the production Worker drops
// every open socket, so it must not happen while Members are playing. Pure: the endpoint loads the Dates and asks.

export interface DeployCheck {
  ok: boolean
  /** Why a deploy must wait, or null when it may go ahead. */
  reason: string | null
}

/** The Berlin calendar day of an instant, `YYYY-MM-DD` (ADR 0003). */
const berlinDay = (instant: Date) => utcToBerlin(instant).slice(0, 10)

/** How many of the Dates fall on the Berlin day of `now`. A Session without a Date counts nowhere. */
export function sessionsToday(startsAt: (Date | null)[], now: Date): number {
  const today = berlinDay(now)
  return startsAt.filter(date => date !== null && berlinDay(date) === today).length
}

/**
 * Whether a deploy may drop the sockets: not while a Session runs (#164), and not on a day with a dated Session.
 * `startsAt` holds the Dates of every Session (not removed) of every Event that is not deleted; `running` counts the
 * Running Sessions among them (started, not ended), whatever their Date was.
 */
export function deployCheck(input: { startsAt: (Date | null)[], running: number, now: Date }): DeployCheck {
  if (input.running > 0) {
    const sessions = input.running === 1 ? '1 Session is' : `${input.running} Sessions are`
    return { ok: false, reason: `${sessions} running. A deploy would drop every open socket.` }
  }
  const today = sessionsToday(input.startsAt, input.now)
  if (today === 0) return { ok: true, reason: null }
  const sessions = today === 1 ? '1 Session is' : `${today} Sessions are`
  return { ok: false, reason: `Today is a game day: ${sessions} dated today (Europe/Berlin). A deploy would drop every open socket.` }
}
