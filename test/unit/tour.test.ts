import { describe, expect, it } from 'vitest'
import { MEMBER_TOUR, TOUR_CALM_MS, TOUR_VERSION, tourMayStart, tourMove, tourRun, type TourPage, type TourStartInput, type TourStep } from '../../shared/tour'

// The Tour's pure rules (#647, ADR 0017): which steps a run holds for the page it opens on, when it may start, and how a step moves.

const page: TourPage = { phase: 'poll', role: 'member', present: new Set<string>(), wide: true }

describe('tourRun', () => {
  it('gives the Member\'s tour greeting and end, which point at nothing', () => {
    expect(tourRun(MEMBER_TOUR, page).map(step => step.id)).toEqual(['greeting', 'end'])
  })

  const steps: TourStep[] = [
    { id: 'a', target: null },
    { id: 'b', target: 'board' },
    { id: 'c', target: null },
  ]

  it('drops a step whose target is not on the page and keeps it when it is', () => {
    expect(tourRun(steps, page).map(step => step.id)).toEqual(['a', 'c'])
    expect(tourRun(steps, { ...page, present: new Set(['board']) }).map(step => step.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops a step whose own rule says no and hands it the page', () => {
    const seen: TourPage[] = []
    const run = tourRun([
      {
        id: 'a',
        target: null,
        applies: (given) => {
          seen.push(given)
          return false
        },
      },
      { id: 'b', target: null, applies: () => true },
    ], page)

    expect(run.map(step => step.id)).toEqual(['b'])
    expect(seen).toEqual([page])
  })

  it('keeps the order of the list', () => {
    const present = new Set(['x', 'y'])
    const run = tourRun([{ id: '3', target: 'y' }, { id: '1', target: null }, { id: '2', target: 'x' }], { ...page, present })

    expect(run.map(step => step.id)).toEqual(['3', '1', '2'])
  })

  it('runs another list the same way, which is how a Host tour will work', () => {
    expect(tourRun([{ id: 'host-one', target: null }], page).map(step => step.id)).toEqual(['host-one'])
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
