import { describe, expect, it } from 'vitest'
import de from '../../i18n/locales/de.json'
import { CLAIMED_KEYS, TOUR_RUNS } from '../../scripts/browser/walk-states-tour.mjs'
import { MEMBER_TOUR, tourRun } from '../../shared/tour'
import type { Phase } from '../../shared/phase'

// The plan of the wording walk's Rundgang states (scripts/browser/walk-states-tour.mjs, #810): every `tour.*` and `settings.tour*` text, and the Hidden wheel's
// placeholders, have a picture PLANNED. That the walk gets them is measured by its local run (#812); here the plan is held against `shared/tour.ts` and the copy,
// so a step or a text added to the Tour later fails until a state reaches it.
type Width = 390 | 1440
const WIDTHS: Width[] = [390, 1440]
const runs = TOUR_RUNS as { name: string, build: string, page: { phase: Phase, teamChoiceOpen: boolean }, steps: Record<Width, number> }[]

/** The steps of the Tour a Member's page holds, every thing the steps point at being on it. */
function stepsAt(run: (typeof runs)[number], width: Width) {
  const present = new Set(MEMBER_TOUR.flatMap(step => (step.target === null ? [] : [step.target])))
  return tourRun(MEMBER_TOUR, { phase: run.page.phase, role: 'member', present, wide: width === 1440, teamChoiceOpen: run.page.teamChoiceOpen }).map(step => step.id)
}

describe('the Rundgang states of the walk', () => {
  it('plan each run as long as the Tour makes it, at both widths', () => {
    for (const run of runs) {
      for (const width of WIDTHS) expect(stepsAt(run, width), `${run.name} at ${width}`).toHaveLength(run.steps[width])
    }
  })

  it('reach every step of the Member\'s Tour between them', () => {
    const reached = new Set(runs.flatMap(run => WIDTHS.flatMap(width => stepsAt(run, width))))
    expect([...reached].sort()).toEqual(MEMBER_TOUR.map(step => step.id).sort())
  })

  it('have a picture planned for every tour.* text of the copy, and for no other', () => {
    const reached = new Set(runs.flatMap(run => WIDTHS.flatMap(width => stepsAt(run, width))))
    const planned = [...reached].flatMap(id => [`tour.${id}.title`, `tour.${id}.text`])
    // The chrome of the bubble: the buttons, the counter, its label for screen readers and the live region.
    planned.push('tour.skip', 'tour.finish', 'tour.count', 'tour.countLabel', 'tour.live')
    const inCopy = Object.entries(de.tour).flatMap(([name, value]) => (typeof value === 'string' ? [`tour.${name}`] : Object.keys(value).map(leaf => `tour.${name}.${leaf}`)))
    expect(planned.sort()).toEqual(inCopy.sort())
  })

  it('claim every settings.tour* text of the Profil row', () => {
    const inCopy = Object.keys(de.settings).filter(key => key.startsWith('tour')).map(key => `settings.${key}`)
    expect(inCopy.length).toBeGreaterThan(0)
    for (const key of inCopy) expect(CLAIMED_KEYS, key).toContain(key)
  })

  it('has as many placeholders as the pool of the Hidden wheel\'s Event holds games', () => {
    expect(de.wheel.placeholders).toHaveLength(30)
  })
})
