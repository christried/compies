import { describe, expect, it } from 'vitest'
import { buildRun, runGeometry, runPartsOf, type RunBox } from '~/utils/ceremony-run'
import type { Box } from '~/utils/ceremony-tie-run'
import { loadGsap } from '~/utils/gsap'
import { ceremonyCuePlan } from '~/utils/sound-cues'
import { ceremonyTimeline } from '~~/shared/ceremony'

// The Pokal-Lauf's easing and duration (CODING_STANDARDS § Motion, ADR 0015, S1 of the 0.9 review): the tweens of the built timeline carry the
// named eases and durations of 04-motion § Award ceremony 6b and 12-siegerehrung-unentschieden.md § 6b-T. GSAP's eases are not `--cp-ease-*`
// tokens, so the test reads the tween vars off the timeline, not pixels (happy-dom has no layout). A tween is found by the `data-part` of its target.

interface Tween { targets: () => unknown[], startTime: () => number, vars: { ease?: unknown, duration?: number, stagger?: unknown } }
interface Expected { part: string, ease: string, duration: number, stagger?: number }

/** The stage's `data-part` hooks as `AwardCeremony.vue` renders them. `winners` > 1 adds the Tie's plate, cards, badges and people. */
function stage({ rows, winners, grid = false, chips = false }: { rows: number, winners: number, grid?: boolean, chips?: boolean }) {
  const root = document.createElement('div')
  const add = (name: string, parent: HTMLElement = root) => {
    const element = document.createElement('div')
    element.dataset.part = name
    parent.append(element)
    return element
  }
  // The layout markers are on descendants, as `tiePartsOf` looks them up.
  const marker = (name: string, value: string) => {
    const element = document.createElement('div')
    element.dataset[name] = value
    root.append(element)
  }
  if (grid) marker('stage', 'grid')
  if (chips) marker('rows', 'chips')
  for (const name of ['banner', 'compibert', 'trophy', 'share']) add(name)
  for (let index = 0; index < rows; index++) add('row')
  if (winners === 1) {
    for (const name of ['card', 'front', 'back', 'stamp', 'person']) add(name)
    return root
  }
  add('plate')
  add('plate-front')
  add('plate-stamp')
  for (let index = 0; index < winners; index++) {
    add('card')
    add('front')
    add('back')
    add('stamp')
    if (grid) add('stack')
    else add('person', add('party'))
    if (!grid && index < winners - 1) add('badge')
  }
  return root
}

async function tweensOf(shape: { rows: number, winners: number, grid?: boolean, chips?: boolean }, partyCount: number, gag: 'trip' | 'bonk' = 'trip') {
  const gsap = await loadGsap()
  const root = stage(shape)
  const parts = runPartsOf(root)!
  const cards: Box[] = Array.from({ length: shape.winners }, (_, index) => ({ left: 100 + 260 * index, top: 220, width: 240, height: 140 }))
  const box: RunBox = {
    stage: { width: 1000, height: 600 },
    card: cards[0] ?? { left: 400, top: 200, width: 200, height: 140 },
    compibert: { width: 100, height: 120 },
    ...(shape.winners > 1 ? { tie: { grid: shape.grid === true, cards, plate: { left: 100, top: 120, width: 740, height: 40 } } } : {}),
  }
  const timeline = buildRun(gsap, parts, runGeometry(box), { partyCount, winners: shape.winners, grid: shape.grid === true, gag, rigState: () => {}, onBurst: () => {} })
  return (timeline.getChildren(false, true, false) as unknown as Tween[])
    .filter(tween => tween.targets().every(target => target instanceof HTMLElement))
    .map(tween => ({
      part: (tween.targets()[0] as HTMLElement).dataset.part!,
      // Where the tween starts on the timeline, in seconds (#743: the ceremony's cues are held against it).
      start: tween.startTime(),
      ease: typeof tween.vars.ease === 'string' ? tween.vars.ease : undefined,
      duration: tween.vars.duration!,
      stagger: typeof tween.vars.stagger === 'number' ? tween.vars.stagger : undefined,
    }))
}

function expectTweens(seen: Awaited<ReturnType<typeof tweensOf>>, wanted: Expected[]) {
  for (const want of wanted) {
    const found = seen.some(tween => tween.part === want.part && tween.ease === want.ease && tween.duration === want.duration && tween.stagger === want.stagger)
    expect(found, `${want.part} ${want.ease} ${want.duration}${want.stagger === undefined ? '' : ` / ${want.stagger}`}`).toBe(true)
  }
}

const BANNER = { part: 'banner', ease: 'back.out(2.2)', duration: 0.55 }
const SHARE = { part: 'share', ease: 'back.out(2)', duration: 0.35 }
const TRIP = { part: 'compibert', ease: 'power2.in', duration: 0.38 }
const GET_UP = { part: 'compibert', ease: 'back.out(2)', duration: 0.45 }

// The sound and the picture read one function (#743, spec #718): each cue of the ceremony's plan is the start of the tween it belongs to, read off the
// built timeline, so a change of a tween's position that `ceremonyTimeline` does not know breaks here. The one test that reads the tweens for the sound.
describe('the ceremony\'s cues sound where their tweens start (#743)', () => {
  const ms = (seconds: number) => Math.round(seconds * 1000)

  it.each([[2, 'trip'], [2, 'bonk'], [4, 'trip'], [4, 'bonk']] as const)('for %i Parties and one Winner, the %s', async (parties, gag) => {
    const seen = await tweensOf({ rows: parties - 1, winners: 1 }, parties, gag)
    const cues = ceremonyCuePlan({ startsAt: 0, shape: { partyCount: parties, winners: 1, gag, grid: false }, reducedMotion: false })
    const cuesOf = (id: string) => cues.filter(cue => cue.id === id)
    const m = ceremonyTimeline({ partyCount: parties, winners: 1, gag, grid: false })

    // The banner's drop.
    expect(ms(seen.find(tween => tween.part === 'banner')!.start)).toBe(cuesOf('cer-drop')[0]!.at)
    // The places: one staggered tween, row i starts at its position plus i steps.
    const rows = seen.find(tween => tween.part === 'row')!
    expect(cuesOf('cer-row')).toHaveLength(parties - 1)
    cuesOf('cer-row').forEach((cue, index) => expect(ms(rows.start + index * rows.stagger!), `row ${index}`).toBe(cue.at))
    // The run: Compibert's linear tween starts at the run's cue and ends at the moment the gag begins.
    const run = seen.find(tween => tween.part === 'compibert' && tween.ease === 'none')!
    expect(ms(run.start)).toBe(cuesOf('cer-run')[0]!.at)
    expect(ms(run.start + run.duration)).toBe(m.runEndAtMs)
    if (gag === 'trip') {
      expect(cuesOf('cer-bonk')).toEqual([])
      expect(ms(seen.find(tween => tween.part === 'compibert' && tween.ease === 'power2.in' && tween.duration === 0.38)!.start)).toBe(cuesOf('cer-trip')[0]!.at)
    }
    else {
      expect(cuesOf('cer-trip')).toEqual([])
      const fall = seen.find(tween => tween.part === 'trophy' && tween.ease === 'power2.in' && tween.duration === 0.42)!
      expect(ms(fall.start + fall.duration)).toBe(cuesOf('cer-bonk')[0]!.at)
    }
  })

  // The peak (#744): the stamp's tween is the picture of the stamp, the fanfare and the crowd; the last two have no tween of their own.
  it.each([[2, 'trip'], [2, 'bonk'], [4, 'trip'], [4, 'bonk']] as const)('has the stamp, the fanfare and the crowd at the stamp\'s tween, for %i Parties and one Winner, the %s', async (parties, gag) => {
    const seen = await tweensOf({ rows: parties - 1, winners: 1 }, parties, gag)
    const cues = ceremonyCuePlan({ startsAt: 0, shape: { partyCount: parties, winners: 1, gag, grid: false }, reducedMotion: false })
    const cuesOf = (id: string) => cues.filter(cue => cue.id === id)

    const stamp = seen.find(tween => tween.part === 'stamp' && tween.ease === 'back.out(2.4)' && tween.duration === 0.3)!
    expect(cuesOf('cer-stamp')).toHaveLength(1)
    expect(ms(stamp.start)).toBe(cuesOf('cer-stamp')[0]!.at)
    expect(cuesOf('cer-fanfare').map(cue => cue.at)).toEqual([cuesOf('cer-stamp')[0]!.at])
    expect(cuesOf('cer-crowd').map(cue => cue.at)).toEqual([cuesOf('cer-stamp')[0]!.at])
  })
})

describe('the Pokal-Lauf\'s eases and durations (04-motion § 6b, 6b-T)', () => {
  it('a sole Winner: banner, rows, card, trip, stamp, people and the share row', async () => {
    expectTweens(await tweensOf({ rows: 2, winners: 1 }, 3), [
      BANNER,
      { part: 'row', ease: 'power3.out', duration: 0.45, stagger: 0.45 },
      { part: 'card', ease: 'back.out(2)', duration: 0.4 },
      TRIP,
      GET_UP,
      { part: 'stamp', ease: 'back.out(2.4)', duration: 0.3 },
      { part: 'person', ease: 'back.out(2)', duration: 0.4, stagger: 0.08 },
      SHARE,
    ])
  })

  it('a chain of 2 with rows: plate, cards, badge, both hops, the plate\'s stamp and the people per Party', async () => {
    const seen = await tweensOf({ rows: 2, winners: 2 }, 4)

    expectTweens(seen, [
      BANNER,
      { part: 'row', ease: 'power3.out', duration: 0.45, stagger: 0.45 },
      { part: 'plate', ease: 'back.out(2)', duration: 0.3 },
      { part: 'card', ease: 'back.out(2)', duration: 0.4, stagger: 0.1 },
      { part: 'badge', ease: 'back.out(2)', duration: 0.2 },
      TRIP,
      { part: 'stamp', ease: 'back.out(2.4)', duration: 0.3 },
      // The hop to the next card: x 0.42, up 0.22, down 0.2.
      { part: 'trophy', ease: 'power1.inOut', duration: 0.42 },
      { part: 'trophy', ease: 'power2.out', duration: 0.22 },
      { part: 'trophy', ease: 'power2.in', duration: 0.2 },
      // The hop onto the plate: x 0.5, up 0.28, down 0.22.
      { part: 'trophy', ease: 'power1.inOut', duration: 0.5 },
      { part: 'trophy', ease: 'power2.out', duration: 0.28 },
      { part: 'trophy', ease: 'power2.in', duration: 0.22 },
      { part: 'plate-stamp', ease: 'back.out(2.4)', duration: 0.32 },
      // The people of each Party come in together, left to right.
      { part: 'person', ease: 'back.out(2)', duration: 0.4, stagger: 0.06 },
      SHARE,
    ])
  })

  it('a chain of 3 with the places below as chips', async () => {
    expectTweens(await tweensOf({ rows: 2, winners: 3, chips: true }, 5), [
      BANNER,
      { part: 'row', ease: 'power3.out', duration: 0.3, stagger: 0.2 },
      { part: 'badge', ease: 'back.out(2)', duration: 0.2 },
      { part: 'plate', ease: 'back.out(2)', duration: 0.3 },
    ])
  })

  it('a grid: the cards flip in 0.24, the stacks come in 0.3 apart 0.05', async () => {
    expectTweens(await tweensOf({ rows: 2, winners: 4, grid: true, chips: true }, 6), [
      BANNER,
      { part: 'row', ease: 'power3.out', duration: 0.3, stagger: 0.2 },
      { part: 'card', ease: 'back.out(2)', duration: 0.4, stagger: 0.1 },
      { part: 'stamp', ease: 'back.out(2.4)', duration: 0.24 },
      { part: 'plate-stamp', ease: 'back.out(2.4)', duration: 0.32 },
      { part: 'stack', ease: 'back.out(2)', duration: 0.3, stagger: 0.05 },
      SHARE,
    ])
  })
})
