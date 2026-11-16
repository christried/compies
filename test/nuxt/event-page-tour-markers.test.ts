import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { kitty, signInAs } from './auth'
import { stubScreen } from './event-page'
import { FIRST, mount, mountedPage, SESSION, serveState, unmountPage, type Setup } from './event-page-states'
import { MEMBER_TOUR } from '~~/shared/tour'

// The markers the Tour points at (#648, ADR 0017): `data-tour` names a thing, `data-tour-anchor` the spot inside it the tail aims at. They are the page's, not
// the Tour's, so each is read on the Host's page and on a Member's: the Host never gets the Tour, but the page carries every marker all the same. Every
// pointing step of the Member's list must have its marker here: a new step without a case fails the first test.

const POLL: Setup = { sessions: [SESSION(1, null)], missing: 1 }
/** An Event whose Date is set: Team choice is open and no poll is there. */
const DATE_SET: Setup = { sessions: [SESSION(1, FIRST)], missing: 0, phase: 'date_set', teamChoiceOpen: true }

/** Marker -> the fixture that must carry it. */
const FIXTURES: Record<string, Setup> = {
  'head': POLL,
  'poll': POLL,
  'poll-card': POLL,
  'board': POLL,
  'how': POLL,
  'panel': POLL,
  'tab-activity': POLL,
  'sound': POLL,
}

const stepTargets = () => [...new Set(MEMBER_TOUR.flatMap(step => [step.target, step.targetNarrow]).filter((value): value is string => typeof value === 'string'))]
const thing = (value: string) => mountedPage()!.find(`[data-tour="${value}"]`)
const things = (value: string) => mountedPage()!.findAll(`[data-tour="${value}"]`)
const anchors = (value: string) => mountedPage()!.findAll(`[data-tour-anchor="${value}"]`)

beforeEach(() => {
  signInAs(kitty)
  stubScreen(true)
})

afterEach(unmountPage)

describe('the table of markers', () => {
  it('has a fixture for every target and narrow target of the Member\'s Tour, and nothing else', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(stepTargets().sort())
  })
})

describe.each([['the Host', true], ['a Member', false]])('the markers on the page of %s', (_who, host) => {
  it.each(Object.entries(FIXTURES))('has the %s marker', async (value, setup) => {
    const { slug } = serveState({ ...setup, host })

    await mount(slug)

    expect(things(value).length, value).toBeGreaterThan(0)
  })

  it('has exactly one poll card marker, the first card\'s, and the vote anchor on the cards', async () => {
    const { slug } = serveState({ ...POLL, host })

    await mount(slug)

    expect(things('poll-card')).toHaveLength(1)
    expect(thing('poll-card').element.tagName).toBe('ARTICLE')
    expect(thing('poll-card').element.closest('li')?.hasAttribute('data-tour')).toBe(false)
    expect(thing('poll').find('[data-tour="poll-card"]').exists()).toBe(true)
    expect(anchors('vote').length).toBeGreaterThan(0)
    expect(thing('poll-card').find('[data-tour-anchor="vote"]').exists()).toBe(true)
  })

  it('has the poll around the cards and without the matrix', async () => {
    const { slug } = serveState({ ...POLL, host })

    await mount(slug)

    expect(thing('poll').find('ol').exists()).toBe(true)
    expect(thing('poll').text()).not.toContain('Wer kann wann?')
  })

  it('has no poll and no poll card without an open Slot', async () => {
    const { slug } = serveState({ ...POLL, host, overrides: { slots: [] } })

    await mount(slug)

    expect(things('poll')).toHaveLength(0)
    expect(things('poll-card')).toHaveLength(0)
    expect(anchors('vote')).toHaveLength(0)
  })

  it('has no poll in an Event whose Date is set', async () => {
    const { slug } = serveState({ ...DATE_SET, host })

    await mount(slug)

    expect(things('poll')).toHaveLength(0)
    expect(things('board')).toHaveLength(1)
  })

  it('has „So wird gespielt“ with the Event\'s settings and not without them', async () => {
    const { slug } = serveState({ ...POLL, host })
    await mount(slug)
    expect(things('how')).toHaveLength(1)
    unmountPage()
    stubScreen(true)

    const bare = serveState({ ...POLL, host, settings: false })
    await mount(bare.slug)

    expect(things('how')).toHaveLength(0)
  })

  it('has the panel marked as the sticky chrome the Tour does not scroll to, with the Activity tab as its anchor', async () => {
    const { slug } = serveState({ ...POLL, host })

    await mount(slug)

    expect(thing('panel').attributes('data-tour-edge')).toBe('panel')
    expect(thing('panel').element.tagName).toBe('ASIDE')
    expect(thing('panel').find('[data-tour-anchor="tab-activity"]').exists()).toBe(true)
    expect(thing('panel').find('[data-tour-anchor="tab-activity"]').text()).toBe('Aktivität')
  })

  it('has the Activity item of the tab bar as the phone\'s thing', async () => {
    const { slug } = serveState({ ...POLL, host })

    await mount(slug)

    expect(thing('tab-activity').element.closest('[data-tour-edge="tabs"]')).not.toBeNull()
    expect(thing('tab-activity').text()).toContain('Aktivität')
  })

  it('has the sound button\'s own marker in the header', async () => {
    const { slug } = serveState({ ...POLL, host })

    await mount(slug)

    expect(thing('sound').element.tagName).toBe('BUTTON')
    expect(thing('sound').element.closest('[data-tour-edge="header"]')).not.toBeNull()
  })

  it('has the anchor on the viewer\'s own avatar only, not on the others\'', async () => {
    const { slug } = serveState({ ...POLL, host })

    await mount(slug)

    const mine = anchors('me')
    expect(mine).toHaveLength(1)
    expect(mine[0]!.text()).toBe('Du')
    expect(thing('board').find('[data-tour-anchor="me"]').exists()).toBe(true)
    expect(thing('board').text()).toContain('Larsi')
    expect(thing('board').text()).toContain('Sanne')
  })
})
