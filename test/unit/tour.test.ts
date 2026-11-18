import { describe, expect, it } from 'vitest'
import { MEMBER_TOUR, TOUR_CALM_MS, TOUR_VERSION, tourMayStart, tourFace, tourMove, tourRun, tourThing, type TourPage, type TourStartInput, type TourStep } from '../../shared/tour'

// The Tour's pure rules (#647, ADR 0017): which steps a run holds for the page it opens on, when it may start, and how a step moves.

const page: TourPage = { phase: 'poll', role: 'member', present: new Set<string>(), wide: true, teamChoiceOpen: false }
const withBoard: TourPage = { ...page, present: new Set(['board']) }
const ids = (run: readonly TourStep[]) => run.map(step => step.id)
const EVERYTHING = new Set(['head', 'poll', 'poll-card', 'board', 'how', 'panel', 'tab-activity', 'sound'])

describe('tourRun', () => {
  it('gives no run at all when nothing it points at is on the page: greeting and end alone are not a Tour (#648)', () => {
    expect(tourRun(MEMBER_TOUR, page)).toEqual([])
  })

  it('gives the Member\'s tour greeting, head and end when only the head is on the page (#460)', () => {
    expect(ids(tourRun(MEMBER_TOUR, { ...page, present: new Set(['head']) }))).toEqual(['greeting', 'head', 'end'])
  })

  it('gives a Member\'s full run in the poll Phase: greeting, head, poll, board, how, activity, sound, end (#648)', () => {
    expect(ids(tourRun(MEMBER_TOUR, { ...page, present: EVERYTHING }))).toEqual(['greeting', 'head', 'poll', 'board', 'how', 'activity', 'sound', 'end'])
  })

  it.each([
    ['poll', 'poll'],
    ['board', 'board'],
    ['how', 'how'],
    ['activity', 'panel'],
    ['sound', 'sound'],
  ])('leaves the %s step out when its thing (%s) is not on the page, and keeps it when it is', (id, thing) => {
    const without = new Set([...EVERYTHING].filter(value => value !== thing))

    expect(ids(tourRun(MEMBER_TOUR, { ...page, present: without }))).not.toContain(id)
    expect(ids(tourRun(MEMBER_TOUR, { ...page, present: EVERYTHING }))).toContain(id)
  })

  it('has the phone\'s tabs step in place of the panel\'s, never both (#648)', () => {
    expect(ids(tourRun(MEMBER_TOUR, { ...page, present: EVERYTHING, wide: true }))).toContain('activity')
    expect(ids(tourRun(MEMBER_TOUR, { ...page, present: EVERYTHING, wide: true }))).not.toContain('tabs')
    expect(ids(tourRun(MEMBER_TOUR, { ...page, present: EVERYTHING, wide: false }))).toContain('tabs')
    expect(ids(tourRun(MEMBER_TOUR, { ...page, present: EVERYTHING, wide: false }))).not.toContain('activity')
  })

  it.each([
    ['poll', false, 'board'],
    ['date_set', true, 'boardOpen'],
    ['running', false, 'boardLocked'],
  ] as const)('has exactly one Game board step in the %s Phase (team choice open: %s): %s', (phase, teamChoiceOpen, expected) => {
    const run = ids(tourRun(MEMBER_TOUR, { ...page, phase, teamChoiceOpen, present: EVERYTHING }))

    expect(run.filter(id => id.startsWith('board'))).toEqual([expected])
  })

  it('has the face each step shows: hello, points at a thing, cheers at the end (#460)', () => {
    const faces = Object.fromEntries(MEMBER_TOUR.map(step => [step.id, tourFace(step)]))

    expect(faces).toEqual({
      greeting: 'hello',
      head: 'points',
      poll: 'points',
      board: 'points',
      boardOpen: 'points',
      boardLocked: 'points',
      how: 'points',
      activity: 'points',
      tabs: 'points',
      sound: 'points',
      end: 'cheers',
    })
  })

  it('points a step at its narrow child below the narrow width and at the thing otherwise (#648)', () => {
    const poll = MEMBER_TOUR.find(step => step.id === 'poll')!
    const board = MEMBER_TOUR.find(step => step.id === 'board')!

    expect(tourThing(poll, true)).toBe('poll-card')
    expect(tourThing(poll, false)).toBe('poll')
    expect(tourThing(board, true)).toBe('board')
    expect(tourThing(board, false)).toBe('board')
    expect(tourThing(MEMBER_TOUR[0]!, true)).toBeNull()
  })

  it('lets a step choose its face and defaults to pointing when it has a target, else hello', () => {
    expect(tourFace({ id: 'a', target: 'board' })).toBe('points')
    expect(tourFace({ id: 'b', target: null })).toBe('hello')
    expect(tourFace({ id: 'c', target: null, face: 'cheers' })).toBe('cheers')
    expect(tourFace({ id: 'd', target: 'board', face: 'hello' })).toBe('hello')
  })

  const steps: TourStep[] = [
    { id: 'a', target: null },
    { id: 'b', target: 'board' },
    { id: 'c', target: null },
  ]

  it('drops a step whose target is not on the page and keeps it when it is', () => {
    const more: TourStep[] = [...steps.slice(0, 2), { id: 'd', target: 'sound' }, steps[2]!]

    expect(ids(tourRun(more, { ...page, present: new Set(['sound']) }))).toEqual(['a', 'd', 'c'])
    expect(ids(tourRun(more, { ...page, present: new Set(['board', 'sound']) }))).toEqual(['a', 'b', 'd', 'c'])
  })

  it('gives no run for a list of greeting and end only (#648)', () => {
    expect(tourRun([steps[0]!, steps[2]!], page)).toEqual([])
  })

  it('drops a step whose own rule says no and hands it the page', () => {
    const seen: TourPage[] = []
    const run = tourRun([
      {
        id: 'a',
        target: 'board',
        applies: (given) => {
          seen.push(given)
          return false
        },
      },
      { id: 'b', target: 'board', applies: () => true },
    ], withBoard)

    expect(run.map(step => step.id)).toEqual(['b'])
    expect(seen).toEqual([withBoard])
  })

  it('keeps the order of the list', () => {
    const present = new Set(['x', 'y'])
    const run = tourRun([{ id: '3', target: 'y' }, { id: '1', target: null }, { id: '2', target: 'x' }], { ...page, present })

    expect(run.map(step => step.id)).toEqual(['3', '1', '2'])
  })

  it('runs another list the same way, which is how a Host tour will work', () => {
    expect(tourRun([{ id: 'host-one', target: 'board' }], withBoard).map(step => step.id)).toEqual(['host-one'])
  })

  it('gives an empty run for an empty list', () => {
    expect(tourRun([], page)).toEqual([])
  })
})

describe('tourMayStart', () => {
  const calm: TourStartInput = { storedVersion: 0, role: 'member', phase: 'poll', sessionRunning: false, layerOpen: false, calmFor: TOUR_CALM_MS }

  it('starts for a Member who has not seen it, on a calm page before the finish', () => {
    expect(tourMayStart(calm)).toBe(true)
  })

  it('starts exactly at the calm second, and for a stored version below the current one', () => {
    expect(tourMayStart({ ...calm, calmFor: TOUR_CALM_MS })).toBe(true)
    expect(tourMayStart({ ...calm, storedVersion: TOUR_VERSION - 1 })).toBe(true)
  })

  it.each([
    ['the stored version is the current one', { storedVersion: TOUR_VERSION }],
    ['the stored version is above the current one', { storedVersion: TOUR_VERSION + 1 }],
    ['nobody is signed in', { storedVersion: null }],
    ['the viewer is the Host', { role: 'host' as const }],
    ['the Event is finished', { phase: 'finished' as const }],
    ['the Event is archived', { phase: 'archived' as const }],
    ['there is no Event', { phase: null }],
    ['a Session runs', { sessionRunning: true }],
    ['a layer is open', { layerOpen: true }],
    ['the page was calm for less than the second', { calmFor: TOUR_CALM_MS - 1 }],
    ['the page was not calm at all', { calmFor: 0 }],
  ])('does not start when %s', (_what, change) => {
    expect(tourMayStart({ ...calm, ...change })).toBe(false)
  })

  it.each(['draft', 'poll', 'date_set', 'running'] as const)('starts in the %s Phase', (phase) => {
    expect(tourMayStart({ ...calm, phase })).toBe(true)
  })
})

describe('tourMove', () => {
  it('walks forward and finishes on the last step', () => {
    expect(tourMove(2, 0, 'next')).toEqual({ at: 1 })
    expect(tourMove(2, 1, 'next')).toEqual({ over: 'finished' })
  })

  it('goes back, and stays on the first step', () => {
    expect(tourMove(2, 1, 'back')).toEqual({ at: 0 })
    expect(tourMove(2, 0, 'back')).toEqual({ at: 0 })
  })

  it('skips from any step', () => {
    expect(tourMove(3, 0, 'skip')).toEqual({ over: 'skipped' })
    expect(tourMove(3, 2, 'skip')).toEqual({ over: 'skipped' })
  })

  it('finishes a run of one step on next', () => {
    expect(tourMove(1, 0, 'next')).toEqual({ over: 'finished' })
  })

  it('does not step past the end when an index is already beyond it', () => {
    expect(tourMove(2, 5, 'next')).toEqual({ over: 'finished' })
  })
})
