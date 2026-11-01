import { describe, expect, it } from 'vitest'
import { activityIcon, activityParts, feedSessions, groupActivity, readEntry } from '../../app/utils/activity'
import { formatActivityTime } from '../../app/utils/berlin-time'
import de from '../../i18n/locales/de.json'
import { ACTIVITY_TYPES, type ActivityEntry } from '../../shared/activity'

// The Activity feed's pure parts (#159): which group an entry sits in, what an entry says, which messages count.
// `t` is the real German copy with {name} filled in, so a changed sentence shows up here.
function t(key: string, named: Record<string, unknown> = {}): string {
  const template = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], de) as string
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name]))
}

const base = { id: 'e', at: '2090-10-30T18:00:00.000Z', actor: { id: 'u1', name: 'Sanne' }, people: {}, games: {} }

describe('groupActivity', () => {
  const entry = (id: string, at: string): ActivityEntry => ({ ...base, id, at, type: 'member_joined', params: {} })
  const ended = (id: string, at: string, sessionId: string): ActivityEntry => ({ ...base, id, at, type: 'session_ended', params: { sessionId, number: 1 } })
  const one = { id: 's1', number: 1, startedAt: '2090-10-31T17:00:00.000Z', endedAt: '2090-10-31T21:00:00.000Z' }
  const two = { id: 's2', number: 2, startedAt: '2090-11-07T17:00:00.000Z', endedAt: null }

  it('puts everything into „Vor dem Start“ while no Session has started', () => {
    const entries = [entry('a', '2090-10-30T18:00:00.000Z'), entry('b', '2090-10-30T19:00:00.000Z')]

    expect(groupActivity(entries, [], 1)).toEqual([{ key: 'beforeStart', kind: 'beforeStart', number: null, entries }])
  })

  it('has no group for no entries', () => {
    expect(groupActivity([], [], null)).toEqual([])
  })

  it('moves the entries from a Session start on into a group of that Session, and drops a group with no entries', () => {
    const a = entry('a', '2090-10-30T18:00:00.000Z')
    const b = entry('b', '2090-10-31T18:00:00.000Z')
    const c = entry('c', '2090-10-31T19:00:00.000Z')

    expect(groupActivity([a, b, c], [{ ...one, endedAt: null }], 2)).toEqual([
      { key: 'beforeStart', kind: 'beforeStart', number: null, entries: [a] },
      { key: 'session-0', kind: 'session', number: 1, entries: [b, c] },
    ])
    expect(groupActivity([b], [{ ...one, endedAt: null }], 2)).toEqual([{ key: 'session-0', kind: 'session', number: 1, entries: [b] }])
  })

  it('opens „Vor Session m“ when a Session ended, and closes it with the next start', () => {
    const during = entry('a', '2090-10-31T18:00:00.000Z')
    const between = entry('b', '2090-11-02T18:00:00.000Z')
    const next = entry('c', '2090-11-07T18:00:00.000Z')

    expect(groupActivity([during, between, next], [one, two], null)).toEqual([
      { key: 'session-0', kind: 'session', number: 1, entries: [during] },
      { key: 'gap-0', kind: 'before', number: 2, entries: [between] },
      { key: 'session-1', kind: 'session', number: 2, entries: [next] },
    ])
  })

  it('names the next Session in the gap after the last start, and „Nach Session n“ when none is left', () => {
    const after = entry('a', '2090-11-02T18:00:00.000Z')

    expect(groupActivity([after], [one], 2)).toEqual([{ key: 'gap-0', kind: 'before', number: 2, entries: [after] }])
    expect(groupActivity([after], [one], null)).toEqual([{ key: 'gap-0', kind: 'after', number: 1, entries: [after] }])
  })

  it('keeps the entry that ends a Session in that Session\'s group, although it is written after the end', () => {
    const closing = ended('a', '2090-10-31T21:00:00.500Z', 's1')

    expect(groupActivity([closing], [one], 2)).toEqual([{ key: 'session-0', kind: 'session', number: 1, entries: [closing] }])
  })

  it('has no number for the only Session of an Event', () => {
    const during = entry('a', '2090-10-31T18:00:00.000Z')
    const after = entry('b', '2090-11-02T18:00:00.000Z')

    expect(groupActivity([during, after], [{ ...one, number: null }], null)).toEqual([
      { key: 'session-0', kind: 'session', number: null, entries: [during] },
      { key: 'gap-0', kind: 'after', number: null, entries: [after] },
    ])
  })

  it('orders the groups by start, whatever order the Sessions come in', () => {
    const a = entry('a', '2090-11-08T18:00:00.000Z')

    expect(groupActivity([a], [two, one], null)).toEqual([{ key: 'session-1', kind: 'session', number: 2, entries: [a] }])
  })
})

describe('feedSessions', () => {
  const dated = (id: string, number: number, startsAt: string, startedAt: string | null = null, endedAt: string | null = null) => ({ id, number, startsAt, startedAt, endedAt })

  it('takes the started Sessions and the number of the next dated one that has not started', () => {
    const sessions = [
      dated('a', 1, '2090-10-31T19:00:00.000Z', '2090-10-31T19:30:00.000Z', '2090-10-31T22:00:00.000Z'),
      dated('b', 2, '2090-11-07T19:00:00.000Z'),
      dated('c', 3, '2090-11-14T19:00:00.000Z'),
      { id: 'd', number: null, startsAt: null, startedAt: null, endedAt: null },
    ]

    expect(feedSessions(sessions)).toEqual({
      started: [{ id: 'a', number: 1, startedAt: '2090-10-31T19:30:00.000Z', endedAt: '2090-10-31T22:00:00.000Z' }],
      nextNumber: 2,
    })
  })

  it('has no next number when every dated Session has started', () => {
    expect(feedSessions([dated('a', 1, '2090-10-31T19:00:00.000Z', '2090-10-31T19:30:00.000Z')]).nextNumber).toBeNull()
  })
})

describe('the sentence of an entry', () => {
  const text = (entry: ActivityEntry) => activityParts(entry, t)?.map(part => part.text).join('') ?? null

  it('names the actor and the Session number', () => {
    expect(text({ ...base, type: 'member_joined', params: {} })).toBe('Sanne ist dem Event beigetreten')
    expect(text({ ...base, type: 'date_rescheduled', params: { sessionId: 's', number: 2, from: '2090-10-30T18:00:00.000Z', to: '2090-11-01T19:30:00.000Z' } })).toBe('Sanne hat Session 2 auf Mi 01.11. 20:30 verschoben')
    expect(text({ ...base, type: 'date_reopened', params: { sessionId: 's', number: 1, previousStartsAt: '2090-10-30T18:00:00.000Z' } })).toBe('Sanne hat den Termin von Session 1 zurückgenommen')
    expect(text({ ...base, type: 'session_added', params: { sessionId: 's', startsAt: null } })).toBe('Sanne hat eine Session hinzugefügt')
    expect(text({ ...base, type: 'session_removed', params: { sessionId: 's', number: 3, startsAt: null } })).toBe('Sanne hat Session 3 entfernt')
    expect(text({ ...base, type: 'game_count_changed', params: { from: 10, to: 12 } })).toBe('Sanne hat die Anzahl Spiele auf 12 geändert')
    expect(text({ ...base, type: 'team_size_changed', params: { from: 3, to: 4 } })).toBe('Sanne hat die Teamgröße auf 4 geändert')
  })

  it('says „Termin“ without a number for the only Session', () => {
    expect(text({ ...base, type: 'date_set', params: { sessionId: 's', number: 1, startsAt: '2090-11-01T19:30:00.000Z' } })).toBe('Termin für Session 1 steht: Mi 01.11. 20:30')
    expect(text({ ...base, type: 'date_set', params: { sessionId: 's', number: null, startsAt: '2090-11-01T19:30:00.000Z' } })).toBe('Termin steht: Mi 01.11. 20:30')
    expect(text({ ...base, type: 'date_rescheduled', params: { sessionId: 's', number: null, from: '2090-10-30T18:00:00.000Z', to: '2090-11-01T19:30:00.000Z' } })).toBe('Sanne hat den Termin auf Mi 01.11. 20:30 verschoben')
    expect(text({ ...base, type: 'date_reopened', params: { sessionId: 's', number: null, previousStartsAt: '2090-10-30T18:00:00.000Z' } })).toBe('Sanne hat den Termin zurückgenommen')
    expect(text({ ...base, type: 'session_removed', params: { sessionId: 's', number: null, startsAt: null } })).toBe('Sanne hat eine Session entfernt')
  })

  it('says where a Member moved themselves, with the team named by its colour (#160)', () => {
    const own = { ...base, people: { u1: 'Sanne' } }

    expect(text({ ...own, type: 'member_moved', params: { userId: 'u1', from: { zone: 'bench' }, to: { zone: 'team', team: 1 } } })).toBe('Sanne ist jetzt in Team Rot')
    expect(text({ ...own, type: 'member_moved', params: { userId: 'u1', from: { zone: 'team', team: 1 }, to: { zone: 'team', team: 4 } } })).toBe('Sanne ist jetzt in Team Himmel')
    expect(text({ ...own, type: 'member_moved', params: { userId: 'u1', from: { zone: 'team', team: 1 }, to: { zone: 'bench' } } })).toBe('Sanne ist jetzt auf der Bench')
    expect(text({ ...own, type: 'member_moved', params: { userId: 'u1', from: { zone: 'bench' }, to: { zone: 'stands' } } })).toBe('Sanne ist jetzt auf der Tribüne')
  })

  it('says who moved a Member when the Host did (#160)', () => {
    const byHost = { ...base, actor: { id: 'h', name: 'Hostess' }, people: { u1: 'Sanne' } }

    expect(text({ ...byHost, type: 'member_moved', params: { userId: 'u1', from: { zone: 'bench' }, to: { zone: 'team', team: 2 } } })).toBe('Hostess hat Sanne nach Team Orange verschoben')
    expect(text({ ...byHost, type: 'member_moved', params: { userId: 'u1', from: { zone: 'team', team: 2 }, to: { zone: 'bench' } } })).toBe('Hostess hat Sanne auf die Bench verschoben')
    expect(text({ ...byHost, type: 'member_moved', params: { userId: 'u1', from: { zone: 'bench' }, to: { zone: 'stands' } } })).toBe('Hostess hat Sanne auf die Tribüne verschoben')
  })

  it('says who reset a Team name, with the colour name of the team (the entry stores the position)', () => {
    expect(text({ ...base, type: 'team_name_reset', params: { team: 1 } })).toBe('Sanne hat den Namen von Team Rot zurückgesetzt')
    expect(text({ ...base, type: 'team_name_reset', params: { team: 6 } })).toBe('Sanne hat den Namen von Team Blau zurückgesetzt')
  })

  it('says who started and who ended a Session, with its number when the Event has several', () => {
    expect(text({ ...base, type: 'session_started', params: { sessionId: 's', number: 2 } })).toBe('Sanne hat Session 2 gestartet')
    expect(text({ ...base, type: 'session_started', params: { sessionId: 's', number: null } })).toBe('Sanne hat die Session gestartet')
    expect(text({ ...base, type: 'session_ended', params: { sessionId: 's', number: 2 } })).toBe('Sanne hat Session 2 beendet')
    expect(text({ ...base, type: 'session_ended', params: { sessionId: 's', number: null } })).toBe('Sanne hat die Session beendet')
  })

  it('says who set a game and who put it back, naming the game the entry carries (#228)', () => {
    const named = { ...base, games: { g1: 'Halo' } }

    expect(text({ ...named, type: 'game_set', params: { roundId: 'r', gameId: 'g1' } })).toBe('Sanne hat Halo gesetzt')
    expect(text({ ...named, type: 'game_put_back', params: { roundId: 'r', gameId: 'g1' } })).toBe('Sanne hat Halo zurückgelegt')
  })

  it('sets the game in bold like the names', () => {
    const parts = activityParts({ ...base, games: { g1: 'Halo' }, type: 'game_set', params: { roundId: 'r', gameId: 'g1' } }, t)

    expect(parts).toEqual([{ text: 'Sanne', strong: true }, { text: ' hat ', strong: false }, { text: 'Halo', strong: true }, { text: ' gesetzt', strong: false }])
  })

  it('leaves out a sentence about a game the viewer may not name yet', () => {
    expect(text({ ...base, type: 'game_set', params: { roundId: 'r', gameId: 'g1' } })).toBeNull()
    expect(text({ ...base, type: 'game_put_back', params: { roundId: 'r', gameId: 'g1' } })).toBeNull()
  })

  it('still has no sentence for the kinds whose tickets come later', () => {
    expect(text({ ...base, type: 'game_drawn', params: { roundId: 'r', drawId: 'd', gameId: 'g1' } })).toBeNull()
    expect(text({ ...base, type: 'coin_tossed', params: { side: 'heads' } })).toBeNull()
  })

  it('draws a game set and a game put back with an icon of their own', () => {
    const set = activityIcon({ ...base, type: 'game_set', params: { roundId: 'r', gameId: 'g1' } })
    const back = activityIcon({ ...base, type: 'game_put_back', params: { roundId: 'r', gameId: 'g1' } })

    expect(set.icon).not.toBe(back.icon)
    expect(set.tone).toBe('surface')
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

  it('reads an entry without the names of games as one that names none', () => {
    const { games: _games, ...without } = entry

    expect(readEntry(without)).toEqual({ ...without, games: {} })
  })
})

describe('activityParts', () => {
  it('sets the actor, the person and the team in bold, and the pieces read as one sentence', () => {
    const moved: ActivityEntry = { ...base, actor: { id: 'u2', name: 'Hostess' }, people: { u1: 'Sanne' }, type: 'member_moved', params: { userId: 'u1', from: { zone: 'bench' }, to: { zone: 'team', team: 2 } } }

    expect(activityParts(moved, t)).toEqual([
      { text: 'Hostess', strong: true },
      { text: ' hat ', strong: false },
      { text: 'Sanne', strong: true },
      { text: ' nach ', strong: false },
      { text: 'Team Orange', strong: true },
      { text: ' verschoben', strong: false },
    ])
    expect(activityParts(moved, t)!.map(part => part.text).join('')).toBe('Hostess hat Sanne nach Team Orange verschoben')
  })

  it('sets the Date of a Session in bold and keeps a sentence without a name whole', () => {
    const set: ActivityEntry = { ...base, actor: null, type: 'date_set', params: { sessionId: 's', number: 1, startsAt: '2090-11-01T19:30:00.000Z' } }

    expect(activityParts(set, t)).toEqual([
      { text: 'Termin für Session 1 steht: ', strong: false },
      { text: 'Mi 01.11. 20:30', strong: true },
    ])
  })
})

describe('activityIcon', () => {
  it('gives every entry type an icon, the date set the success tone and a start the primary', () => {
    const types = ACTIVITY_TYPES.map(type => ({ ...base, type, params: type === 'member_moved' ? { userId: 'u1', from: { zone: 'bench' }, to: { zone: 'stands' } } : {} }) as unknown as ActivityEntry)

    for (const entry of types) expect(activityIcon(entry).icon, entry.type).toBeDefined()
    expect(activityIcon(types.find(entry => entry.type === 'date_set')!).tone).toBe('success')
    expect(activityIcon(types.find(entry => entry.type === 'session_started')!).tone).toBe('primary')
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
