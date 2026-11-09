import type { CeremonyLayout } from './ceremony'

// The Award ceremony's sizes (#315, #328): a Tie's sizes, number for number from the artboard's frame() in Siegerehrung Unentschieden.dc.html
// (card width and height, strip, name, points and stamp font, stamp offset, avatar, cell, gap, name font, „=“ badge, the gap it takes and its
// icon, the points' padding), the grid's, and the plate's. They sit here, not in AwardCeremony.vue, so the group's width is pinned by a test
// (#328). Every key names what it sizes, in px unless it says otherwise.

/** A chain's sizes: a Winner's card, and its people below it (`chainSizes`). */
interface ChainSizes {
  /** The card's width. */
  cardWidth: number
  /** The card's height. */
  cardHeight: number
  /** The card's Team-colour strip. */
  stripHeight: number
  /** The Party name in the strip. */
  nameFontSize: number
  /** The points. */
  pointsFontSize: number
  /** „SIEGER“ on the card. */
  stampFontSize: number
  /** The stamp's right and bottom offset from the card's corner. */
  stampOffset: number
  /** A person's picture. */
  avatarSize: number
  /** A person's cell: the picture's column under the card. */
  cellWidth: number
  /** The column gap between two cells (the row gap is 10 px in the markup). */
  cellGapX: number
  /** A person's name under the picture. */
  personNameFontSize: number
  /** The „=“ badge's circle. */
  badgeSize: number
  /** The room the badge takes between two cards. */
  badgeGap: number
  /** The „=“ icon. */
  badgeIconSize: number
  /** The points' padding, a CSS shorthand as the artboard writes it (vertical, then horizontal). */
  pointsPadding: string
  /** The space between a card and the people below it. */
  peopleGap: number
}

/** A grid's sizes: a compact card of a Tie, and the stack of its people on the card's back (`gridSizes`). */
interface GridSizes {
  /** The card's width. */
  cardWidth: number
  /** The card's height. */
  cardHeight: number
  /** The card's Team-colour strip. */
  stripHeight: number
  /** The Party name in the strip. */
  nameFontSize: number
  /** The points. */
  pointsFontSize: number
  /** „SIEGER“ on the card. */
  stampFontSize: number
  /** A stack picture. */
  avatarSize: number
  /** How far a stack picture overlaps the one before it. */
  avatarOverlap: number
  /** The gap between two cards in the grid. */
  cardGap: number
  /** The gap between the points row and the stack on the card's back. */
  backGap: number
}

/** The plate over a Tie's Winners: „Platz 1“ (`plateSizes`). */
interface PlateSizes {
  /** The plate's height. */
  height: number
  /** The „Platz 1“ label. */
  labelFontSize: number
  /** The plate's stamp. */
  stampFontSize: number
}

const CHAIN_WIDE_2 = { cardWidth: 240, cardHeight: 160, stripHeight: 40, nameFontSize: 16, pointsFontSize: 32, stampFontSize: 20, stampOffset: 12, avatarSize: 56, cellWidth: 68, cellGapX: 10, personNameFontSize: 13, badgeSize: 40, badgeGap: 56, badgeIconSize: 18, pointsPadding: '12px 14px', peopleGap: 14 } as const satisfies ChainSizes
const CHAIN_WIDE_3 = { cardWidth: 220, cardHeight: 140, stripHeight: 36, nameFontSize: 15, pointsFontSize: 28, stampFontSize: 18, stampOffset: 10, avatarSize: 48, cellWidth: 60, cellGapX: 8, personNameFontSize: 12, badgeSize: 36, badgeGap: 48, badgeIconSize: 16, pointsPadding: '11px 13px', peopleGap: 14 } as const satisfies ChainSizes
const CHAIN_PHONE = { cardWidth: 160, cardHeight: 120, stripHeight: 32, nameFontSize: 13, pointsFontSize: 24, stampFontSize: 15, stampOffset: 8, avatarSize: 44, cellWidth: 50, cellGapX: 5, personNameFontSize: 12, badgeSize: 28, badgeGap: 34, badgeIconSize: 14, pointsPadding: '9px 11px', peopleGap: 10 } as const satisfies ChainSizes
const GRID_WIDE = { cardWidth: 236, cardHeight: 120, stripHeight: 36, nameFontSize: 15, pointsFontSize: 22, stampFontSize: 13, avatarSize: 28, avatarOverlap: 8, cardGap: 14, backGap: 10 } as const satisfies GridSizes
const GRID_PHONE = { cardWidth: 171, cardHeight: 96, stripHeight: 30, nameFontSize: 13, pointsFontSize: 18, stampFontSize: 11, avatarSize: 24, avatarOverlap: 7, cardGap: 12, backGap: 7 } as const satisfies GridSizes
const PLATE_WIDE = { height: 40, labelFontSize: 15, stampFontSize: 20 } as const satisfies PlateSizes
const PLATE_PHONE = { height: 34, labelFontSize: 12, stampFontSize: 15 } as const satisfies PlateSizes

/** A chain's sizes: a phone's, else 2 Winners' or 3 Winners' on a wide screen. */
export function chainSizes(roomy: boolean, winners: number) {
  return !roomy ? CHAIN_PHONE : winners === 2 ? CHAIN_WIDE_2 : CHAIN_WIDE_3
}

/** A grid's sizes: wide or phone. */
export function gridSizes(roomy: boolean) {
  return roomy ? GRID_WIDE : GRID_PHONE
}

/** The plate's sizes: wide or phone. */
export function plateSizes(roomy: boolean) {
  return roomy ? PLATE_WIDE : PLATE_PHONE
}

/** The width of the Winner group, which the plate takes (#315): a chain's cards and their „=“ gaps, or a grid's columns. */
export function groupWidth(layout: Pick<CeremonyLayout, 'stage' | 'cols'>, winners: number, roomy: boolean): number {
  if (layout.stage === 'chain') {
    const chain = chainSizes(roomy, winners)
    return winners * chain.cardWidth + (winners - 1) * chain.badgeGap
  }
  const grid = gridSizes(roomy)
  const columns = Math.min(winners, layout.cols)
  return columns * grid.cardWidth + (columns - 1) * grid.cardGap
}
