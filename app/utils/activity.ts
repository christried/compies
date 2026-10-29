import { ACTIVITY_TYPES, type ActivityEntry } from '~~/shared/activity'
import { isRecord } from '~~/shared/record'
import { formatSlotWhen } from './berlin-time'
import { teamName } from './board'
import type { Translate } from './settings-summary'

// The Activity feed's pure parts (#159, GLOSSARY: Activity feed): what an entry says, which group it sits in, and
// whether a message from the room is an entry at all.

/**
 * The sentence for an entry, in the voice of the existing feed copy (`activity.*` in de.json), or null for a type
 * that no ticket has given a sentence yet (the feed leaves such an entry out). A Session without a number is the
 * Event's only one, so its sentences say „der Termin“.
 */
export function activityText(entry: ActivityEntry, t: Translate): string | null {
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
    // Written by Session start and end (#164): their sentences come with that ticket.
    case 'session_started':
    case 'session_ended':
      return null
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

/** Entries from one start of a Session until the next (`number` counts the starts), or everything before the first. */
export type ActivityGroup
  = | { key: 'beforeStart', entries: ActivityEntry[] }
    | { key: `session-${number}`, number: number, entries: ActivityEntry[] }

/**
 * The entries (oldest first) in the groups the feed puts headers over (11-event-seite § SidePanel): „Vor dem Start“
 * until the first Session starts, then one group per started Session. `starts` are the ISO instants the Sessions
 * started at (none exist before #164). A group without entries is left out.
 */
export function groupActivity(entries: ActivityEntry[], starts: string[]): ActivityGroup[] {
  const startTimes = starts.map(start => Date.parse(start)).sort((a, b) => a - b)
  const groups = new Map<number, ActivityEntry[]>()
  for (const entry of entries) {
    const at = Date.parse(entry.at)
    const index = startTimes.filter(start => start <= at).length
    groups.set(index, [...(groups.get(index) ?? []), entry])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, grouped]): ActivityGroup => index === 0
      ? { key: 'beforeStart', entries: grouped }
      : { key: `session-${index}`, number: index, entries: grouped })
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
