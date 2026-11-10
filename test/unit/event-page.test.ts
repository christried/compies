import { describe, expect, it } from 'vitest'
import { dateBlockedKey, eventPageState, headerPill, pagePill, pollingNumber, seatNote, sessionMenuKeys, shownSessionNumbers, startedIn, teamsStay, type PageInput, unevenNoticeIn, wearsPartyhat } from '../../app/utils/event-page'
import type { BoardTeam, MemberView } from '../../shared/event'
import type { RoundGame } from '../../shared/game'
import type { ResultView, StandingView } from '../../shared/stage'
import { standingsOf } from '../../shared/results'

// The one state of the Event page for everybody (#166, 11-event-seite § EventPage): the Head and the order of the blocks
// follow it. It is hostDockState's `kind` without the Host's start rule, so Members have it too.

const settings = { format: 'teams', teamCount: 2, teamSize: 2 } as PageInput['settings']

const dated = (id: string, number: number | null, startsAt: string, times: { startedAt?: string, endedAt?: string } = {}): PageInput['sessions'][number] => ({
  id, number, startsAt, previousStartsAt: null, notes: [], startedAt: times.startedAt ?? null, endedAt: times.endedAt ?? null,
})
const undated = (id: string): PageInput['sessions'][number] => ({ id, number: null, startsAt: null, previousStartsAt: null, startedAt: null, endedAt: null })

function input(sessions: PageInput['sessions'], fields: Partial<PageInput> = {}): PageInput {
  return { settings, sessions, missingDates: sessions.filter(session => session.startsAt === null).length, event: { phase: 'poll', isHost: false }, setGame: null, wheel: null, countdown: null, coin: null, end: null, ...fields }
}

const SAT = '2090-10-25T18:30:00.000Z'
const SUN = '2090-10-26T18:30:00.000Z'

describe('eventPageState', () => {
  it('is setup without settings, whatever the Sessions are', () => {
    expect(eventPageState(input([dated('a', null, SAT)], { settings: null })).kind).toBe('setup')
  })

  it('is the poll while no Session is dated; one Session has no numbers', () => {
    expect(eventPageState(input([undated('a')]))).toMatchObject({ kind: 'poll', total: 1, pollNumber: null, next: null, running: null, lastEnded: null })
  })

  it('numbers the Session that polls first when several Sessions have no Date', () => {
    expect(eventPageState(input([undated('a'), undated('b')]))).toMatchObject({ kind: 'poll', total: 2, pollNumber: 1 })
  })

  it('is teams once a Session is dated, with its number and Date', () => {
    expect(eventPageState(input([dated('a', 1, SAT), dated('b', 2, SUN)]))).toMatchObject({
      kind: 'teams', total: 2, pollNumber: null, next: { number: 1, startsAt: SAT },
    })
  })

  it('names the Session that still polls after the dated ones', () => {
    expect(eventPageState(input([dated('a', 1, SAT), undated('b')]))).toMatchObject({ kind: 'teams', next: { number: 1 }, pollNumber: 2 })
  })

  it('takes the earliest dated Session that has not started as the next one', () => {
    const state = eventPageState(input([dated('a', 1, SAT, { startedAt: SAT, endedAt: SAT }), dated('c', 3, '2090-11-02T18:30:00.000Z'), dated('b', 2, SUN)]))

    expect(state).toMatchObject({ kind: 'between', next: { number: 2 } })
  })

  it('is running while a Session runs, with its number and when it started', () => {
    const state = eventPageState(input([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)], { event: { phase: 'running', isHost: false } }))

    expect(state).toMatchObject({ kind: 'running', total: 2, running: { number: 1, startedAt: SAT }, next: { number: 2 } })
  })

  it('is between Sessions after one ended: the next one dated, or one that still waits for a Date', () => {
    const ended = dated('a', 1, SAT, { startedAt: SAT, endedAt: SUN })

    expect(eventPageState(input([ended, dated('b', 2, SUN)]))).toMatchObject({ kind: 'between', lastEnded: { number: 1 }, next: { number: 2, startsAt: SUN }, pollNumber: null })
    expect(eventPageState(input([ended, undated('b')]))).toMatchObject({ kind: 'between', lastEnded: { number: 1 }, next: null, pollNumber: 2 })
  })

  it('names the last Session that ended', () => {
    const state = eventPageState(input([
      dated('a', 1, SAT, { startedAt: SAT, endedAt: '2090-10-25T22:00:00.000Z' }),
      dated('b', 2, SUN, { startedAt: SUN, endedAt: '2090-10-26T22:00:00.000Z' }),
    ]))

    expect(state).toMatchObject({ kind: 'done', lastEnded: { number: 2 }, next: null, pollNumber: null })
  })

  it('follows the Sessions in the header pill, not the Event\'s Phase: poll, Date stands, running, over (#166)', () => {
    const ended = dated('a', 1, SAT, { startedAt: SAT, endedAt: SUN })
    const pill = (sessions: PageInput['sessions'], fields: Partial<PageInput> = {}) => pagePill(eventPageState(input(sessions, fields)))

    expect(pill([undated('a')])).toEqual({ phase: 'poll', noDate: false })
    expect(pill([dated('a', 1, SAT), undated('b')])).toEqual({ phase: 'date_set', noDate: false })
    expect(pill([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)])).toEqual({ phase: 'running', noDate: false })
    expect(pill([ended, dated('b', 2, SUN)])).toEqual({ phase: 'date_set', noDate: false })
    expect(pill([ended, undated('b')])).toEqual({ phase: 'poll', noDate: false })
    // No Session left, Event not finished (#277): the grey draft dot with „Kein Termin“; „Beendet“ is the finished Phase's own word.
    expect(pill([ended])).toEqual({ phase: 'draft', noDate: true })
    expect(pill([ended], { event: { phase: 'finished', isHost: false } })).toEqual({ phase: 'finished', noDate: false })
  })

  it('leaves the pill to the Event\'s own Phase in setup', () => {
    expect(pagePill(eventPageState(input([undated('a')], { settings: null })))).toBeNull()
  })

  it('is done for the only Session once it ended, without numbers', () => {
    const state = eventPageState(input([dated('a', null, SAT, { startedAt: SAT, endedAt: SUN })]))

    expect(state).toMatchObject({ kind: 'done', total: 1, lastEnded: { number: null } })
  })
})

describe('pollingNumber', () => {
  it('numbers the polling Sessions after the dated ones, in list order (#201)', () => {
    const sessions = [dated('a', 1, SAT), undated('b'), dated('c', 2, SUN), undated('d')]

    expect(pollingNumber(sessions, 2, 1)).toBe(3)
    expect(pollingNumber(sessions, 2, 2)).toBe(4)
    expect(pollingNumber(sessions, 2, 3)).toBeNull()
  })

  it('is null for the only Session of an Event, polling or not', () => {
    expect(pollingNumber([undated('a')], 1)).toBeNull()
  })

  it('is null when no Session polls', () => {
    expect(pollingNumber([dated('a', 1, SAT), dated('b', 2, SUN)], 0)).toBeNull()
  })
})

describe('shownSessionNumbers', () => {
  it('numbers the polling Sessions of the list after the dated one, in list order (#201)', () => {
    expect(shownSessionNumbers([dated('a', 1, SAT), undated('b'), undated('c')], 2)).toEqual([1, 2, 3])
  })

  it('shows the only Session of an Event with no number', () => {
    expect(shownSessionNumbers([undated('a')], 1)).toEqual([null])
  })
})

describe('dateBlockedKey', () => {
  it('says why Termin festlegen cannot set a Date: no Slot at all, or none in the future', () => {
    expect(dateBlockedKey([])).toBe('mvp.set.noSlots')
    expect(dateBlockedKey([{ past: true }, { past: true }])).toBe('mvp.set.noFutureSlot')
  })

  it('is null while one open future Slot can become a Date', () => {
    expect(dateBlockedKey([{ past: true }, { past: false }])).toBeNull()
  })
})

// The kind of the page and the facts that follow from it. The blocks of the stage per kind are the Stage module's (event-stage.ts, #415), tested in test/nuxt/event-stage.test.ts.
describe('the facts of the page state', () => {
  const ENDED = { startedAt: SAT, endedAt: SUN }
  const FINISHED: Partial<PageInput> = { event: { phase: 'finished', isHost: false } }

  it('is finished for the finished Phase, with a Session still in the list or no end at all (#277)', () => {
    expect(eventPageState(input([dated('a', 1, SAT, ENDED)], FINISHED))).toMatchObject({ kind: 'finished', running: null })
    expect(eventPageState(input([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)], FINISHED)).kind).toBe('finished')
    expect(eventPageState(input([dated('a', 1, SAT, ENDED)], { ...FINISHED, end: null })).kind).toBe('finished')
  })

  it('keeps the poll quiet as soon as the page is about something else than the Date', () => {
    const compact = (sessions: PageInput['sessions'], fields: Partial<PageInput> = {}) => eventPageState(input(sessions, fields)).pollCompact

    expect(compact([undated('a')])).toBe(false)
    expect(compact([undated('a')], { settings: null })).toBe(false)
    expect(compact([dated('a', 1, SAT), undated('b')])).toBe(true)
  })

  it('lets the cards stand out between two Sessions and after the last', () => {
    const standOut = (sessions: PageInput['sessions'], fields: Partial<PageInput> = {}) => eventPageState(input(sessions, fields)).cardsStandOut

    expect(standOut([dated('a', 1, SAT, ENDED), dated('b', 2, SUN)])).toBe(true)
    expect(standOut([dated('a', 1, SAT, ENDED)])).toBe(true)
    expect(standOut([dated('a', 1, SAT), dated('b', 2, SUN)])).toBe(false)
    // The news of a finished Event is its winner, not the Sessions card (#277).
    expect(standOut([dated('a', 1, SAT, ENDED)], { event: { phase: 'finished', isHost: false } })).toBe(false)
  })
})

// The page's text lines (#257, B1): pure, with a fake `t` that names the key and its parameters, so a case reads the key it picks.
const fakeT = (key: string, named?: Record<string, unknown>) => (named ? `${key}(${Object.entries(named).map(([k, v]) => `${k}=${v}`).join(',')})` : key)
const HOST_ID = 'host'
const hostView = (fields: Partial<MemberView> & Pick<MemberView, 'zone'>, teams: BoardTeam[] = []) => ({
  members: [{ id: HOST_ID, name: 'Sanne', image: null, isHost: true, team: null, teamWord: null, ...fields }],
  viewerId: HOST_ID,
  teams,
  event: { isHost: true },
})

// Which page kinds have started the first Session (#164) and which ones show the notice about uneven teams (#166).
describe('startedIn and unevenNoticeIn', () => {
  it.each([
    // kind, started, uneven notice
    ['setup', false, true],
    ['poll', false, true],
    ['teams', false, true],
    ['running', true, false],
    ['between', true, true],
    ['done', true, false],
    ['finished', true, false],
  ] as const)('the %s page: started %s, uneven notice %s', (kind, started, uneven) => {
    expect(startedIn(kind)).toBe(started)
    expect(unevenNoticeIn(kind)).toBe(uneven)
  })
})

describe('seatNote', () => {
  it('is null for a Member, whatever zone they sit in', () => {
    expect(seatNote({ ...hostView({ zone: 'stands' }), event: { isHost: false } }, fakeT)).toBeNull()
  })

  it('names the Tribüne for a Host who sits there', () => {
    expect(seatNote(hostView({ zone: 'stands' }), fakeT)).toBe('event.notice.seatStands')
  })

  it('names the Team by its name for a Host in a named Team', () => {
    expect(seatNote(hostView({ zone: 'team', team: 1 }, [{ position: 1, name: 'Rot', frozen: false }]), fakeT)).toBe('event.notice.seatTeam(team=Rot)')
  })

  it('names a Team without a name by its default name and colour', () => {
    expect(seatNote(hostView({ zone: 'team', team: 2 }, [{ position: 2, name: null, frozen: false }]), fakeT))
      .toBe('event.notice.seatTeam(team=team.defaultName(color=team.colors.2))')
  })

  it('is null for a Host on the Bench', () => {
    expect(seatNote(hostView({ zone: 'bench' }), fakeT)).toBeNull()
  })

  it('is null when the viewer is not among the Members', () => {
    expect(seatNote({ ...hostView({ zone: 'stands' }), viewerId: 'nobody' }, fakeT)).toBeNull()
  })
})

// The Party hat (#38): the viewer's own seat against the Leading Parties of the Event read the page holds.
describe('wearsPartyhat', () => {
  const ME = 'viewer'
  const HOST = 'host'
  const game: RoundGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }
  const resultOf = (number: number): ResultView => ({ roundId: `r${number}`, number, game, places: [{ team: 1, place: 1, points: 1, score: null }], corrected: false, correctedAt: null, resultAt: '2090-10-30T19:34:00.000Z' })
  const seated = (id: string, zone: MemberView['zone'], team: number | null = null, isHost = false): MemberView => ({ id, name: id, image: null, isHost, zone, team, teamWord: null })

  /** A view of `phase` with the Standings from the points (null: none) and one Result unless `results` says none. */
  function partyView({ members, points, viewerId = ME, phase = 'running', results = [resultOf(1)] }: { members: MemberView[], points: number[] | null, viewerId?: string, phase?: 'running' | 'finished', results?: ResultView[] }) {
    return { members, viewerId, standings: points === null ? null : standingsOf(points) as StandingView[], results, event: { phase } }
  }

  it('is yes for a Player seated in the Leading Party', () => {
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 2)], points: [1, 3, 2] }))).toBe(true)
  })

  it('is no for a Player seated in a trailing Party', () => {
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 1)], points: [1, 3, 2] }))).toBe(false)
  })

  it('is no for a Player on the Bench, and in the Stands', () => {
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'bench')], points: [1, 3, 2] }))).toBe(false)
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'stands')], points: [1, 3, 2] }))).toBe(false)
  })

  it('is no when the viewer is not among the Members', () => {
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 2)], points: [1, 3, 2], viewerId: 'nobody' }))).toBe(false)
  })

  it('is no before the first Result, even for a Player in the first rank', () => {
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 1)], points: [0, 0], results: [] }))).toBe(false)
  })

  it('is no without Standings', () => {
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 1)], points: null }))).toBe(false)
  })

  it('is yes for a Player in the Winners\' Party on the finished page', () => {
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 1)], points: [3, 1, 0], phase: 'finished' }))).toBe(true)
  })

  it('is yes for the Host seated in the Leading Party, and no for the Host on the Bench', () => {
    expect(wearsPartyhat(partyView({ members: [seated(HOST, 'team', 2, true)], points: [1, 3, 2], viewerId: HOST }))).toBe(true)
    expect(wearsPartyhat(partyView({ members: [seated(HOST, 'bench', null, true)], points: [1, 3, 2], viewerId: HOST }))).toBe(false)
  })

  it('is yes for a Player in either Party that shares the first rank', () => {
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 1)], points: [2, 0, 2] }))).toBe(true)
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 3)], points: [2, 0, 2] }))).toBe(true)
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 2)], points: [2, 0, 2] }))).toBe(false)
  })

  it('is yes only for the Player whose own Party leads in a free-for-all', () => {
    const others = [seated('p2', 'team', 2), seated('p3', 'team', 3)]
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 1), ...others], points: [3, 1, 0] }))).toBe(true)
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 2), ...others], points: [3, 1, 0] }))).toBe(false)
    expect(wearsPartyhat(partyView({ members: [seated(ME, 'team', 3), ...others], points: [3, 1, 0] }))).toBe(false)
  })
})

describe('teamsStay', () => {
  const next = { number: 2, startsAt: SUN }

  it('names the next Session by its number, to the Host and to a Member', () => {
    expect(teamsStay(next, true, fakeT)).toBe('event.notice.teamsStay(n=2)')
    expect(teamsStay(next, false, fakeT)).toBe('event.notice.teamsStayMember(n=2)')
  })

  it('says „der nächsten“ when the next Session has no number yet', () => {
    expect(teamsStay({ number: null, startsAt: SUN }, true, fakeT)).toBe('event.notice.teamsStayNext(n=null)')
    expect(teamsStay({ number: null, startsAt: SUN }, false, fakeT)).toBe('event.notice.teamsStayMemberNext(n=null)')
  })

  it('uses the next-Session keys without a next Session at all', () => {
    expect(teamsStay(null, true, fakeT)).toBe('event.notice.teamsStayNext(n=null)')
  })
})

describe('headerPill', () => {
  const state = (list: PageInput['sessions'], fields: Partial<PageInput> = {}) => eventPageState(input(list, fields))

  it('falls back to the Event\'s Phase, or poll, without a page state', () => {
    expect(headerPill(null, 'date_set', fakeT)).toEqual({ phase: 'date_set', label: undefined })
    expect(headerPill(null, undefined, fakeT)).toEqual({ phase: 'poll', label: undefined })
  })

  it('falls back to the Event\'s Phase in setup, where the page state has no pill', () => {
    expect(headerPill(state([undated('a')], { settings: null }), 'date_set', fakeT)).toEqual({ phase: 'date_set', label: undefined })
  })

  it('shows Kein Termin once the last Session ended and the Host has not finished the Event (#277)', () => {
    expect(headerPill(state([dated('a', 1, SAT, { startedAt: SAT, endedAt: SUN })]), 'running', fakeT)).toEqual({ phase: 'draft', label: 'phase.noDate' })
  })

  it('shows the finished Phase\'s own word, Beendet, once the Event is finished (#277)', () => {
    expect(headerPill(state([dated('a', 1, SAT, { startedAt: SAT, endedAt: SUN })], { event: { phase: 'finished', isHost: false } }), 'finished', fakeT)).toEqual({ phase: 'finished', label: undefined })
  })

  it('counts the running Session in an Event with several', () => {
    const running = state([dated('a', 1, SAT, { startedAt: SAT }), dated('b', 2, SUN)], { event: { phase: 'running', isHost: false } })

    expect(headerPill(running, 'running', fakeT)).toEqual({ phase: 'running', label: 'event.pill.running(n=1,total=2)' })
  })

  it('shows no label for the running Session of an Event with one', () => {
    const running = state([dated('a', 1, SAT, { startedAt: SAT })], { event: { phase: 'running', isHost: false } })

    expect(headerPill(running, 'running', fakeT)).toEqual({ phase: 'running', label: undefined })
  })

  it('shows the poll without a label', () => {
    expect(headerPill(state([undated('a'), undated('b')]), 'poll', fakeT)).toEqual({ phase: 'poll', label: undefined })
  })
})

describe('sessionMenuKeys (#349)', () => {
  const host = { isHost: true, canChangeSessions: true, several: true }
  const member = { isHost: false, canChangeSessions: true, several: true }

  it('gives the Host of a dated Session the calendar, Verschieben, Neue Terminsuche and Entfernen, in that order', () => {
    expect(sessionMenuKeys({ kind: 'set', ...host })).toEqual(['calendar', 'reschedule', 'reopen', 'remove'])
  })

  it('leaves Entfernen out for the only Session', () => {
    expect(sessionMenuKeys({ kind: 'set', ...host, several: false })).toEqual(['calendar', 'reschedule', 'reopen'])
  })

  it('leaves Neue Terminsuche and Entfernen out once Sessions cannot change any more (a finished Event)', () => {
    expect(sessionMenuKeys({ kind: 'set', ...host, canChangeSessions: false })).toEqual(['calendar', 'reschedule'])
  })

  it('gives a Member of a dated Session the calendar only', () => {
    expect(sessionMenuKeys({ kind: 'set', ...member })).toEqual(['calendar'])
  })

  it('gives a Session that polls, runs or ended no menu, to the Host and a Member alike', () => {
    for (const kind of ['undated', 'running', 'ended'] as const) {
      expect(sessionMenuKeys({ kind, ...host }), `Host ${kind}`).toEqual([])
      expect(sessionMenuKeys({ kind, ...member }), `Member ${kind}`).toEqual([])
    }
  })
})
