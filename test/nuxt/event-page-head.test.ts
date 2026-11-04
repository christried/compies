import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import EventPageHead from '~/components/EventPageHead.vue'
import { eventPageState, type PageInput } from '~/utils/event-page'
import type { BoardTeam } from '~~/shared/event'

// The Head of the Event page (#166, 11-event-seite § EventPageHead): kicker, the one h1 and the jump to a poll that is
// not on top, per state of the page.

const settings = { format: 'teams', teamCount: 2, teamSize: 2 } as PageInput['settings']
const dated = (id: string, number: number | null, startsAt: string, times: { startedAt?: string, endedAt?: string } = {}): PageInput['sessions'][number] => ({
  id, number, startsAt, previousStartsAt: null, notes: [], startedAt: times.startedAt ?? null, endedAt: times.endedAt ?? null,
})
const undated = (id: string): PageInput['sessions'][number] => ({ id, number: null, startsAt: null, previousStartsAt: null, startedAt: null, endedAt: null })

// 18:30 UTC is 20:30 in Berlin in summer.
const SAT = '2090-06-25T18:30:00.000Z'
const SUN = '2090-06-26T18:30:00.000Z'
const STARTED = '2090-06-25T18:34:00.000Z'

function mountHead(sessions: PageInput['sessions'], fields: Partial<PageInput> = {}, isHost = false, extra: { winners?: number[], teams?: BoardTeam[] } = {}) {
  const state = eventPageState({ settings, sessions, missingDates: sessions.filter(session => session.startsAt === null).length, event: { phase: 'poll' }, setGame: null, wheel: null, countdown: null, coin: null, ...fields })
  return mountSuspended(EventPageHead, { props: { state, isHost, ...extra }, attachTo: document.body })
}

describe('EventPageHead', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('says the poll runs: Session n of total, and „Wann zocken wir?“', async () => {
    const head = await mountHead([undated('a'), undated('b')])

    expect(head.text()).toContain('Session 1 von 2 · Terminumfrage läuft')
    expect(head.get('h1').text()).toBe('Wann zocken wir?')
    expect(head.find('a').exists()).toBe(false)
  })

  it('has no numbers for the only Session', async () => {
    const head = await mountHead([undated('a')])

    expect(head.text()).toContain('Terminumfrage läuft')
    expect(head.text()).not.toContain('Session')
  })

  it('opens the teams with the Date of the next Session, and links to the poll of a Session that still waits for its Date', async () => {
    const head = await mountHead([dated('a', 1, SAT), undated('b')])

    expect(head.text()).toContain('Session 1: So 25.06., 20:30 · Teamwahl offen')
    expect(head.get('h1').text()).toBe('Rein in die Teams')
    const jump = head.get('a')
    expect(jump.text()).toBe('Session 2: Terminumfrage läuft')
    expect(jump.attributes('href')).toBe('#poll-session-2')
    // Plain underlined text: outline-memphis would draw a box around it.
    expect(jump.classes()).not.toContain('outline-memphis')
  })

  it('has no jump while all Sessions are dated', async () => {
    const head = await mountHead([dated('a', 1, SAT), dated('b', 2, SUN)])

    expect(head.find('a').exists()).toBe(false)
  })

  it('moves focus to the heading of the poll when the jump is used', async () => {
    const target = document.createElement('h2')
    target.id = 'poll-session-2'
    target.tabIndex = -1
    document.body.append(target)
    const head = await mountHead([dated('a', 1, SAT), undated('b')])

    await head.get('a').trigger('click')

    expect(document.activeElement).toBe(target)
  })

  it('says since when the Session runs', async () => {
    const head = await mountHead([dated('a', 1, SAT, { startedAt: STARTED }), dated('b', 2, SUN)])

    expect(head.text()).toContain('Session 1 von 2 läuft seit 20:34')
    expect(head.get('h1').text()).toBe('Session 1 läuft')
  })

  it('says the only Session runs, without a number', async () => {
    const head = await mountHead([dated('a', null, SAT, { startedAt: STARTED })])

    expect(head.text()).toContain('Läuft seit 20:34')
    expect(head.get('h1').text()).toBe('Die Session läuft')
  })

  it('calls the break between Sessions „Halbzeit“ and names the next Session with its Date, or its poll', async () => {
    const ended = dated('a', 1, SAT, { startedAt: STARTED, endedAt: '2090-06-25T21:12:00.000Z' })

    const withDate = await mountHead([ended, dated('b', 2, SUN)])
    expect(withDate.text()).toContain('Session 1 beendet · Session 2: Mo 26.06., 20:30')
    expect(withDate.get('h1').text()).toBe('Halbzeit')

    const polling = await mountHead([ended, undated('b')])
    expect(polling.text()).toContain('Session 1 beendet · Session 2: Terminumfrage läuft')
    expect(polling.get('a').text()).toBe('Session 2: Terminumfrage läuft')
  })

  it('thanks the players once every Session ended', async () => {
    const ended = (id: string, number: number, startsAt: string) => dated(id, number, startsAt, { startedAt: startsAt, endedAt: startsAt })
    const head = await mountHead([ended('a', 1, SAT), ended('b', 2, SUN)])

    expect(head.text()).toContain('Session 2 von 2 beendet')
    expect(head.get('h1').text()).toBe('Gut gespielt')
  })

  // The finished Event (#277): the Head names the winner. Several winners are #278's (a Tie); until then they read like none.
  describe('in a finished Event', () => {
    const ended = dated('a', 1, SAT, { startedAt: SAT, endedAt: SUN })
    const FINISHED: Partial<PageInput> = { event: { phase: 'finished' } }
    const teams: BoardTeam[] = [{ position: 1, name: 'Wilde Gurken', frozen: true }, { position: 2, name: null, frozen: false }]

    it('says the Event is over and names the winner by the Team\'s frozen name', async () => {
      const head = await mountHead([ended], FINISHED, false, { winners: [1], teams })

      expect(head.text()).toContain('Event beendet')
      expect(head.get('h1').text()).toBe('Wilde Gurken gewinnt das Event')
    })

    it('names a winner without a frozen name by the colour', async () => {
      const head = await mountHead([ended], FINISHED, true, { winners: [2], teams })

      expect(head.get('h1').text()).toBe('Team Orange gewinnt das Event')
    })

    it('wraps the longest Team name instead of overflowing', async () => {
      const long: BoardTeam[] = [{ position: 1, name: 'Die Unerschrockenen Wanderer', frozen: true }]
      const head = await mountHead([ended], FINISHED, false, { winners: [1], teams: long })

      expect(head.get('h1').text()).toBe('Die Unerschrockenen Wanderer gewinnt das Event')
      expect(head.get('h1').classes()).toEqual(expect.arrayContaining(['text-balance', 'break-words']))
    })

    it('only says the Event is over for two winners, for none, and without the props', async () => {
      expect((await mountHead([ended], FINISHED, false, { winners: [1, 2], teams })).get('h1').text()).toBe('Das Event ist beendet')
      expect((await mountHead([ended], FINISHED, false, { winners: [], teams })).get('h1').text()).toBe('Das Event ist beendet')
      expect((await mountHead([ended], FINISHED)).get('h1').text()).toBe('Das Event ist beendet')
    })

    it('has no jump to a poll', async () => {
      const head = await mountHead([ended, undated('b')], FINISHED, false, { winners: [1], teams })

      expect(head.find('a').exists()).toBe(false)
    })
  })

  it('asks the Host to set the Event up and tells a Member it starts soon', async () => {
    const host = await mountHead([undated('a')], { settings: null }, true)
    const member = await mountHead([undated('a')], { settings: null })

    expect(host.text()).toContain('Noch nicht eingerichtet')
    expect(host.get('h1').text()).toBe('Erst einrichten, dann zocken')
    expect(member.get('h1').text()).toBe('Gleich geht’s los')
  })
})
