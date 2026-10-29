import { describe, expect, it } from 'vitest'
import { activityText, groupActivity, readEntry } from '../../app/utils/activity'
import { formatActivityTime } from '../../app/utils/berlin-time'
import de from '../../i18n/locales/de.json'
import type { ActivityEntry } from '../../shared/activity'

// The Activity feed's pure parts (#159): which group an entry sits in, what an entry says, which messages count.
// `t` is the real German copy with {name} filled in, so a changed sentence shows up here.
function t(key: string, named: Record<string, unknown> = {}): string {
  const template = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], de) as string
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name]))
}

const base = { id: 'e', at: '2090-10-30T18:00:00.000Z', actor: { id: 'u1', name: 'Sanne' }, people: {} }

describe('groupActivity', () => {
  const entry = (id: string, at: string): ActivityEntry => ({ ...base, id, at, type: 'member_joined', params: {} })

  it('puts everything into „Vor dem Start“ while no Session has started', () => {
    const entries = [entry('a', '2090-10-30T18:00:00.000Z'), entry('b', '2090-10-30T19:00:00.000Z')]

    expect(groupActivity(entries, [])).toEqual([{ key: 'beforeStart', entries }])
  })

  it('has no group for no entries', () => {
    expect(groupActivity([], [])).toEqual([])
  })

  it('moves the entries from a Session start on into a group of that Session, and drops a group with no entries', () => {
    const a = entry('a', '2090-10-30T18:00:00.000Z')
    const b = entry('b', '2090-10-31T18:00:00.000Z')
    const c = entry('c', '2090-11-01T18:00:00.000Z')

    expect(groupActivity([a, b, c], ['2090-10-31T17:00:00.000Z', '2090-11-02T17:00:00.000Z'])).toEqual([
      { key: 'beforeStart', entries: [a] },
      { key: 'session-1', number: 1, entries: [b, c] },
    ])
    expect(groupActivity([b], ['2090-10-31T17:00:00.000Z'])).toEqual([{ key: 'session-1', number: 1, entries: [b] }])
  })

  it('numbers the groups by start, whatever order the starts come in', () => {
    const a = entry('a', '2090-11-03T18:00:00.000Z')

    expect(groupActivity([a], ['2090-11-02T17:00:00.000Z', '2090-10-31T17:00:00.000Z'])).toEqual([{ key: 'session-2', number: 2, entries: [a] }])
  })
})

describe('activityText', () => {
  it('names the actor and the Session number', () => {
    expect(activityText({ ...base, type: 'member_joined', params: {} }, t)).toBe('Sanne ist dem Event beigetreten')
    expect(activityText({ ...base, type: 'date_rescheduled', params: { sessionId: 's', number: 2, from: '2090-10-30T18:00:00.000Z', to: '2090-11-01T19:30:00.000Z' } }, t)).toBe('Sanne hat Session 2 auf Mi 01.11. 20:30 verschoben')
    expect(activityText({ ...base, type: 'date_reopened', params: { sessionId: 's', number: 1, previousStartsAt: '2090-10-30T18:00:00.000Z' } }, t)).toBe('Sanne hat den Termin von Session 1 zurückgenommen')
    expect(activityText({ ...base, type: 'session_added', params: { sessionId: 's', startsAt: null } }, t)).toBe('Sanne hat eine Session hinzugefügt')
    expect(activityText({ ...base, type: 'session_removed', params: { sessionId: 's', number: 3, startsAt: null } }, t)).toBe('Sanne hat Session 3 entfernt')
    expect(activityText({ ...base, type: 'game_count_changed', params: { from: 10, to: 12 } }, t)).toBe('Sanne hat die Anzahl Spiele auf 12 geändert')
    expect(activityText({ ...base, type: 'team_size_changed', params: { from: 3, to: 4 } }, t)).toBe('Sanne hat die Teamgröße auf 4 geändert')
  })

  it('says „Termin“ without a number for the only Session', () => {
    expect(activityText({ ...base, type: 'date_set', params: { sessionId: 's', number: 1, startsAt: '2090-11-01T19:30:00.000Z' } }, t)).toBe('Termin für Session 1 steht: Mi 01.11. 20:30')
    expect(activityText({ ...base, type: 'date_set', params: { sessionId: 's', number: null, startsAt: '2090-11-01T19:30:00.000Z' } }, t)).toBe('Termin steht: Mi 01.11. 20:30')
    expect(activityText({ ...base, type: 'date_rescheduled', params: { sessionId: 's', number: null, from: '2090-10-30T18:00:00.000Z', to: '2090-11-01T19:30:00.000Z' } }, t)).toBe('Sanne hat den Termin auf Mi 01.11. 20:30 verschoben')
    expect(activityText({ ...base, type: 'date_reopened', params: { sessionId: 's', number: null, previousStartsAt: '2090-10-30T18:00:00.000Z' } }, t)).toBe('Sanne hat den Termin zurückgenommen')
    expect(activityText({ ...base, type: 'session_removed', params: { sessionId: 's', number: null, startsAt: null } }, t)).toBe('Sanne hat eine Session entfernt')
  })

  it('says where a Member moved themselves, with the team named by its colour (#160)', () => {
    const own = { ...base, people: { u1: 'Sanne' } }

    expect(activityText({ ...own, type: 'member_moved', params: { userId: 'u1', from: { zone: 'bench' }, to: { zone: 'team', team: 1 } } }, t)).toBe('Sanne ist jetzt in Team Rot')
    expect(activityText({ ...own, type: 'member_moved', params: { userId: 'u1', from: { zone: 'team', team: 1 }, to: { zone: 'team', team: 4 } } }, t)).toBe('Sanne ist jetzt in Team Himmel')
    expect(activityText({ ...own, type: 'member_moved', params: { userId: 'u1', from: { zone: 'team', team: 1 }, to: { zone: 'bench' } } }, t)).toBe('Sanne ist jetzt auf der Bench')
    expect(activityText({ ...own, type: 'member_moved', params: { userId: 'u1', from: { zone: 'bench' }, to: { zone: 'stands' } } }, t)).toBe('Sanne ist jetzt auf der Tribüne')
  })

  it('says who moved a Member when the Host did (#160)', () => {
    const byHost = { ...base, actor: { id: 'h', name: 'Hostess' }, people: { u1: 'Sanne' } }

    expect(activityText({ ...byHost, type: 'member_moved', params: { userId: 'u1', from: { zone: 'bench' }, to: { zone: 'team', team: 2 } } }, t)).toBe('Hostess hat Sanne nach Team Orange verschoben')
    expect(activityText({ ...byHost, type: 'member_moved', params: { userId: 'u1', from: { zone: 'team', team: 2 }, to: { zone: 'bench' } } }, t)).toBe('Hostess hat Sanne auf die Bench verschoben')
    expect(activityText({ ...byHost, type: 'member_moved', params: { userId: 'u1', from: { zone: 'bench' }, to: { zone: 'stands' } } }, t)).toBe('Hostess hat Sanne auf die Tribüne verschoben')
  })

  it('says who reset a Team name, with the colour name of the team (the entry stores the position)', () => {
    expect(activityText({ ...base, type: 'team_name_reset', params: { team: 1 } }, t)).toBe('Sanne hat den Namen von Team Rot zurückgesetzt')
    expect(activityText({ ...base, type: 'team_name_reset', params: { team: 6 } }, t)).toBe('Sanne hat den Namen von Team Blau zurückgesetzt')
  })

  it('has no sentence yet for the types that later tickets write', () => {
    expect(activityText({ ...base, type: 'session_started', params: { sessionId: 's', number: null } }, t)).toBeNull()
  })
})

describe('readEntry', () => {
  const entry = { ...base, type: 'member_joined', params: {} }

  it('takes a complete entry and refuses anything else', () => {
    expect(readEntry(entry)).toEqual(entry)
    expect(readEntry(undefined)).toBeNull()
    expect(readEntry({ ...entry, id: 7 })).toBeNull()
    expect(readEntry({ ...entry, type: 'nobody_knows' })).toBeNull()
    expect(readEntry({ ...entry, params: 'x' })).toBeNull()
    expect(readEntry({ ...entry, at: undefined })).toBeNull()
  })
})

describe('formatActivityTime', () => {
  it('shows only the time for today and the day with the time for any other day (Berlin)', () => {
    const now = new Date('2026-10-24T20:00:00Z')

    expect(formatActivityTime(new Date('2026-10-24T18:00:00Z'), now)).toBe('20:00')
    expect(formatActivityTime(new Date('2026-10-23T18:00:00Z'), now)).toBe('Fr 23.10. 20:00')
    // 23:30 UTC on the 24th is already the 25th in Berlin.
    expect(formatActivityTime(new Date('2026-10-24T23:30:00Z'), new Date('2026-10-24T20:00:00Z'))).toBe('So 25.10. 01:30')
  })
})
