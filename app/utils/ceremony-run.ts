import { ceremonyTimeline, CEREMONY_ROW_MS, type CeremonyShape, type RunShape } from '~~/shared/ceremony'
import type { RigState } from './compibert-rig'
import { addTieEntrance, addTieLanding, boxWithin, setTie, tiePartsOf, tieStops, type TieBox, type TieParts, type TieStops } from './ceremony-tie-run'
import type { Gsap } from './gsap'

// The Pokal-Lauf of the Award ceremony (#312, spec #308, 04-motion § Award ceremony 6b, reference AwardCeremony.dc.html play()): one paused
// GSAP timeline on the ceremony's DOM parts, which the layer moves with the server's clock (ADR 0013, ADR 0015). The moments come from
// `ceremonyTimeline` (shared with the server's `endsAt`); the eases are GSAP's by name as 04-motion writes them, not `--cp-ease-*` tokens
// (CODING_STANDARDS § Motion: inside the GSAP timelines the eases are GSAP's names; `ceremony-run-tweens.test.ts` reads them off the timeline).
// Client only: it works on elements. A Tie's own tracks (the plate, the hops from card to card, each Winner's people) are in
// `ceremony-tie-run.ts` (#315); this file runs the banner, the run and both gags for every stage.

/** The DOM parts the run moves: `AwardCeremony.vue`'s `data-part` hooks. */
export interface RunParts {
  banner: HTMLElement
  rows: HTMLElement[]
  card: HTMLElement
  front: HTMLElement
  back: HTMLElement
  stamp: HTMLElement
  people: HTMLElement[]
  compibert: HTMLElement
  trophy: HTMLElement
  /** The end frame's button row (#314): it rises in after the landing, in a Tie after the plate. */
  share: HTMLElement
  /** The plate and the cards of a Tie (#315): `card`, `front`, `back` and `stamp` above are then the first Winner's. */
  tie?: TieParts
}

/** What `runGeometry` needs, in px relative to the ceremony's root (the stage): measured with offset sizes, which ignore transforms. */
export interface RunBox {
  stage: { width: number, height: number }
  card: { left: number, top: number, width: number }
  compibert: { width: number, height: number }
  /** A Tie's plate and cards (#315): the first landing is on card 1 of a chain, on the plate's centre in a grid. */
  tie?: TieBox
}

export interface Geometry {
  /** Where Compibert stops (his box's left, in stage px). */
  stopX: number
  /** Where the trophy lands: its left and top (it is 48 wide). */
  cardX: number
  cardY: number
  /** His box's top when he stands on the ground. */
  groundY: number
  /** The trophy's left when he stands at `x`, and its top: in his hand. */
  handX: (x: number) => number
  handY: number
  /** A Tie's stops for the trophy (#315): on each card, on the plate. */
  tie?: TieStops
}

const TROPHY_WIDTH = 48
/** His box sits this far above the stage's bottom (the ground strip). */
const GROUND_GAP = 16
/** Where he starts, left of the stage. */
const START_X = -260
const clamp = (min: number, max: number, value: number) => Math.min(max, Math.max(min, value))

/** The run's stops on a stage: the reference's maths (play()), pure. */
export function runGeometry({ stage, card, compibert, tie: box }: RunBox): Geometry {
  // A Tie's first landing: card 1 of a chain, the plate's centre in a grid; the stops of the other cards and of the plate follow (#315).
  const tie = box && tieStops(box)
  const target = tie && box.grid ? tie.plate : tie ? tie.cards[0]! : undefined
  const cardX = target ? target.x : card.left + card.width / 2 - TROPHY_WIDTH / 2
  const cardY = target ? target.y : card.top - 40
  const groundY = stage.height - GROUND_GAP - compibert.height
  const stopX = clamp(10, stage.width - compibert.width - 10, Math.min(cardX - compibert.width * 0.9, stage.width * 0.45 - compibert.width / 2))
  return { stopX, cardX, cardY, groundY, handX: x => x + compibert.width * 0.62, handY: groundY + compibert.height * 0.3, tie }
}

/** The ceremony's parts in `root`, or null when a part is missing. */
export function runPartsOf(root: HTMLElement): RunParts | null {
  const one = (name: string) => root.querySelector<HTMLElement>(`[data-part="${name}"]`)
  const all = (name: string) => [...root.querySelectorAll<HTMLElement>(`[data-part="${name}"]`)]
  const banner = one('banner')
  const card = one('card')
  const front = one('front')
  const back = one('back')
  const stamp = one('stamp')
  const compibert = one('compibert')
  const trophy = one('trophy')
  const share = one('share')
  if (!banner || !card || !front || !back || !stamp || !compibert || !trophy || !share) return null
  return { banner, rows: all('row'), card, front, back, stamp, people: all('person'), compibert, trophy, share, tie: tiePartsOf(root) }
}

/** Measures the stage, the card and Compibert's box relative to `root`, which is the offset parent of every part of a single Winner's stage. */
export function measureRun(root: HTMLElement, parts: RunParts): RunBox {
  const { tie } = parts
  const box = {
    stage: { width: root.offsetWidth, height: root.offsetHeight },
    card: { left: parts.card.offsetLeft, top: parts.card.offsetTop, width: parts.card.offsetWidth },
    compibert: { width: parts.compibert.offsetWidth, height: parts.compibert.offsetHeight },
  }
  if (!tie) return box
  const cards = tie.cards.map(card => boxWithin(root, card))
  return { ...box, card: cards[0]!, tie: { grid: tie.grid, cards, plate: boxWithin(root, tie.plate) } }
}

/** The bonk: he cheers while the trophy flies up and falls (.5 + .42 s), then is confused. */
const BONK_CHEER_MS = 920

/**
 * The pose Compibert's rig must hold `elapsedMs` into the run. The timeline's calls change it as the clock crosses them; a late joiner,
 * a returning tab and a skip set it with this instead, because a seek past a call does not fire it.
 */
export function ceremonyRigState(elapsedMs: number, shape: CeremonyShape): RigState {
  const { gag } = shape
  const { runAtMs, runEndAtMs, getUpAtMs, endMs } = ceremonyTimeline(shape)
  if (elapsedMs < runAtMs) return 'idle'
  if (elapsedMs < runEndAtMs) return 'run'
  if (elapsedMs >= endMs) return 'dance'
  if (elapsedMs >= getUpAtMs) return 'laugh'
  if (gag === 'trip') return 'suspense'
  return elapsedMs < runEndAtMs + BONK_CHEER_MS ? 'cheer' : 'confused'
}

/** A burst of confetti (#315): the stamp of the card or the plate, or the trophy landing on card `index` of a chain. `atMs` is its moment on the timeline. */
export type Burst = { atMs: number, at: 'stamp' } | { atMs: number, at: 'hop', index: number }

/** The run's shape (the Winner count and the grid both change the timeline, #315) and the layer's callbacks. */
export interface RunOptions extends RunShape {
  /** The timeline's calls: the pose Compibert's rig takes as the clock crosses a moment. */
  rigState: (state: RigState) => void
  /** A burst of confetti. The layer decides whether this viewer saw it live. */
  onBurst: (burst: Burst) => void
}

/**
 * Builds the Pokal-Lauf on `parts`: set to its first frame, paused, `endMs` long. Every tween runs in timeline order (`overwrite: false`,
 * although `loadGsap` sets `'auto'`): auto decides by what is active at first render, so a seek straight to a late time could resolve
 * differently from playing through. The caller moves it with `time()`; it never plays on GSAP's ticker.
 */
export function buildRun(gsap: Gsap, parts: RunParts, geometry: Geometry, { partyCount, winners, grid, gag, rigState, onBurst }: RunOptions) {
  const { banner, rows, card, front, back, stamp, people, compibert, trophy, share, tie } = parts
  const { stopX, cardX, cardY, groundY, handX, handY } = geometry
  const moments = ceremonyTimeline({ partyCount, gag, winners, grid })
  const sec = (ms: number) => ms / 1000
  const rowStep = sec(CEREMONY_ROW_MS)
  const t0 = sec(moments.runAtMs)
  const t1 = sec(moments.runEndAtMs)
  const land = sec(moments.landAtMs)
  const end = sec(moments.endMs)

  gsap.set(banner, { y: -140, rotation: -4 })
  if (tie) {
    setTie(gsap, { tie, rows, people })
  }
  else {
    gsap.set(rows, { x: 60, opacity: 0 })
    gsap.set(card, { scale: 0.9, opacity: 0, y: 0 })
    gsap.set(front, { opacity: 1 })
    gsap.set(back, { opacity: 0 })
    gsap.set(stamp, { opacity: 0, scale: 2.4, rotation: -8 })
    gsap.set(people, { opacity: 0, scale: 0, y: 18 })
  }
  gsap.set(compibert, { x: START_X, rotation: 0, transformOrigin: '62% 96%' })
  gsap.set(trophy, { opacity: 0, rotation: 0 })
  // `autoAlpha` also sets `visibility`, so a row that has not risen yet is neither focusable nor read.
  gsap.set(share, { autoAlpha: 0, y: 16 })

  const tl = gsap.timeline({ paused: true, defaults: { overwrite: false } })
  const state = (s: RigState, at: number) => tl.call(() => rigState(s), undefined, at)
  // A Tie's tracks (#315); geometry.tie is there whenever the parts have a plate.
  const tieRun = tie && geometry.tie ? { tl, tie, rows, trophy, stops: geometry.tie, options: { partyCount, winners, grid, gag }, burst: onBurst } : undefined

  tl.to(banner, { y: 0, duration: 0.55, ease: 'back.out(2.2)' }, 0)
  if (tieRun) {
    addTieEntrance(tieRun)
  }
  else {
    tl.to([...rows].reverse(), { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out', stagger: rowStep }, sec(moments.rowsAtMs))
    tl.to(card, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' }, sec(moments.cardAtMs))
  }

  // The run: Compibert in from the left with the trophy in his hand, bobbing.
  tl.set(trophy, { opacity: 1, x: handX(START_X), y: handY }, t0)
  state('run', t0)
  tl.to(compibert, { x: stopX, duration: sec(moments.runEndAtMs - moments.runAtMs), ease: 'none' }, t0)
  tl.to(trophy, { x: handX(stopX), duration: sec(moments.runEndAtMs - moments.runAtMs), ease: 'none' }, t0)
  tl.to(trophy, { y: handY - 7, duration: 0.15, yoyo: true, repeat: 5, ease: 'sine.inOut' }, t0)

  if (gag === 'trip') {
    state('suspense', t1)
    tl.to(compibert, { rotation: 78, x: stopX + 46, duration: 0.38, ease: 'power2.in' }, t1)
    tl.to(trophy, { x: cardX, duration: 0.75, ease: 'power1.out' }, t1 + 0.05)
    tl.to(trophy, { y: cardY - 80, duration: 0.45, ease: 'power2.out' }, t1 + 0.05)
    tl.to(trophy, { y: cardY, duration: 0.3, ease: 'power2.in' }, t1 + 0.5)
    tl.to(trophy, { rotation: 720, duration: 0.75, ease: 'power1.out' }, t1 + 0.05)
    tl.to(compibert, { rotation: 0, x: stopX, duration: 0.45, ease: 'back.out(2)' }, sec(moments.getUpAtMs))
  }
  else {
    state('cheer', t1)
    tl.to(trophy, { y: handY - 170, rotation: 360, duration: 0.5, ease: 'power2.out' }, t1)
    tl.to(trophy, { y: groundY + 6, duration: 0.42, ease: 'power2.in' }, t1 + 0.5)
    state('confused', t1 + 0.92)
    tl.to(trophy, { x: cardX, duration: 0.7, ease: 'power1.inOut' }, t1 + 1.5)
    tl.to(trophy, { y: Math.min(cardY, groundY) - 90, duration: 0.38, ease: 'power2.out' }, t1 + 1.5)
    tl.to(trophy, { y: cardY, duration: 0.32, ease: 'power2.in' }, t1 + 1.88)
    tl.to(trophy, { rotation: 720, duration: 0.7 }, t1 + 1.5)
  }

  // The landing: the card bumps and flips, the stamp lands, then his people pop in and he laughs, then dances.
  if (tieRun) {
    addTieLanding(tieRun)
  }
  else {
    tl.to(card, { y: 6, duration: 0.08, yoyo: true, repeat: 1 }, land)
    tl.to(front, { opacity: 0, duration: 0.15 }, land)
    tl.to(back, { opacity: 1, duration: 0.15 }, land)
    tl.to(trophy, { opacity: 0, duration: 0.2 }, land + 0.1)
    tl.to(stamp, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2.4)' }, sec(moments.stampAtMs))
    tl.call(() => onBurst({ atMs: moments.stampAtMs, at: 'stamp' }), undefined, sec(moments.stampAtMs))
    tl.to(people, { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'back.out(2)', stagger: 0.08 }, sec(moments.membersAtMs))
  }
  state('laugh', sec(moments.getUpAtMs))
  // The end frame's buttons: for a Tie 1.4 s after the plate (`shareAtMs` hangs on it), one tween for every stage (#314, #315).
  tl.to(share, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'back.out(2)' }, sec(moments.shareAtMs))
  state('dance', end)
  tl.set({}, {}, end)
  return tl
}
