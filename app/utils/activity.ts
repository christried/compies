import { Armchair, CalendarCheck, CalendarClock, CalendarMinus, CalendarPlus, CalendarX, Eye, Flag, Play, RotateCcw, SlidersHorizontal, UserPlus, Users } from '@lucide/vue'
import type { Component } from 'vue'
import { ACTIVITY_TYPES, type ActivityEntry } from '~~/shared/activity'
import { nextSession } from '~~/shared/board'
import { isRecord } from '~~/shared/record'
import { formatSlotWhen } from './berlin-time'
import { teamName } from './board'
import type { Translate } from './settings-summary'

// The Activity feed's pure parts (#159, GLOSSARY: Activity feed): what an entry says, which group it sits in, and
// whether a message from the room is an entry at all.

// The names, teams and Dates of a sentence are set in bold (DS Communication § ActivityFeed). The sentence is built once, with
// markers around those values, so no sentence is written twice.
const OPEN = '\u0001'
const CLOSE = '\u0002'
const STRONG = new Set(['name', 'actor', 'team', 'date'])

/** The sentence of an entry in pieces, its names, teams and Dates marked `strong`; null for a type without a sentence. */
export function activityParts(entry: ActivityEntry, t: Translate): { text: string, strong: boolean }[] | null {
  const marked: Translate = (key, named, plural) => t(key, named && Object.fromEntries(Object.entries(named).map(([name, value]) => [name, STRONG.has(name) ? OPEN + String(value) + CLOSE : value])), plural)
  const text = sentence(entry, marked)
  if (text === null) return null
  return text.split(OPEN).flatMap((chunk, index) => {
    if (index === 0) return chunk ? [{ text: chunk, strong: false }] : []
    const [strong = '', rest = ''] = chunk.split(CLOSE)
    return [{ text: strong, strong: true }, ...(rest ? [{ text: rest, strong: false }] : [])]
  })
}

/** The icon in the disc before an entry and the disc's tone (DS Communication § ActivityFeed): the date set is the good news, the start the highlight. */
export function activityIcon(entry: ActivityEntry): { icon: Component, tone: 'primary' | 'surface' | 'success' } {
  switch (entry.type) {
    case 'member_joined': return { icon: UserPlus, tone: 'surface' }
    case 'member_moved': return { icon: entry.params.to.zone === 'team' ? Users : entry.params.to.zone === 'bench' ? Armchair : Eye, tone: 'surface' }
    case 'date_set': return { icon: CalendarCheck, tone: 'success' }
    case 'date_rescheduled': return { icon: CalendarClock, tone: 'surface' }
    case 'date_reopened': return { icon: CalendarX, tone: 'surface' }
    case 'session_added': return { icon: CalendarPlus, tone: 'surface' }
    case 'session_removed': return { icon: CalendarMinus, tone: 'surface' }
    case 'session_started': return { icon: Play, tone: 'primary' }
    case 'session_ended': return { icon: Flag, tone: 'surface' }
    case 'team_name_reset': return { icon: RotateCcw, tone: 'surface' }
    case 'game_count_changed':
    case 'team_size_changed': return { icon: SlidersHorizontal, tone: 'surface' }
  }
}

function sentence(entry: ActivityEntry, t: Translate): string | null {
  const name = entry.actor?.name ?? ''
  switch (entry.type) {
    case 'member_joined':
      return t('activity.join', { name })
    case 'date_set':
      return entry.params.number === null
        ? t('activity.date', { date: formatSlotWhen(new Date(entry.params.startsAt)) })
        : t('activity.dateSet', { n: entry.params.number, date: formatSlotWhen(new Date(entry.params.startsAt)) })
    case 'date_rescheduled': {
      const date = formatSlotWhen(new Date(entry.params.to))
      return entry.params.number === null
        ? t('activity.dateRescheduledSingle', { name, date })
        : t('activity.dateRescheduled', { name, n: entry.params.number, date })
    }
    case 'date_reopened':
      return entry.params.number === null
        ? t('activity.dateReopenedSingle', { name })
        : t('activity.dateReopened', { name, n: entry.params.number })
    case 'session_added':
      return t('activity.sessionAdded', { name })
    case 'session_removed':
      return entry.params.number === null
        ? t('activity.sessionRemovedSingle', { name })
        : t('activity.sessionRemoved', { name, n: entry.params.number })
    case 'game_count_changed':
      return t('activity.gameCount', { name, to: entry.params.to })
    case 'team_size_changed':
      return t('activity.teamSize', { name, to: entry.params.to })
    case 'member_moved':
      return movedText(entry, t)
    // The entry keeps the position, so the sentence names the colour, not a name that has changed since (#161).
    case 'team_name_reset':
      return t('activity.teamNameReset', { name, team: teamName(entry.params.team, t) })
    case 'session_started':
      return entry.params.number === null ? t('activity.sessionStartedSingle', { name }) : t('activity.sessionStarted', { name, n: entry.params.number })
    case 'session_ended':
      return entry.params.number === null ? t('activity.sessionEndedSingle', { name }) : t('activity.sessionEnded', { name, n: entry.params.number })
  }
}

/**
 * A move on the Game board (#160): a Member's own move says where they are now, a Host's move says who moved them. The
 * entry keeps the position, not a name, so a team is „Team“ and its colour: a Team name that changes later must not
 * rewrite history (#161).
 */
function movedText(entry: Extract<ActivityEntry, { type: 'member_moved' }>, t: Translate): string {
  const { userId, to } = entry.params
  const name = entry.people[userId] ?? ''
  const own = entry.actor?.id === userId
  const actor = entry.actor?.name ?? ''
  if (to.zone === 'team') {
    const team = teamName(to.team, t)
    return own ? t('activity.moveTeam', { name, team }) : t('activity.movedTeam', { actor, name, team })
  }
  const key = to.zone === 'bench' ? 'Bench' : 'Stands'
  return own ? t(`activity.move${key}`, { name }) : t(`activity.moved${key}`, { actor, name })
}

/** A Session that has started, as the feed's groups need it: its shown number (null for the only Session) and when it ran (ISO instants). */
export interface FeedSession { id: string, number: number | null, startedAt: string, endedAt: string | null }

/**
 * One stretch of the feed under a header (11-event-seite § SidePanel). `beforeStart`: until the first start. `session`:
 * from a start to its end. `before`: after an end until the next start, of Session `number`. `after`: after the last
 * Session ended with none left, of Session `number`. A `number` of null is the only Session of an Event.
 */
export interface ActivityGroup {
  key: string
  kind: 'beforeStart' | 'session' | 'before' | 'after'
  number: number | null
  entries: ActivityEntry[]
}

/**
 * The entries (oldest first) in the groups the feed puts headers over (11-event-seite § SidePanel, #164): „Vor dem
 * Start“ until the first Session starts, then „Session n“ from a start to its end, then „Vor Session m“ until the next
 * start (m is the next started Session's number, or `nextNumber`, the number of the next dated Session, after the last
 * one), or „Nach Session n“ when none is left. The entry that ends a Session belongs to that Session although it is
 * written just after the end. A group without entries is left out.
 */
export function groupActivity(entries: ActivityEntry[], sessions: FeedSession[], nextNumber: number | null): ActivityGroup[] {
  const ordered = [...sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  const segments: (Omit<ActivityGroup, 'entries'> & { from: number, to: number })[] = [
    { key: 'beforeStart', kind: 'beforeStart', number: null, from: -Infinity, to: ordered[0] ? Date.parse(ordered[0].startedAt) : Infinity },
  ]
  ordered.forEach((session, index) => {
    const end = session.endedAt === null ? Infinity : Date.parse(session.endedAt)
    segments.push({ key: `session-${index}`, kind: 'session', number: session.number, from: Date.parse(session.startedAt), to: end })
    if (end === Infinity) return
    const next = ordered[index + 1]
    const upcoming = next ? next.number : nextNumber
    segments.push({
      key: `gap-${index}`,
      kind: next || nextNumber !== null ? 'before' : 'after',
      number: next || nextNumber !== null ? upcoming : session.number,
      from: end,
      to: next ? Date.parse(next.startedAt) : Infinity,
    })
  })

  const grouped = new Map<string, ActivityEntry[]>()
  for (const entry of entries) {
    const at = Date.parse(entry.at)
    const closed = entry.type === 'session_ended' ? ordered.findIndex(session => session.id === entry.params.sessionId) : -1
    const key = closed >= 0 ? `session-${closed}` : segments.find(segment => segment.from <= at && at < segment.to)?.key
    if (key !== undefined) grouped.set(key, [...(grouped.get(key) ?? []), entry])
  }
  return segments.flatMap(({ from: _from, to: _to, ...segment }) => (grouped.has(segment.key) ? [{ ...segment, entries: grouped.get(segment.key)! }] : []))
}

/**
 * What the feed's groups need of the Event's Sessions (#164): the ones that have started, and the number of the next
 * dated Session that has not (null when there is none, or the Event has one Session). `sessions` is the Event read's.
 */
export function feedSessions(sessions: { id: string, number: number | null, startsAt: string | null, startedAt: string | null, endedAt: string | null }[]): { started: FeedSession[], nextNumber: number | null } {
  const started = sessions.flatMap(session => (session.startedAt === null ? [] : [{ id: session.id, number: session.number, startedAt: session.startedAt, endedAt: session.endedAt }]))
  return { started, nextNumber: nextSession(sessions)?.number ?? null }
}

/** An entry from the room or the feed endpoint, or null when it is not one (a malformed message is ignored). */
export function readEntry(value: unknown): ActivityEntry | null {
  if (!isRecord(value)) return null
  const { id, at, type, params, people, actor } = value
  if (typeof id !== 'string' || typeof at !== 'string' || !ACTIVITY_TYPES.some(known => known === type)) return null
  if (!isRecord(params) || !isRecord(people) || (actor !== null && !isRecord(actor))) return null
  // The server wrote this entry (shared/activity.ts); only its outer shape is checked here.
  return value as unknown as ActivityEntry
}
