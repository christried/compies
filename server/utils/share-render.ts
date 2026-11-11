import { initWasm, Resvg } from '@resvg/resvg-wasm'
import satori from 'satori'
import type { ShareBand, ShareGameRow, ShareGames, ShareImageModel, ShareName, SharePoints, ShareStandings, ShareStandingsRow, ShareTiePanel, ShareWinnerPanel } from '../../shared/share-image'
import { SURFACE } from '../../shared/team-colors'
import { teamSymbol } from '../../shared/team-marks'
import { SHARE_FONTS, type ShareAssets } from './share-assets'

// Draws a ShareImageModel (#313, the „Anzeigetafel“ since #510): Satori lays a flex-only tree out as SVG, resvg (WebAssembly) turns that
// into a PNG. It decides nothing the model could decide; it ports note 14-share-image-redesign.md (and the reference ShareImage.dc.html,
// variant `b`) number for number. Satori's limits (§ Satori check): every div is a flex container, spans hold text only, sizes in px or %,
// hex colours, solid borders, no gradient, shadow, filter or transform; Compibert and the sunburst are the only absolute elements.
// Nothing is stored or cached here but the fonts' parse and resvg's initialised WebAssembly, which are not Event data.

const INK = '#151515'
const MUTED = '#5d5650'
const CARD = SURFACE
const PAPER = '#fff3df'
const PRIMARY = '#ffd23f'
const HEADER_MUTED = '#b9ad9f'
const HEADER_RULE = '#5d5650'
const SOFT_RULE = '#dacfbf'

// Each family names its Latin-ext file as a second family (share-assets.ts), so a „Ł“ or „ğ“ in a free-text Team name has a glyph.
const LILITA = 'Lilita One, Lilita One Ext, Bricolage Grotesque Ext'
const BUNGEE = 'Bungee, Bungee Ext, Bricolage Grotesque Ext'
const BRICOLAGE = 'Bricolage Grotesque, Bricolage Grotesque Ext'

/** The numbers of the note, per format. */
const LAYOUT = {
  wide: {
    border: 6,
    header: { height: 92, padding: '0 32px', gap: 24, head: 40, brand: 28, divider: { width: 3, height: 44 }, blockGap: 4, dates: 15, datesLine: 1.2, datesSpacing: '0.1em', eventLine: 1.1 },
    panel: { width: 600, border: 6 },
    winner: {
      padding: '30px 36px', mark: { size: 30, symbol: 16, border: 2.5 }, labelGap: 12, label: 18, labelSpacing: '0.14em', nameTop: 18, nameLine: 1.04,
      points: { value: 72, unit: 22, gap: 12, spacing: '0.1em' }, dance: { width: 200, height: 170, right: 20, bottom: 0 },
    },
    tie: { bar: { height: 52, padding: '0 28px', font: 17, spacing: '0.12em', value: 22, gap: 7 }, band: { border: 3, padding: '0 28px', gap: 16, mark: { size: 34, symbol: 18, border: 2.5 } } },
    right: { padding: '26px 30px' },
    head: { font: 15, padding: 8, spacing: '0.12em' },
    row: { height: 44, gap: 12, rank: { width: 30, font: 20 }, mark: { size: 26, symbol: 14, border: 2.5 }, name: 21, points: 20, more: { font: 17, left: 42 } },
    games: { top: 6, cell: { width: '50%', height: 36, right: 16, gap: 10 }, stripe: { width: 10, height: 24 }, name: 18, more: { font: 17, left: 20 } },
    spacerMin: 20,
  },
  square: {
    border: 8,
    header: { height: 196, padding: '0 44px', rowGap: 14, head: 48, brand: 34, eventTop: 18, dates: 18, datesLine: 1.2, datesSpacing: '0.1em', eventLine: 1.08 },
    panel: { height: 420, border: 8 },
    winner: {
      padding: '36px 44px', mark: { size: 36, symbol: 20, border: 3 }, labelGap: 14, label: 22, labelSpacing: '0.14em', nameTop: 18, nameWidth: 640, nameLine: 1.04,
      points: { value: 80, unit: 26, gap: 14, spacing: '0.1em' }, burst: { size: 340, right: 24, bottom: 12 }, dance: { width: 260, height: 221, left: 40, bottom: 22 },
    },
    tie: { bar: { height: 64, padding: '0 44px', font: 22, spacing: '0.12em', value: 28, gap: 9 }, band: { border: 3.5, padding: '0 44px', gap: 20, mark: { size: 44, symbol: 24, border: 3 } } },
    bottom: { padding: '32px 44px', gap: 44 },
    head: { font: 18, padding: 10, spacing: '0.12em' },
    row: { height: 52, gap: 14, rank: { width: 38, font: 24 }, mark: { size: 32, symbol: 18, border: 2.5 }, name: 25, points: 24, more: { font: 20, left: 52 } },
    games: { width: 380, gap: 12, row: 40, stripe: { width: 12, height: 28 }, name: 22, more: { font: 20, left: 24 } },
  },
} as const

// The tree is plain `{ type, props }` objects (what React would build) so no JSX and no React types are needed.
type Style = Record<string, string | number>
type Child = Node | string | null | false
interface Node { type: string, props: Record<string, unknown> }

function el(type: string, style: Style, children?: Child | Child[], props: Record<string, unknown> = {}): Node {
  const kids = Array.isArray(children) ? children.filter(child => child !== null && child !== false) : children
  return { type, props: { ...props, style, children: kids } }
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** An SVG file as the `src` of an `<img>`: a data URI, never a URL (nothing leaves the server). */
function svgSource(svg: string): string {
  return `data:image/svg+xml;base64,${base64(new TextEncoder().encode(svg))}`
}

// --- the parts ---

/** The note's „Line“: one line of text that ends in „…“ instead of running past its box. Its width comes from the box it sits in (a stretched column, or `flex: 1; minWidth: 0` in a row). */
function line(style: Style, text: string): Node {
  return el('span', { display: 'flex', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...style }, text)
}

/** The note's TeamMark: a round mark with the Team's symbol. On a Team colour (panel, bands) it is `#fffdf8` with an ink symbol, so it does not vanish. */
function teamMark(mark: { size: number, symbol: number, border: number }, team: number, fill: string, ink: string): Node {
  return el('div', {
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxSizing: 'border-box', width: mark.size, height: mark.size, borderRadius: '50%',
    border: `${mark.border}px solid ${INK}`, background: fill,
  }, el('svg', { display: 'flex' }, el('path', {}, undefined, { d: teamSymbol(team), fill: ink }), { width: mark.symbol, height: mark.symbol, viewBox: '0 0 24 24' }))
}
const markOnColour = (mark: { size: number, symbol: number, border: number }, team: number) => teamMark(mark, team, CARD, INK)

/** The note's game stripe: one hard-edged colour per winning Party, top to bottom, framed in ink; one colour is a solid stripe. */
function gameStripe(width: number, height: number, colours: readonly string[]): Node {
  return el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0, boxSizing: 'border-box', width, height, border: `2px solid ${INK}` },
    colours.map((colour, index) => el('div', { display: 'flex', flex: 1, background: colour, ...(index > 0 ? { borderTop: `2px solid ${INK}` } : {}) })))
}

/** A Winner's name: every line its own Line. */
function nameLines(name: ShareName, style: Style): Node {
  return el('div', { display: 'flex', flexDirection: 'column', fontFamily: LILITA, fontSize: name.size, ...style }, name.lines.map(text => line({}, text)))
}

/** The big number and its unit word: „17“ in Bungee, „PUNKTE“ beside it. */
function pointsLine(points: SharePoints, size: { value: number, unit: number, gap: number, spacing: string }): Node {
  return el('div', { display: 'flex', alignItems: 'baseline', flexShrink: 0, whiteSpace: 'nowrap', gap: size.gap }, [
    el('span', { fontFamily: BUNGEE, fontSize: size.value, lineHeight: 1 }, points.value),
    el('span', { fontWeight: 800, fontSize: size.unit, letterSpacing: size.spacing, textTransform: 'uppercase' }, points.label),
  ])
}

type ImageFormat = ShareImageModel['format']

interface Pictures { head: string, burst: string, dance: string }

function picture(src: string, style: Style, size: { width: number, height: number }): Node {
  return el('img', { display: 'flex', ...style, width: size.width, height: size.height }, undefined, { src, width: size.width, height: size.height })
}

// --- the header ---

function wideHeader(model: ShareImageModel, pictures: Pictures): Node {
  const layout = LAYOUT.wide.header
  const event = model.header.event
  return el('div', { display: 'flex', alignItems: 'center', flexShrink: 0, boxSizing: 'border-box', height: layout.height, padding: layout.padding, gap: layout.gap, background: INK }, [
    el('div', { display: 'flex', alignItems: 'center', flexShrink: 0, gap: 10 }, [
      picture(pictures.head, {}, { width: layout.head, height: layout.head }),
      el('span', { fontFamily: LILITA, fontSize: layout.brand, lineHeight: 1, color: PRIMARY, textTransform: 'uppercase' }, model.header.brand),
    ]),
    el('div', { display: 'flex', flexShrink: 0, width: layout.divider.width, height: layout.divider.height, background: HEADER_RULE }),
    el('div', { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: layout.blockGap }, [
      event.lines[0] ? line({ fontFamily: LILITA, fontSize: event.size, lineHeight: layout.eventLine, color: PAPER }, event.lines[0]) : null,
      model.header.dates ? line({ fontWeight: 800, fontSize: layout.dates, lineHeight: layout.datesLine, letterSpacing: layout.datesSpacing, textTransform: 'uppercase', color: HEADER_MUTED }, model.header.dates) : null,
    ]),
  ])
}

function squareHeader(model: ShareImageModel, pictures: Pictures): Node {
  const layout = LAYOUT.square.header
  const event = model.header.event
  const lines = event.lines.filter(text => text !== '')
  return el('div', { display: 'flex', flexDirection: 'column', justifyContent: 'center', flexShrink: 0, boxSizing: 'border-box', height: layout.height, padding: layout.padding, background: INK }, [
    el('div', { display: 'flex', alignItems: 'center', gap: layout.rowGap }, [
      picture(pictures.head, {}, { width: layout.head, height: layout.head }),
      el('span', { flexShrink: 0, fontFamily: LILITA, fontSize: layout.brand, lineHeight: 1, color: PRIMARY, textTransform: 'uppercase' }, model.header.brand),
      line({ flex: 1, justifyContent: 'flex-end', textAlign: 'right', fontWeight: 800, fontSize: layout.dates, lineHeight: layout.datesLine, letterSpacing: layout.datesSpacing, textTransform: 'uppercase', color: HEADER_MUTED }, model.header.dates ?? ''),
    ]),
    lines.length > 0 ? nameLines({ ...event, lines: lines as ShareName['lines'] }, { marginTop: layout.eventTop, lineHeight: layout.eventLine, color: PAPER }) : null,
  ])
}

// --- the panel ---

/** One Winner: the Team colour, „Sieger“, the name, the points, and Compibert (wide) or Compibert on the sunburst (square). */
function winnerPanel(panel: ShareWinnerPanel, format: ImageFormat, pictures: Pictures): Node {
  const layout = LAYOUT[format].winner
  const label = el('div', { display: 'flex', alignItems: 'center', gap: layout.labelGap }, [
    markOnColour(layout.mark, panel.team),
    el('span', { fontWeight: 800, fontSize: layout.label, lineHeight: 1, letterSpacing: layout.labelSpacing, textTransform: 'uppercase' }, panel.label),
  ])
  const frame = { display: 'flex', flexDirection: 'column', position: 'relative', boxSizing: 'border-box', overflow: 'hidden', padding: layout.padding, background: panel.fill, color: panel.ink } as const
  if (format === 'wide') {
    const wide = LAYOUT.wide
    const { dance } = wide.winner
    return el('div', { ...frame, flexShrink: 0, width: wide.panel.width, borderRight: `${wide.panel.border}px solid ${INK}` }, [
      label,
      nameLines(panel.name, { marginTop: layout.nameTop, lineHeight: layout.nameLine }),
      el('div', { display: 'flex', flex: 1, minHeight: 0 }),
      pointsLine(panel.points, wide.winner.points),
      picture(pictures.dance, { position: 'absolute', right: dance.right, bottom: dance.bottom }, dance),
    ])
  }
  const square = LAYOUT.square
  const { burst, dance } = square.winner
  return el('div', { ...frame, flexShrink: 0, height: square.panel.height, borderBottom: `${square.panel.border}px solid ${INK}` }, [
    el('div', { display: 'flex', position: 'absolute', right: burst.right, bottom: burst.bottom, width: burst.size, height: burst.size }, [
      picture(pictures.burst, { position: 'absolute', left: 0, top: 0 }, { width: burst.size, height: burst.size }),
      picture(pictures.dance, { position: 'absolute', left: dance.left, bottom: dance.bottom }, dance),
    ]),
    label,
    nameLines(panel.name, { marginTop: layout.nameTop, width: square.winner.nameWidth, lineHeight: layout.nameLine }),
    el('div', { display: 'flex', flex: 1, minHeight: 0 }),
    pointsLine(panel.points, square.winner.points),
  ])
}

/**
 * A Tie, meanwhile (#510): the note's k >= 2 structure, the tie bar and one band per Winner, all at one size. #511 replaces the constant size
 * with the tiers of the note's table and adds the „+n weitere“ band and „je“; no Compibert or sunburst on a Tie panel.
 */
function tiePanel(panel: ShareTiePanel, format: ImageFormat): Node {
  const layout = LAYOUT[format].tie
  const bar = layout.bar
  const band = (entry: ShareBand): Node => el('div', {
    display: 'flex', flex: 1, minHeight: 0, alignItems: 'center', boxSizing: 'border-box', gap: layout.band.gap, padding: layout.band.padding,
    borderTop: `${layout.band.border}px solid ${INK}`, background: entry.fill, color: entry.ink,
  }, [
    markOnColour(layout.band.mark, entry.team),
    line({ flex: 1, fontFamily: LILITA, fontSize: panel.size, lineHeight: 1.1 }, entry.name),
  ])
  const frame: Style = format === 'wide'
    ? { flexShrink: 0, width: LAYOUT.wide.panel.width, borderRight: `${LAYOUT.wide.panel.border}px solid ${INK}` }
    : { flexShrink: 0, height: LAYOUT.square.panel.height, borderBottom: `${LAYOUT.square.panel.border}px solid ${INK}` }
  return el('div', { display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden', ...frame }, [
    el('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxSizing: 'border-box', height: bar.height, padding: bar.padding, gap: 16, background: PRIMARY,
      fontWeight: 800, fontSize: bar.font, lineHeight: 1, letterSpacing: bar.spacing, textTransform: 'uppercase',
    }, [
      line({}, panel.label),
      el('span', { display: 'flex', alignItems: 'baseline', flexShrink: 0, whiteSpace: 'nowrap', gap: bar.gap }, [
        el('span', { fontFamily: BUNGEE, fontWeight: 400, fontSize: bar.value, letterSpacing: 0 }, panel.points.value),
        el('span', {}, panel.points.label),
      ]),
    ]),
    ...panel.bands.map(band),
  ])
}

// --- the Standings and the games ---

/** The head of a block: a title and its count, ruled below. */
function blockHead(format: ImageFormat, left: string, right?: string): Node {
  const layout = LAYOUT[format].head
  return el('div', {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap', paddingBottom: layout.padding, borderBottom: `3px solid ${INK}`,
    fontWeight: 800, fontSize: layout.font, lineHeight: 1, letterSpacing: layout.spacing, textTransform: 'uppercase',
  }, [el('span', {}, left), right ? el('span', { color: MUTED }, right) : null])
}

function standingsRow(entry: ShareStandingsRow, format: ImageFormat): Node {
  const layout = LAYOUT[format].row
  const frame = { display: 'flex', alignItems: 'center', flexShrink: 0, boxSizing: 'border-box', height: layout.height, borderBottom: `2px solid ${SOFT_RULE}` } as const
  if (entry.kind === 'more') return el('div', { ...frame, paddingLeft: layout.more.left, fontWeight: 800, fontSize: layout.more.font, color: MUTED, whiteSpace: 'nowrap' }, entry.text)
  return el('div', { ...frame, gap: layout.gap }, [
    el('span', { display: 'flex', flexShrink: 0, width: layout.rank.width, fontFamily: BUNGEE, fontSize: layout.rank.font, lineHeight: 1 }, String(entry.rank)),
    teamMark(layout.mark, entry.team, entry.fill, entry.ink),
    line({ flex: 1, fontWeight: 800, fontSize: layout.name, lineHeight: 1.1 }, entry.name),
    el('span', { flexShrink: 0, fontFamily: BUNGEE, fontSize: layout.points, lineHeight: 1 }, String(entry.points)),
  ])
}

function standingsBlock(standings: ShareStandings, format: ImageFormat): Node {
  return el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0 }, [blockHead(format, standings.title, standings.count), ...standings.rows.map(row => standingsRow(row, format))])
}

function gameRow(entry: ShareGameRow, format: ImageFormat): Node {
  if (format === 'wide') {
    const layout = LAYOUT.wide.games
    const cell = { display: 'flex', alignItems: 'center', flexShrink: 0, boxSizing: 'border-box', width: layout.cell.width, height: layout.cell.height, paddingRight: layout.cell.right, gap: layout.cell.gap, minWidth: 0 } as const
    if (entry.kind === 'more') return el('div', cell, el('span', { paddingLeft: layout.more.left, fontWeight: 800, fontSize: layout.more.font, color: MUTED, whiteSpace: 'nowrap' }, entry.text))
    return el('div', cell, [gameStripe(layout.stripe.width, layout.stripe.height, entry.stripe), line({ flex: 1, fontWeight: 700, fontSize: layout.name, lineHeight: 1.2 }, entry.name)])
  }
  const layout = LAYOUT.square.games
  const cell = { display: 'flex', alignItems: 'center', flexShrink: 0, height: layout.row, gap: layout.gap, minWidth: 0 } as const
  if (entry.kind === 'more') return el('div', cell, el('span', { paddingLeft: layout.more.left, fontWeight: 800, fontSize: layout.more.font, color: MUTED, whiteSpace: 'nowrap' }, entry.text))
  return el('div', cell, [gameStripe(layout.stripe.width, layout.stripe.height, entry.stripe), line({ flex: 1, fontWeight: 700, fontSize: layout.name, lineHeight: 1.2 }, entry.name)])
}

function gamesBlock(games: ShareGames, format: ImageFormat): Node {
  const rows = games.rows.map(row => gameRow(row, format))
  return format === 'wide'
    ? el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0 }, [
        blockHead(format, games.label),
        el('div', { display: 'flex', flexWrap: 'wrap', flexShrink: 0, paddingTop: LAYOUT.wide.games.top }, rows),
      ])
    : el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0, width: LAYOUT.square.games.width }, [blockHead(format, games.label), ...rows])
}

// --- the picture ---

function tree(model: ShareImageModel, pictures: Pictures): Node {
  const { format, panel, standings } = model
  const layout = LAYOUT[format]
  const frame = { display: 'flex', flexDirection: 'column', boxSizing: 'border-box', width: model.width, height: model.height, border: `${layout.border}px solid ${INK}`, overflow: 'hidden', background: PAPER, fontFamily: BRICOLAGE, color: INK } as const
  const panelNode = panel.kind === 'winner' ? winnerPanel(panel, format, pictures) : tiePanel(panel, format)

  if (format === 'wide') {
    return el('div', frame, [
      wideHeader(model, pictures),
      el('div', { display: 'flex', flex: 1, minHeight: 0 }, [
        panelNode,
        // The right column: the Standings (when some Party is not a Winner), the spacer, the games at the foot.
        el('div', { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, boxSizing: 'border-box', padding: LAYOUT.wide.right.padding }, [
          standings ? standingsBlock(standings, format) : null,
          el('div', { display: 'flex', flex: 1, minHeight: LAYOUT.wide.spacerMin }),
          gamesBlock(model.games, format),
        ]),
      ]),
    ])
  }
  return el('div', frame, [
    squareHeader(model, pictures),
    panelNode,
    el('div', { display: 'flex', flex: 1, minHeight: 0, boxSizing: 'border-box', padding: LAYOUT.square.bottom.padding, gap: LAYOUT.square.bottom.gap, overflow: 'hidden' }, [
      standings ? el('div', { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }, standingsBlock(standings, format)) : null,
      gamesBlock(model.games, format),
    ]),
  ])
}

// --- fonts and WebAssembly, once per process ---

type SatoriFonts = NonNullable<Parameters<typeof satori>[1]>['fonts']

const fontsByAssets = new WeakMap<ShareAssets, Promise<SatoriFonts>>()

function fontsOf(assets: ShareAssets): Promise<SatoriFonts> {
  let fonts = fontsByAssets.get(assets)
  if (!fonts) {
    fonts = Promise.all(SHARE_FONTS.map(async ({ name, weight, file }) => {
      const bytes = await assets.font(file)
      return { name, weight, style: 'normal' as const, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }
    }))
    fontsByAssets.set(assets, fonts)
    // A failed read is tried again by the next request.
    fonts.catch(() => fontsByAssets.delete(assets))
  }
  return fonts
}

let wasmReady: Promise<void> | undefined

/** resvg's WebAssembly is initialised once per process: a second `initWasm` throws. */
function resvgReady(assets: ShareAssets): Promise<void> {
  if (!wasmReady) {
    const ready = assets.resvgWasm().then(initWasm)
    wasmReady = ready
    // A failed start is tried again by the next request.
    ready.catch(() => {
      wasmReady = undefined
    })
  }
  return wasmReady
}

/** The picture of `model` as PNG bytes, made from scratch on every call. */
export async function renderShareImage(model: ShareImageModel, assets: ShareAssets): Promise<Uint8Array> {
  const [fonts, burst, dance, head] = await Promise.all([fontsOf(assets), assets.svg('sunburst'), assets.svg('dance'), assets.svg('head'), resvgReady(assets)])
  const svg = await satori(
    tree(model, { head: svgSource(head), burst: svgSource(burst), dance: svgSource(dance) }) as never,
    { width: model.width, height: model.height, fonts },
  )
  const resvg = new Resvg(svg, { fitTo: { mode: 'original' } })
  const rendered = resvg.render()
  try {
    return rendered.asPng()
  }
  finally {
    rendered.free()
    resvg.free()
  }
}
