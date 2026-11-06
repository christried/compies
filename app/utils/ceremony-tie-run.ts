import { ceremonyTimeline } from '~~/shared/ceremony'
import type { Gsap } from './gsap'

type Timeline = ReturnType<Gsap['timeline']>

// The Tie's tracks of the Pokal-Lauf (#315, spec #308, 04-motion § Award ceremony 6b-T, 12-siegerehrung-unentschieden.md): the plate, the Winners'
// cards, the trophy's hops from card to card (a chain) or its landing on the plate (a grid), and each Winner's people. A sole Winner has none of
// these; `ceremony-run.ts` calls in here when the stage has a plate, and keeps the run and both gags (up to the first landing) for itself. Every
// moment comes from `ceremonyTimeline`, never from a constant of this file, and the eases are GSAP's by name as 04-motion writes them (ADR 0015).
// Client only: it works on elements.

/** The Tie's DOM parts: `AwardCeremony.vue`'s `data-part` hooks beyond the single card's. One entry per Winner, in reading order, unless said. */
export interface TieParts {
  /** Winners stand in a grid: the trophy lands on the plate, and the cards flip from its centre outward. */
  grid: boolean
  /** The places below are chips (y 12 -> 0), not rows (x 60 -> 0). */
  chips: boolean
  plate: HTMLElement
  /** The plate's „???“ and its stamp. */
  plateFront: HTMLElement
  plateStamp: HTMLElement
  cards: HTMLElement[]
  fronts: HTMLElement[]
  backs: HTMLElement[]
  /** Each card's „SIEGER“. */
  stamps: HTMLElement[]
  /** The „=“ badges between the cards of a chain: badge i is the one to the right of card i. */
  badges: HTMLElement[]
  /** A chain: the avatars under each card, per Party. */
  parties: HTMLElement[][]
  /** A grid: the avatar stack inside each card. */
  stacks: HTMLElement[]
}

/** The tie parts in `root`, or undefined when the stage has no plate (a sole Winner). */
export function tiePartsOf(root: HTMLElement): TieParts | undefined {
  const one = (name: string) => root.querySelector<HTMLElement>(`[data-part="${name}"]`)
  const all = (name: string) => [...root.querySelectorAll<HTMLElement>(`[data-part="${name}"]`)]
  const plate = one('plate')
  if (!plate) return undefined
  const plateFront = one('plate-front')
  const plateStamp = one('plate-stamp')
  if (!plateFront || !plateStamp) return undefined
  return {
    grid: root.querySelector('[data-stage="grid"]') !== null,
    chips: root.querySelector('[data-rows="chips"]') !== null,
    plate,
    plateFront,
    plateStamp,
    cards: all('card'),
    fronts: all('front'),
    backs: all('back'),
    stamps: all('stamp'),
    badges: all('badge'),
    parties: all('party').map(party => [...party.querySelectorAll<HTMLElement>('[data-part="person"]')]),
    stacks: all('stack'),
  }
}

/** A box in px relative to the ceremony's root. */
export interface Box { left: number, top: number, width: number, height: number }

/**
 * A part's box relative to `root`: the sum of the offsets up the offset-parent chain (which ignores transforms, as the single card's does).
 * A Tie nests its cards in the plate's column, so a card's offset parent is not the root, as the single card's is.
 */
export function boxWithin(root: HTMLElement, element: HTMLElement): Box {
  let left = 0
  let top = 0
  for (let node: HTMLElement | null = element; node && node !== root; node = node.offsetParent as HTMLElement | null) {
    left += node.offsetLeft
    top += node.offsetTop
  }
  return { left, top, width: element.offsetWidth, height: element.offsetHeight }
}

/** What the Tie's stops need: where the plate and the cards are, in root px. */
export interface TieBox { grid: boolean, cards: Box[], plate: Box }

/** Where the trophy stands (its left and top; it is 48 x 52) on each card, on the plate, and the order the cards flip in a grid. */
export interface TieStops {
  cards: { x: number, y: number }[]
  plate: { x: number, y: number }
  /** The card indices from the one nearest the plate's centre to the farthest (the ripple of a grid). */
  ripple: number[]
}

const TROPHY_WIDTH = 48
const TROPHY_HEIGHT = 52

/** The trophy's stops: 40 px above a card's top edge, as on the single card; on the plate's centre. Pure. */
export function tieStops({ cards, plate }: TieBox): TieStops {
  const centre = (box: Box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
  const at = centre(plate)
  const distance = (box: Box) => Math.hypot(centre(box).x - at.x, centre(box).y - at.y)
  return {
    cards: cards.map(card => ({ x: card.left + card.width / 2 - TROPHY_WIDTH / 2, y: card.top - 40 })),
    plate: { x: at.x - TROPHY_WIDTH / 2, y: at.y - TROPHY_HEIGHT / 2 },
    ripple: cards.map((_, index) => index).sort((a, b) => distance(cards[a]!) - distance(cards[b]!) || a - b),
  }
}

/** The options of the run that the Tie's tracks read. */
export interface TieRunOptions {
  partyCount: number
  winners: number
  grid: boolean
  gag: 'trip' | 'bonk'
}

/** What the tracks need of the run: its timeline, its trophy and the stops. */
export interface TieRun {
  tl: Timeline
  tie: TieParts
  rows: HTMLElement[]
  trophy: HTMLElement
  stops: TieStops
  options: TieRunOptions
  /** A burst of confetti: the moment (ms) and where. The layer decides whether the viewer saw it live. */
  burst: (burst: { atMs: number, at: 'stamp' } | { atMs: number, at: 'hop', index: number }) => void
}

const sec = (ms: number) => ms / 1000

/** The Tie's first frame: everything out of the way, the card fronts up, the stamps off. */
export function setTie(gsap: Gsap, { tie, rows, people }: { tie: TieParts, rows: HTMLElement[], people: HTMLElement[] }) {
  gsap.set(rows, tie.chips ? { y: 12, opacity: 0 } : { x: 60, opacity: 0 })
  gsap.set(tie.plate, { scaleX: 0.6, opacity: 0, y: 0 })
  gsap.set(tie.cards, { scale: 0.9, opacity: 0, y: 0 })
  gsap.set(tie.fronts, { opacity: 1 })
  gsap.set(tie.backs, { opacity: 0 })
  gsap.set(tie.stamps, { opacity: 0, scale: 2.4, rotation: -8 })
  gsap.set(tie.plateFront, { opacity: 1 })
  gsap.set(tie.plateStamp, { opacity: 0, scale: 2.4, rotation: -3 })
  gsap.set(tie.badges, { scale: 0 })
  gsap.set(people, { opacity: 0, scale: 0, y: 18 })
  gsap.set(tie.stacks, { opacity: 0, scale: 0.6 })
}

/** The places below, the plate and the cards come in (04-motion 6b-T: rows or chips, then plate, cards and badges at `cardAtMs`). */
export function addTieEntrance({ tl, tie, rows, options }: TieRun) {
  const { rowsAtMs, cardAtMs } = ceremonyTimeline(options.partyCount, options.gag, options.winners, options.grid)
  const last = [...rows].reverse()
  if (tie.chips) tl.to(last, { y: 0, opacity: 1, duration: 0.3, ease: 'power3.out', stagger: 0.2 }, sec(rowsAtMs))
  else tl.to(last, { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out', stagger: 0.45 }, sec(rowsAtMs))
  const cardAt = sec(cardAtMs)
  tl.to(tie.plate, { scaleX: 1, opacity: 1, duration: 0.3, ease: 'back.out(2)' }, cardAt)
  tl.to(tie.cards, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)', stagger: 0.1 }, cardAt)
  tie.badges.forEach((badge, index) => tl.to(badge, { scale: 1, duration: 0.2, ease: 'back.out(2)' }, cardAt + 0.1 * (index + 1)))
}

/** One card lands: it bumps and flips, its „SIEGER“ stamps. */
function flip(tl: Timeline, tie: TieParts, index: number, at: number, stampAfter: number, bump: boolean) {
  if (bump) tl.to(tie.cards[index]!, { y: 6, duration: 0.08, yoyo: true, repeat: 1 }, at)
  tl.to(tie.fronts[index]!, { opacity: 0, duration: 0.15 }, at)
  tl.to(tie.backs[index]!, { opacity: 1, duration: 0.15 }, at)
  tl.to(tie.stamps[index]!, { opacity: 1, scale: 1, duration: bump ? 0.3 : 0.24, ease: 'back.out(2.4)' }, at + stampAfter)
}

/**
 * From the first landing on: a chain hops from card to card and onto the plate, a grid lands on the plate and flips from its centre out. The
 * plate bumps, stamps „Unentschieden“ and the trophy leaves; then each Winner's people come in. The first landing is the run's (card 1, or the
 * plate in a grid): `ceremony-run.ts` has flown the trophy there.
 */
export function addTieLanding({ tl, tie, trophy, stops, options, burst }: TieRun) {
  const { winners, grid } = options
  const moments = ceremonyTimeline(options.partyCount, options.gag, winners, grid)
  const plateAt = sec(moments.plateAtMs)

  if (!grid) {
    for (let index = 0; index < winners; index++) {
      const land = sec(moments.landAtMs) + 0.54 * index
      flip(tl, tie, index, land, 0.1, true)
      tl.call(() => burst({ atMs: Math.round(land * 1000), at: 'hop', index }), undefined, land)
      const here = stops.cards[index]!
      const spin = 720 + 360 * (index + 1)
      const hopAt = land + 0.12
      if (index < winners - 1) {
        const next = stops.cards[index + 1]!
        tl.to(trophy, { x: next.x, duration: 0.42, ease: 'power1.inOut' }, hopAt)
        tl.to(trophy, { y: here.y - 70, duration: 0.22, ease: 'power2.out' }, hopAt)
        tl.to(trophy, { y: next.y, duration: 0.2, ease: 'power2.in' }, hopAt + 0.22)
        tl.to(trophy, { rotation: spin, duration: 0.42, ease: 'power1.inOut' }, hopAt)
      }
      else {
        tl.to(trophy, { x: stops.plate.x, duration: 0.5, ease: 'power1.inOut' }, hopAt)
        tl.to(trophy, { y: here.y - 110, duration: 0.28, ease: 'power2.out' }, hopAt)
        tl.to(trophy, { y: stops.plate.y, duration: 0.22, ease: 'power2.in' }, hopAt + 0.28)
        tl.to(trophy, { rotation: spin, duration: 0.5, ease: 'power1.inOut' }, hopAt)
      }
    }
  }
  else {
    // The cards flip from the plate's centre outward, 0.06 s apart; no confetti per card.
    stops.ripple.forEach((card, rank) => flip(tl, tie, card, plateAt + 0.12 + 0.06 * rank, 0, false))
  }

  // The plate lands: it bumps, the trophy leaves, „???“ becomes the stamp.
  tl.to(tie.plate, { y: 4, duration: 0.08, yoyo: true, repeat: 1 }, plateAt)
  tl.to(trophy, { opacity: 0, duration: 0.2 }, plateAt + 0.1)
  const stampAt = sec(moments.stampAtMs)
  tl.to(tie.plateFront, { opacity: 0, duration: 0.15 }, stampAt)
  tl.to(tie.plateStamp, { opacity: 1, scale: 1, duration: 0.32, ease: 'back.out(2.4)' }, stampAt)
  tl.call(() => burst({ atMs: moments.stampAtMs, at: 'stamp' }), undefined, stampAt)

  // Their people: a chain per Party from left to right, 0.2 s apart; a grid each stack in the ripple's order.
  const membersAt = sec(moments.membersAtMs)
  if (!grid) {
    tie.parties.forEach((party, index) => tl.to(party, { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'back.out(2)', stagger: 0.06 }, membersAt + 0.2 * index))
  }
  else {
    tl.to(stops.ripple.map(card => tie.stacks[card]!), { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)', stagger: 0.05 }, membersAt)
  }
}
