import { describe, expect, it } from 'vitest'
import { Armchair, Users } from '@lucide/vue'
import { activityIcon, activityParts, feedSessions, groupActivity, readEntry } from '../../app/utils/activity'
import { formatActivityTime } from '../../app/utils/berlin-time'
import de from '../../i18n/locales/de.json'
import { ACTIVITY_TYPES, type ActivityEntry } from '../../shared/activity'
import type { BoardTeam } from '../../shared/event'

// The Activity feed's pure parts (#159): which group an entry sits in, what an entry says, which messages count.
// `t` is the real German copy with {name} filled in, so a changed sentence shows up here.
function t(key: string, named: Record<string, unknown> = {}): string {
  const template = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], de) as string
  // A counted message has its forms as „singular | plural“; vue-i18n picks by the named `count` (1 is the singular).
  const forms = template.split(' | ')
  const picked = forms.length > 1 ? (named.count === 1 ? forms[0]! : forms[1]!) : template
  return picked.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name]))
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
  const text = (entry: ActivityEntry, teams?: BoardTeam[]) => activityParts(entry, t, teams)?.map(part => part.text).join('') ?? null

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

    expect(text({ ...own, type: 'member_moved', params: { userId: 'u1', from: { zone: 'stands' }, to: { zone: 'team', team: 1 } } })).toBe('Sanne ist jetzt in Team Rot')
    expect(text({ ...own, type: 'member_moved', params: { userId: 'u1', from: { zone: 'team', team: 1 }, to: { zone: 'team', team: 4 } } })).toBe('Sanne ist jetzt in Team Himmel')
    expect(text({ ...own, type: 'member_moved', params: { userId: 'u1', from: { zone: 'team', team: 1 }, to: { zone: 'stands' } } })).toBe('Sanne ist jetzt auf der Tribüne')
  })

  it('reads an entry the Bench wrote before 0.12 as the Tribüne, own move and Host\'s move (#437)', () => {
    const own = { ...base, people: { u1: 'Sanne' } }
    const byHost = { ...base, actor: { id: 'h', name: 'Hostess' }, people: { u1: 'Sanne' } }
    // Stored entries still hold { zone: 'bench' }, which the Place type no longer has: the feed is not rewritten and reads it as the Stands.
    const old = (to: unknown) => ({ userId: 'u1', from: { zone: 'team', team: 1 }, to }) as never

    expect(text({ ...own, type: 'member_moved', params: old({ zone: 'bench' }) })).toBe('Sanne ist jetzt auf der Tribüne')
    expect(text({ ...byHost, type: 'member_moved', params: old({ zone: 'bench' }) })).toBe('Hostess hat Sanne auf die Tribüne verschoben')
    expect(activityIcon({ ...own, type: 'member_moved', params: old({ zone: 'bench' }) }).icon).toBe(Armchair)
    expect(activityIcon({ ...own, type: 'member_moved', params: old({ zone: 'team', team: 2 }) }).icon).toBe(Users)
  })

  it('says who moved a Member when the Host did (#160)', () => {
    const byHost = { ...base, actor: { id: 'h', name: 'Hostess' }, people: { u1: 'Sanne' } }

    expect(text({ ...byHost, type: 'member_moved', params: { userId: 'u1', from: { zone: 'stands' }, to: { zone: 'team', team: 2 } } })).toBe('Hostess hat Sanne nach Team Orange verschoben')
    expect(text({ ...byHost, type: 'member_moved', params: { userId: 'u1', from: { zone: 'team', team: 2 }, to: { zone: 'stands' } } })).toBe('Hostess hat Sanne auf die Tribüne verschoben')
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

  it('says what the wheel drew, naming the game, with the game in bold, and nothing while the viewer may not name it yet (#229)', () => {
    const drawn = { ...base, type: 'game_drawn', params: { roundId: 'r', drawId: 'd', gameId: 'g1' } } as const

    expect(text({ ...drawn, games: { g1: 'Halo' } })).toBe('Glücksrad: Halo')
    expect(activityParts({ ...drawn, games: { g1: 'Halo' } }, t)).toEqual([{ text: 'Glücksrad: ', strong: false }, { text: 'Halo', strong: true }])
    expect(text(drawn)).toBeNull()
  })

  it('says which Parties vetoed once the Vetoes are revealed, the Teams in bold, and names no game (#231, #355)', () => {
    const revealed = (vetoes: { team: number }[]): ActivityEntry => ({ ...base, type: 'vetoes_revealed', params: { roundId: 'r', drawId: 'd', gameId: 'g1', vetoes } })

    expect(text(revealed([{ team: 1 }]))).toBe('Veto von Team Rot')
    expect(text(revealed([{ team: 1 }, { team: 2 }]))).toBe('Veto von Team Rot und Team Orange')
    expect(text(revealed([{ team: 1 }, { team: 2 }, { team: 3 }]))).toBe('Veto von Team Rot, Team Orange und Team Gelb')
    expect(activityParts(revealed([{ team: 1 }]), t)).toEqual([{ text: 'Veto von ', strong: false }, { text: 'Team Rot', strong: true, team: 1 }])
  })

  it('names a Party of a Veto by its Team name when the feed has the teams (#355)', () => {
    const entry: ActivityEntry = { ...base, type: 'vetoes_revealed', params: { roundId: 'r', drawId: 'd', gameId: 'g1', vetoes: [{ team: 2 }] } }

    expect(activityParts(entry, t, [{ position: 2, name: 'Wilde Gurken' }])?.map(part => part.text).join('')).toBe('Veto von Wilde Gurken')
  })

  it('ignores a caster a stored entry still holds: it names the Party, not the Player (#355)', () => {
    const old: ActivityEntry = { ...base, type: 'vetoes_revealed', people: { u1: 'Eins' }, params: { roundId: 'r', drawId: 'd', gameId: 'g1', vetoes: [{ team: 1, userId: 'u1' }] as never } }

    expect(text(old)).toBe('Veto von Team Rot')
    expect(text(old)).not.toContain('Eins')
  })

  it('says a coin toss with its side, Kopf or Schwanz (#235)', () => {
    expect(text({ ...base, type: 'coin_tossed', params: { side: 'heads' } })).toBe('Münzwurf: Kopf')
    expect(text({ ...base, type: 'coin_tossed', params: { side: 'tails' } })).toBe('Münzwurf: Schwanz')
  })

  it('says which Party got a Bonus Veto, by its Team, from the Host who granted it (#233)', () => {
    expect(text({ ...base, type: 'bonus_veto_granted', params: { team: 2 } })).toBe('Sanne hat Team Orange ein Bonus-Veto gegeben')
  })

  it('draws a game set, a game put back and a game drawn with an icon of their own', () => {
    const set = activityIcon({ ...base, type: 'game_set', params: { roundId: 'r', gameId: 'g1' } })
    const back = activityIcon({ ...base, type: 'game_put_back', params: { roundId: 'r', gameId: 'g1' } })
    const drawn = activityIcon({ ...base, type: 'game_drawn', params: { roundId: 'r', drawId: 'd', gameId: 'g1' } })

    expect(new Set([set.icon, back.icon, drawn.icon]).size).toBe(3)
    expect(set.tone).toBe('surface')
  })
})

describe('the sentence of a Result (#273)', () => {
  const resultOf = (first: number[], games: Record<string, string> = { g1: 'Mario Kart' }, number = 3): ActivityEntry => ({ ...base, games, type: 'result_entered', params: { roundId: 'r', number, gameId: 'g1', first } })
  const text = (entry: ActivityEntry, teams?: BoardTeam[]) => activityParts(entry, t, teams)?.map(part => part.text).join('') ?? null

  it('names the game and the winning Team by its colour, when the feed has no team names', () => {
    expect(text(resultOf([1]))).toBe('Spiel 3: Mario Kart, Team Rot gewinnt')
  })

  it('names the winning Team by its Team name when the feed has the teams', () => {
    expect(text(resultOf([2]), [{ position: 2, name: 'Wilde Gurken' }])).toBe('Spiel 3: Mario Kart, Wilde Gurken gewinnt')
  })

  it('says „gewinnen“ for two winners, and lists three with „und“', () => {
    expect(text(resultOf([1, 6]))).toBe('Spiel 3: Mario Kart, Team Rot und Team Blau gewinnen')
    expect(text(resultOf([1, 2, 6]))).toBe('Spiel 3: Mario Kart, Team Rot, Team Orange und Team Blau gewinnen')
  })

  it('reads the singular form for a Round number of 1 with one winner, and the plural with two', () => {
    expect(text(resultOf([1], { g1: 'Mario Kart' }, 1))).toBe('Spiel 1: Mario Kart, Team Rot gewinnt')
    expect(text(resultOf([1, 6], { g1: 'Mario Kart' }, 1))).toBe('Spiel 1: Mario Kart, Team Rot und Team Blau gewinnen')
  })

  it('sets the game and the winners in bold, and nothing else', () => {
    expect(activityParts(resultOf([1, 6]), t)).toEqual([
      { text: 'Spiel 3: ', strong: false },
      { text: 'Mario Kart', strong: true },
      { text: ', ', strong: false },
      { text: 'Team Rot', strong: true, team: 1 },
      { text: ' und ', strong: false },
      { text: 'Team Blau', strong: true, team: 6 },
      { text: ' gewinnen', strong: false },
    ])
  })

  it('leaves out the sentence while the viewer may not name the game', () => {
    expect(text(resultOf([1], {}))).toBeNull()
  })

  // The end of the Event (#277): one winner has a sentence, named like a Result's winner.
  const finishedOf = (winners: number[]): ActivityEntry => ({ ...base, type: 'event_finished', params: { winners } })

  it('says who won the Event, by the Team\'s colour or by its Team name', () => {
    expect(text(finishedOf([2]))).toBe('Event beendet: Team Orange gewinnt')
    expect(text(finishedOf([2]), [{ position: 2, name: 'Wilde Gurken' }])).toBe('Event beendet: Wilde Gurken gewinnt')
  })

  it('sets the winner of the Event in bold, and nothing else', () => {
    expect(activityParts(finishedOf([2]), t)).toEqual([
      { text: 'Event beendet: ', strong: false },
      { text: 'Team Orange', strong: true, team: 2 },
      { text: ' gewinnt', strong: false },
    ])
  })

  // Several winners are a Tie (#278): „Unentschieden“ and every Party on rank 1.
  it('says Unentschieden and names the Parties of a Tie, by colour or by frozen Team name', () => {
    expect(text(finishedOf([1, 2]))).toBe('Unentschieden: Team Rot und Team Orange')
    expect(text(finishedOf([1, 2]), [{ position: 1, name: 'Wilde Gurken' }, { position: 2, name: 'Team Orange' }])).toBe('Unentschieden: Wilde Gurken und Team Orange')
    expect(text(finishedOf([1, 2, 3]))).toBe('Unentschieden: Team Rot, Team Orange und Team Gelb')
  })

  it('names all eight Parties of a Tie of everybody, and a long frozen name whole', () => {
    expect(text(finishedOf([1, 2, 3, 4, 5, 6, 7, 8]))).toMatch(/^Unentschieden: Team Rot, .+ und Team .+$/)
    expect(text(finishedOf([1, 2]), [{ position: 1, name: 'Die Wilden Gurkenbande' }])).toBe('Unentschieden: Die Wilden Gurkenbande und Team Orange')
  })

  it('sets the Parties of a Tie in bold, and „Unentschieden: “ not', () => {
    expect(activityParts(finishedOf([1, 2, 3]), t)).toEqual([
      { text: 'Unentschieden: ', strong: false },
      { text: 'Team Rot', strong: true, team: 1 },
      { text: ', ', strong: false },
      { text: 'Team Orange', strong: true, team: 2 },
      { text: ' und ', strong: false },
      { text: 'Team Gelb', strong: true, team: 3 },
    ])
  })

  it('has no sentence for an empty list of winners', () => {
    expect(text(finishedOf([]))).toBeNull()
  })

  // The finished page waits for the Award ceremony (#445): the entry says the Event ended and names nobody, for one Winner and for a Tie alike.
  it('says only „Event beendet“ while the Winners wait, for one Winner and for a Tie, with nothing in bold', () => {
    for (const winners of [[2], [1, 2]]) {
      expect(activityParts(finishedOf(winners), t, [], true)).toEqual([{ text: 'Event beendet', strong: false }])
    }
  })

  it('names the Winners as before when they do not wait', () => {
    expect(activityParts(finishedOf([2]), t, [], false)).toEqual(activityParts(finishedOf([2]), t))
    expect(text(finishedOf([2]))).toBe('Event beendet: Team Orange gewinnt')
  })

  it('leaves the other entries as they are while the Winners wait', () => {
    const joined: ActivityEntry = { ...base, type: 'member_joined', params: {} }
    expect(activityParts(joined, t, [], true)).toEqual(activityParts(joined, t))
  })

  describe('a Correction (#275)', () => {
    const correctedOf = (games: Record<string, string> = { g1: 'Mario Kart' }): ActivityEntry => ({ ...base, games, type: 'result_corrected', params: { roundId: 'r', number: 3, gameId: 'g1' } })

    it('names the actor, the number of the Round and the game', () => {
      expect(text(correctedOf())).toBe('Sanne hat Spiel 3 (Mario Kart) korrigiert')
    })

    it('sets the actor and the game in bold, and nothing else', () => {
      expect(activityParts(correctedOf(), t)).toEqual([
        { text: 'Sanne', strong: true },
        { text: ' hat Spiel 3 (', strong: false },
        { text: 'Mario Kart', strong: true },
        { text: ') korrigiert', strong: false },
      ])
    })

    it('leaves out the sentence while the viewer may not name the game', () => {
      expect(text(correctedOf({}))).toBeNull()
    })
  })

  it('draws a Result with an icon of its own', () => {
    const icon = activityIcon(resultOf([1]))

    expect(icon.icon).toBeDefined()
    expect(icon.icon).not.toBe(activityIcon({ ...base, type: 'game_set', params: { roundId: 'r', gameId: 'g1' } }).icon)
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
    const moved: ActivityEntry = { ...base, actor: { id: 'u2', name: 'Hostess' }, people: { u1: 'Sanne' }, type: 'member_moved', params: { userId: 'u1', from: { zone: 'stands' }, to: { zone: 'team', team: 2 } } }

    expect(activityParts(moved, t)).toEqual([
      { text: 'Hostess', strong: true },
      { text: ' hat ', strong: false },
      { text: 'Sanne', strong: true },
      { text: ' nach ', strong: false },
      { text: 'Team Orange', strong: true, team: 2 },
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
    const types = ACTIVITY_TYPES.map(type => ({ ...base, type, params: type === 'member_moved' ? { userId: 'u1', from: { zone: 'team', team: 1 }, to: { zone: 'stands' } } : {} }) as unknown as ActivityEntry)

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

// The Team names an entry stores (#440, ADR 0016): the six kinds that name a team show the name they stored, with the team's position on its piece
// for the TeamMark; an entry without a stored name reads as its kind did before 0.12.
describe('the Team names of an entry (#440)', () => {
  const live: BoardTeam[] = [{ position: 1, name: 'Neue Bande' }, { position: 2, name: null }]
  const text = (entry: ActivityEntry, teams?: BoardTeam[]) => activityParts(entry, t, teams)?.map(part => part.text).join('') ?? null
  const moved = (teamNames?: Record<string, string | null>, to = 1): ActivityEntry => ({ ...base, actor: { id: 'u2', name: 'Hostess' }, people: { u1: 'Sanne' }, type: 'member_moved', params: { userId: 'u1', from: { zone: 'team', team: 2 }, to: { zone: 'team', team: to }, ...(teamNames && { teamNames }) } })
  const reset = (teamNames?: Record<string, string | null>): ActivityEntry => ({ ...base, type: 'team_name_reset', params: { team: 1, ...(teamNames && { teamNames }) } })
  const bonus = (teamNames?: Record<string, string | null>): ActivityEntry => ({ ...base, type: 'bonus_veto_granted', params: { team: 1, ...(teamNames && { teamNames }) } })
  const revealed = (vetoes: number[], teamNames?: Record<string, string | null>): ActivityEntry => ({ ...base, type: 'vetoes_revealed', params: { roundId: 'r', drawId: 'd', gameId: 'g1', vetoes: vetoes.map(team => ({ team })), ...(teamNames && { teamNames }) } })
  const result = (first: number[], teamNames?: Record<string, string | null>): ActivityEntry => ({ ...base, games: { g1: 'Mario Kart' }, type: 'result_entered', params: { roundId: 'r', number: 3, gameId: 'g1', first, ...(teamNames && { teamNames }) } })
  const finished = (winners: number[], teamNames?: Record<string, string | null>): ActivityEntry => ({ ...base, type: 'event_finished', params: { winners, ...(teamNames && { teamNames }) } })

  it('says the stored name in every kind that names a team, whatever the team is called now', () => {
    expect(text(moved({ 1: 'Wilde Gurken' }), live)).toBe('Hostess hat Sanne nach Wilde Gurken verschoben')
    expect(text(reset({ 1: 'Wilde Gurken' }), live)).toBe('Sanne hat den Namen von Wilde Gurken zurückgesetzt')
    expect(text(bonus({ 1: 'Wilde Gurken' }), live)).toBe('Sanne hat Wilde Gurken ein Bonus-Veto gegeben')
    expect(text(revealed([1], { 1: 'Wilde Gurken' }), live)).toBe('Veto von Wilde Gurken')
    expect(text(result([1], { 1: 'Wilde Gurken' }), live)).toBe('Spiel 3: Mario Kart, Wilde Gurken gewinnt')
    expect(text(finished([1], { 1: 'Wilde Gurken' }), live)).toBe('Event beendet: Wilde Gurken gewinnt')
  })

  it('names the colour for a stored null, a team that had no words, also where the team has a name now', () => {
    expect(text(moved({ 1: null }), live)).toBe('Hostess hat Sanne nach Team Rot verschoben')
    expect(text(reset({ 1: null }), live)).toBe('Sanne hat den Namen von Team Rot zurückgesetzt')
    expect(text(bonus({ 1: null }), live)).toBe('Sanne hat Team Rot ein Bonus-Veto gegeben')
    expect(text(revealed([1], { 1: null }), live)).toBe('Veto von Team Rot')
    expect(text(result([1], { 1: null }), live)).toBe('Spiel 3: Mario Kart, Team Rot gewinnt')
    expect(text(finished([1], { 1: null }), live)).toBe('Event beendet: Team Rot gewinnt')
  })

  it('reads an entry without stored names as its kind did before 0.12: live for a Veto, a Result and the Event end, the colour for the rest', () => {
    expect(text(revealed([1]), live)).toBe('Veto von Neue Bande')
    expect(text(result([1]), live)).toBe('Spiel 3: Mario Kart, Neue Bande gewinnt')
    expect(text(finished([1]), live)).toBe('Event beendet: Neue Bande gewinnt')
    expect(text(revealed([1]))).toBe('Veto von Team Rot')
    expect(text(moved(), live)).toBe('Hostess hat Sanne nach Team Rot verschoben')
    expect(text(reset(), live)).toBe('Sanne hat den Namen von Team Rot zurückgesetzt')
    expect(text(bonus(), live)).toBe('Sanne hat Team Rot ein Bonus-Veto gegeben')
  })

  it('puts the position on the piece of every named team, strong, so the feed sets its mark before the name', () => {
    expect(activityParts(moved({ 3: 'Wilde Gurken' }, 3), t)).toEqual([
      { text: 'Hostess', strong: true },
      { text: ' hat ', strong: false },
      { text: 'Sanne', strong: true },
      { text: ' nach ', strong: false },
      { text: 'Wilde Gurken', strong: true, team: 3 },
      { text: ' verschoben', strong: false },
    ])
    expect(activityParts(reset({ 1: 'Rote' }), t)!.filter(part => part.team !== undefined)).toEqual([{ text: 'Rote', strong: true, team: 1 }])
    expect(activityParts(bonus({ 1: null }), t)!.filter(part => part.team !== undefined)).toEqual([{ text: 'Team Rot', strong: true, team: 1 }])
    // The actor and the person are strong without a position: no mark.
    expect(activityParts(moved({ 1: 'Rote' }), t)!.filter(part => part.strong && part.team === undefined).map(part => part.text)).toEqual(['Hostess', 'Sanne'])
  })

  it('gives each team of a list its own piece and keeps the commas and „und“ plain: 1, 2 and 8 teams', () => {
    const names = { 1: 'Eins', 2: 'Zwei', 3: 'Drei', 4: null, 5: 'Fünf', 6: 'Sechs', 7: 'Sieben', 8: 'Acht' }
    expect(activityParts(revealed([2], names), t)).toEqual([{ text: 'Veto von ', strong: false }, { text: 'Zwei', strong: true, team: 2 }])
    expect(activityParts(revealed([1, 2], names), t)).toEqual([
      { text: 'Veto von ', strong: false },
      { text: 'Eins', strong: true, team: 1 },
      { text: ' und ', strong: false },
      { text: 'Zwei', strong: true, team: 2 },
    ])
    const tie = activityParts(finished([1, 2, 3, 4, 5, 6, 7, 8], names), t)!
    expect(tie.filter(part => part.team !== undefined).map(part => [part.team, part.text])).toEqual([[1, 'Eins'], [2, 'Zwei'], [3, 'Drei'], [4, 'Team Himmel'], [5, 'Fünf'], [6, 'Sechs'], [7, 'Sieben'], [8, 'Acht']])
    expect(tie.filter(part => part.team === undefined).map(part => part.text)).toEqual(['Unentschieden: ', ', ', ', ', ', ', ', ', ', ', ', ', ' und '])
    expect(tie.every(part => part.team === undefined || part.strong)).toBe(true)
  })

  it('keeps the longest name whole: six words of twelve characters, 77 characters', () => {
    const longest = Array.from({ length: 6 }, () => 'Zwölfzeichen').join(' ')

    expect(longest).toHaveLength(77)
    expect(activityParts(result([1], { 1: longest }), t)!.find(part => part.team === 1)!.text).toBe(longest)
  })

  it('names nobody and sets no mark while the Winners wait, stored names or not (#445)', () => {
    for (const winners of [[1], [1, 2]]) {
      const parts = activityParts(finished(winners, { 1: 'Wilde Gurken', 2: null }), t, live, true)

      expect(parts).toEqual([{ text: 'Event beendet', strong: false }])
    }
  })

  it('reads no caster out of a stored Veto, names beside it or not', () => {
    const old: ActivityEntry = { ...base, people: { u1: 'Eins' }, type: 'vetoes_revealed', params: { roundId: 'r', drawId: 'd', gameId: 'g1', vetoes: [{ team: 1, userId: 'u1' }] as never, teamNames: { 1: 'Wilde Gurken' } } }

    expect(text(old)).toBe('Veto von Wilde Gurken')
  })
})
