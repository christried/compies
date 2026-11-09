import type { CeremonyLayout } from './ceremony'

// The Award ceremony's sizes (#315, #328, #364): every number that changes with `roomy` (a phone below md, as AppShell's side panel), in one
// place, `ceremonySizes`. The single card's people, a Tie's chain, grid and plate (number for number from the artboard's frame() in Siegerehrung
// Unentschieden.dc.html: card width and height, strip, name, points and stamp font, stamp offset, avatar, cell, gap, name font, „=“ badge, the
// gap it takes and its icon, the points' padding), the width of the Winner group, Compibert, the ground under the content and the confetti.
// They sit here, not in AwardCeremony.vue, so a test pins them (#328, #364). Every key names what it sizes, in px unless it says otherwise.

/** A chain's sizes: a Winner's card, and its people below it. */
interface ChainSizes {
  /** The discriminator the template narrows on. */
  kind: 'chain'
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

/** A grid's sizes: a compact card of a Tie, and the stack of its people on the card's back. */
interface GridSizes {
  /** The discriminator the template narrows on. */
  kind: 'grid'
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

/** The plate over a Tie's Winners: „Platz 1“. */
interface PlateSizes {
  /** The plate's height. */
  height: number
  /** The „Platz 1“ label. */
  labelFontSize: number
  /** The plate's stamp. */
  stampFontSize: number
}

const CHAIN_WIDE_2 = { kind: 'chain', cardWidth: 240, cardHeight: 160, stripHeight: 40, nameFontSize: 16, pointsFontSize: 32, stampFontSize: 20, stampOffset: 12, avatarSize: 56, cellWidth: 68, cellGapX: 10, personNameFontSize: 13, badgeSize: 40, badgeGap: 56, badgeIconSize: 18, pointsPadding: '12px 14px', peopleGap: 14 } as const satisfies ChainSizes
const CHAIN_WIDE_3 = { kind: 'chain', cardWidth: 220, cardHeight: 140, stripHeight: 36, nameFontSize: 15, pointsFontSize: 28, stampFontSize: 18, stampOffset: 10, avatarSize: 48, cellWidth: 60, cellGapX: 8, personNameFontSize: 12, badgeSize: 36, badgeGap: 48, badgeIconSize: 16, pointsPadding: '11px 13px', peopleGap: 14 } as const satisfies ChainSizes
const CHAIN_PHONE = { kind: 'chain', cardWidth: 160, cardHeight: 120, stripHeight: 32, nameFontSize: 13, pointsFontSize: 24, stampFontSize: 15, stampOffset: 8, avatarSize: 44, cellWidth: 50, cellGapX: 5, personNameFontSize: 12, badgeSize: 28, badgeGap: 34, badgeIconSize: 14, pointsPadding: '9px 11px', peopleGap: 10 } as const satisfies ChainSizes
const GRID_WIDE = { kind: 'grid', cardWidth: 236, cardHeight: 120, stripHeight: 36, nameFontSize: 15, pointsFontSize: 22, stampFontSize: 13, avatarSize: 28, avatarOverlap: 8, cardGap: 14, backGap: 10 } as const satisfies GridSizes
const GRID_PHONE = { kind: 'grid', cardWidth: 171, cardHeight: 96, stripHeight: 30, nameFontSize: 13, pointsFontSize: 18, stampFontSize: 11, avatarSize: 24, avatarOverlap: 7, cardGap: 12, backGap: 7 } as const satisfies GridSizes
const PLATE_WIDE = { height: 40, labelFontSize: 15, stampFontSize: 20 } as const satisfies PlateSizes
const PLATE_PHONE = { height: 34, labelFontSize: 12, stampFontSize: 15 } as const satisfies PlateSizes

// The tables' own literal types, so a picture's size stays the union `CeremonyPersonCell` takes (a plain `ChainSizes` would say `number`).
type ChainTable = typeof CHAIN_WIDE_2 | typeof CHAIN_WIDE_3 | typeof CHAIN_PHONE
type GridTable = typeof GRID_WIDE | typeof GRID_PHONE

/** The single card's people (a sole Winner): the card's own numbers stay Tailwind classes in CeremonyWinnerCard.vue. */
interface SingleSizes {
  /** The discriminator the template narrows on. */
  kind: 'single'
  /** A person's picture under the card: 80 wide, 64 phone (`CeremonyPersonCell`'s `size` union). */
  avatarSize: 80 | 64
  /** The cell is a little wider than the picture: `avatarSize` + 16. */
  cellWidth: number
  /** The people row's max width: three cells and two 10 px gaps. */
  peopleMaxWidth: number
}

export interface CeremonySizes {
  /** By `layout.stage`; `kind` is the discriminator the template narrows on. */
  stage: SingleSizes | ChainTable | GridTable
  /** The Tie's plate (wide or phone). Returned for every layout; only a Tie draws it. */
  plate: PlateSizes
  /** The Winner group's width, which the plate takes (#315): a chain's cards and „=“ gaps, or a grid's columns. `null` for the single stage (no plate). */
  groupWidth: number | null
  /** Compibert's size: 150 wide, 120 phone. */
  compibert: number
  ground: {
    /** The stage's bottom padding: Compibert's track on a wide screen, track plus the share row's room (44 + 18) on a phone (#314). */
    paddingBottom: number
    /** The share row's `bottom`: 34 on a wide screen, the track on a phone. */
    shareBottom: number
  }
  confetti: {
    /** The stamp's burst (the sole Winner's, the Tie's plate's): 40 wide, 20 phone. */
    stamp: number
    /** The trophy landing on a card of a chain: 14 wide, 8 phone (6b-T). */
    card: number
  }
}

/** The ground strip under Compibert's feet (the full pose is 404 : 344, the strip 34). */
const GROUND_STRIP = 34
/** The share row's room on a phone (#314): its height (AppButton's `md`, 44 px) and the stage's gap above it. */
const SHARE_ROW_ROOM = 44 + 18

/** The sizes of the single card's people: wide or phone. The cell is a little wider than the picture, and three cells make a row. */
function singleSizes(roomy: boolean): SingleSizes {
  const avatarSize = roomy ? 80 : 64
  const cellWidth = avatarSize + 16
  return { kind: 'single', avatarSize, cellWidth, peopleMaxWidth: cellWidth * 3 + 20 }
}

/** A chain's sizes: a phone's, else 2 Winners' or 3 Winners' on a wide screen. */
function chainSizes(roomy: boolean, winners: number) {
  return !roomy ? CHAIN_PHONE : winners === 2 ? CHAIN_WIDE_2 : CHAIN_WIDE_3
}

/**
 * The stage's sizes for `winners` Winners, which `layout` (`ceremonyLayout`) lays out, wide (`roomy`) or on a phone. The plate, Compibert, the
 * ground and the confetti do not depend on the stage (#364).
 */
export function ceremonySizes(roomy: boolean, layout: Pick<CeremonyLayout, 'stage' | 'cols'>, winners: number): CeremonySizes {
  const stage: SingleSizes | ChainTable | GridTable = layout.stage === 'single' ? singleSizes(roomy) : layout.stage === 'chain' ? chainSizes(roomy, winners) : roomy ? GRID_WIDE : GRID_PHONE
  const columns = Math.min(winners, layout.cols)
  // The Winner group, which the plate takes (#315): a chain's cards and their „=“ gaps, or a grid's columns.
  const groupWidth = stage.kind === 'chain'
    ? winners * stage.cardWidth + (winners - 1) * stage.badgeGap
    : stage.kind === 'grid' ? columns * stage.cardWidth + (columns - 1) * stage.cardGap : null
  const compibert = roomy ? 150 : 120
  // Compibert's room under the content: his height (the full pose is 404 : 344) and the ground strip.
  const track = Math.round(compibert * 344 / 404) + GROUND_STRIP
  return {
    stage,
    plate: roomy ? PLATE_WIDE : PLATE_PHONE,
    groupWidth,
    compibert,
    ground: {
      // The stage's bottom padding, Compibert's track on a wide screen and the track plus the share row's room on a phone (#314). It is set from
      // the first frame, so the stage keeps its height when the buttons appear mid-run.
      paddingBottom: roomy ? track : track + SHARE_ROW_ROOM,
      // On a wide screen the share row stands in the corner the stage leaves free, 34 px up; on a phone, 18 px over Compibert's box (his track).
      shareBottom: roomy ? 34 : track,
    },
    // Confetti, from just above a card's or the plate's top centre (04-motion § Confetti): a sole Winner's stamp and a Tie's plate stamp 40 pieces
    // on a desktop, 20 on a phone; the trophy landing on a card of a chain 14, on a phone 8 (6b-T).
    confetti: roomy ? { stamp: 40, card: 14 } : { stamp: 20, card: 8 },
  }
}
