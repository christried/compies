import { initWasm, Resvg } from '@resvg/resvg-wasm'
import satori from 'satori'
import type { ShareImageModel } from '../../shared/share-image'
import { teamSymbol } from '../../shared/team-marks'
import { SHARE_FONTS, type ShareAssets } from './share-assets'

// Draws a ShareImageModel (#313): Satori lays a flex-only tree out as SVG, resvg (WebAssembly) turns that into a PNG. It decides
// nothing the model could decide; it ports the artboard `ShareImage.dc.html` number for number. Nothing is stored or cached here but
// the fonts' parse and resvg's initialised WebAssembly, which are not Event data.

const INK = '#151515'
const MUTED = '#5d5650'
const CARD = '#fffdf8'
const PAPER = '#fff3df'

// Each family names its Latin-ext file as a second family (share-assets.ts), so a „Ł“ or „ğ“ in a free-text Team name has a glyph.
const LILITA = 'Lilita One, Lilita One Ext, Bricolage Grotesque Ext'
const BUNGEE = 'Bungee, Bungee Ext, Bricolage Grotesque Ext'
const BRICOLAGE = 'Bricolage Grotesque, Bricolage Grotesque Ext'

/** The numbers of the artboard, per format (`ShareImage.dc.html`). */
const LAYOUT = {
  wide: {
    padding: '40px 56px', gap: 22,
    pill: { font: 20, padding: '6px 14px' }, brand: { font: 32, gap: 11, head: 44 },
    shadow: 5, points: { font: 28, top: 12, gap: 8 }, rowsTop: 22, moreRows: 18,
    row: { height: 48, gap: 10, inner: 13, padding: '0 19px', border: 3, radius: 12, shadow: 4, font: 24, rank: 38, mark: 28 },
    burst: 330, dance: { width: 250, height: 213 },
    label: { font: 18, right: 4 }, chip: { height: 34, border: 2.5, font: 16, dot: 11, dotBorder: 2, inner: 7, padding: '0 10px', gap: 10 }, moreChips: 16,
  },
  square: {
    padding: '60px 64px', gap: 30,
    pill: { font: 24, padding: '7px 17px' }, brand: { font: 40, gap: 14, head: 56 },
    shadow: 7, points: { font: 38, top: 16, gap: 11 }, rowsTop: 0, moreRows: 24,
    row: { height: 62, gap: 14, inner: 16, padding: '0 24px', border: 3.5, radius: 14, shadow: 4.5, font: 30, rank: 46, mark: 36 },
    burst: 340, dance: { width: 260, height: 221 },
    label: { font: 24, right: 0 }, chip: { height: 46, border: 3, font: 22, dot: 15, dotBorder: 2.5, inner: 10, padding: '0 14px', gap: 12 }, moreChips: 22,
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

function pill(model: ShareImageModel, layout: (typeof LAYOUT)[ShareFormat]): Node | null {
  const { event, rest } = model.pill
  if (!event && !rest) return null
  const text = { fontWeight: 800, fontSize: layout.pill.font, letterSpacing: '0.04em', lineHeight: 1.1, textTransform: 'uppercase', whiteSpace: 'nowrap' } as const
  return el('div', {
    display: 'flex', minWidth: 0, flexShrink: 1, padding: layout.pill.padding, background: INK, color: PAPER, borderRadius: 999,
  }, [
    // The Event's name is the part that gives way (up to 60 characters); the Date and the people are never cut.
    event ? el('span', { ...text, flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }, event) : null,
    rest ? el('span', { ...text, flexShrink: 0, marginLeft: event ? Math.round(layout.pill.font * 0.3) : 0 }, event ? `· ${rest}` : rest) : null,
  ])
}

function brand(head: string, text: string, layout: (typeof LAYOUT)[ShareFormat]): Node {
  return el('div', { display: 'flex', alignItems: 'center', flexShrink: 0, gap: layout.brand.gap, fontFamily: LILITA, fontSize: layout.brand.font, lineHeight: 1, textTransform: 'uppercase' }, [
    el('img', { width: layout.brand.head, height: layout.brand.head }, undefined, { src: head, width: layout.brand.head, height: layout.brand.head }),
    el('span', {}, text),
  ])
}

function teamMark(size: number, fill: string, ink: string, team: number): Node {
  const symbol = Math.round(size * 0.56)
  return el('div', {
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxSizing: 'border-box', width: size, height: size, borderRadius: '50%',
    border: `${size >= 28 ? 2.5 : 2}px solid ${INK}`, background: fill,
  }, el('svg', { display: 'flex' }, el('path', {}, undefined, { d: teamSymbol(team), fill: ink }), { width: symbol, height: symbol, viewBox: '0 0 24 24' }))
}

function winnerBlock(model: ShareImageModel, layout: (typeof LAYOUT)[ShareFormat]): Node {
  const { winner } = model
  const { points } = layout
  // The name is clamped to three lines: a very long Team name wraps inside its lines, and what would not fit is cut with an ellipsis
  // rather than drawn past the border.
  return el('div', { display: 'flex', flexDirection: 'column', minWidth: 0 }, [
    el('div', {
      fontFamily: LILITA, fontSize: winner.size, lineHeight: 0.9, color: INK, whiteSpace: 'pre-line',
      textShadow: `${layout.shadow}px ${layout.shadow}px 0 ${winner.color}`, lineClamp: 3,
    }, winner.lines.join('\n')),
    el('div', { display: 'flex', alignItems: 'baseline', marginTop: points.top, gap: points.gap, fontSize: points.font, fontWeight: 800, lineHeight: 1.1 }, [
      el('span', {}, winner.lead),
      el('span', { fontFamily: BUNGEE, fontWeight: 400 }, winner.points),
      el('span', {}, winner.tail),
    ]),
  ])
}

function rowsBlock(model: ShareImageModel, layout: (typeof LAYOUT)[ShareFormat]): Node | null {
  if (model.rows.length === 0 && !model.moreRows) return null
  const { row } = layout
  return el('div', { display: 'flex', flexDirection: 'column', gap: row.gap, marginTop: layout.rowsTop }, [
    ...model.rows.map(entry => el('div', {
      display: 'flex', alignItems: 'center', boxSizing: 'border-box', gap: row.inner, height: row.height, padding: row.padding, background: CARD,
      border: `${row.border}px solid ${INK}`, borderRadius: row.radius, boxShadow: `${row.shadow}px ${row.shadow}px 0 ${INK}`,
    }, [
      el('span', { display: 'flex', flexShrink: 0, width: row.rank, fontFamily: BUNGEE, fontSize: row.font, lineHeight: 1 }, String(entry.rank)),
      teamMark(row.mark, entry.fill, entry.ink, entry.team),
      el('span', { flex: 1, minWidth: 0, fontWeight: 800, fontSize: row.font, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, entry.name),
      el('span', { flexShrink: 0, fontFamily: BUNGEE, fontSize: row.font, lineHeight: 1 }, String(entry.points)),
    ])),
    model.moreRows ? el('span', { fontWeight: 800, fontSize: layout.moreRows, color: MUTED }, model.moreRows) : null,
  ])
}

function sunburst(burst: string, dance: string, layout: (typeof LAYOUT)[ShareFormat]): Node {
  return el('div', { display: 'flex', position: 'relative', flexShrink: 0, width: layout.burst, height: layout.burst }, [
    el('img', { position: 'absolute', left: 0, top: 0, width: layout.burst, height: layout.burst }, undefined, { src: burst, width: layout.burst, height: layout.burst }),
    el('img', { position: 'absolute', left: 40, bottom: 22, width: layout.dance.width, height: layout.dance.height }, undefined, { src: dance, width: layout.dance.width, height: layout.dance.height }),
  ])
}

function chips(model: ShareImageModel, layout: (typeof LAYOUT)[ShareFormat]): Node[] {
  const { chip } = layout
  return [
    ...model.chips.map(entry => el('div', {
      display: 'flex', alignItems: 'center', flexShrink: 0, boxSizing: 'border-box', gap: chip.inner, height: chip.height, padding: chip.padding, background: CARD,
      border: `${chip.border}px solid ${INK}`, borderRadius: 999, fontWeight: 700, fontSize: chip.font, whiteSpace: 'nowrap',
    }, [
      el('div', { width: chip.dot, height: chip.dot, flexShrink: 0, borderRadius: '50%', border: `${chip.dotBorder}px solid ${INK}`, background: entry.color }),
      el('span', {}, entry.name),
    ])),
    ...(model.moreChips ? [el('span', { display: 'flex', alignItems: 'center', flexShrink: 0, height: chip.height, fontWeight: 800, fontSize: layout.moreChips, color: MUTED, whiteSpace: 'nowrap' }, model.moreChips)] : []),
  ]
}

type ShareFormat = ShareImageModel['format']

interface Pictures { head: string, burst: string, dance: string, brand: string }

function tree(model: ShareImageModel, pictures: Pictures): Node {
  const layout = LAYOUT[model.format]
  const topBar = el('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 24 }, [
    pill(model, layout) ?? el('span', {}),
    brand(pictures.head, pictures.brand, layout),
  ])
  const label = el('span', { display: 'flex', flexShrink: 0, fontWeight: 800, fontSize: layout.label.font, marginRight: layout.label.right, whiteSpace: 'nowrap' }, model.gamesLabel)

  const middle = model.format === 'wide'
    // Wide: the text on the left, the sunburst with the dance on the right.
    ? el('div', { display: 'flex', flex: 1, minHeight: 0, alignItems: 'center', gap: 44 }, [
        el('div', { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }, [winnerBlock(model, layout), rowsBlock(model, layout)]),
        sunburst(pictures.burst, pictures.dance, layout),
      ])
    // Square: the name across the top, the rows and the sunburst side by side under it.
    : [
        el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0 }, [winnerBlock(model, layout)]),
        el('div', { display: 'flex', flex: 1, minHeight: 0, alignItems: 'center', gap: 40 }, [
          el('div', { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }, [rowsBlock(model, layout)]),
          sunburst(pictures.burst, pictures.dance, layout),
        ]),
      ]

  const games = model.format === 'wide'
    ? el('div', { display: 'flex', alignItems: 'center', flexShrink: 0, gap: layout.chip.gap, overflow: 'hidden' }, [label, ...chips(model, layout)])
    : el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0, gap: 12 }, [
        label,
        el('div', { display: 'flex', flexWrap: 'wrap', gap: layout.chip.gap }, chips(model, layout)),
      ])

  return el('div', {
    display: 'flex', flexDirection: 'column', boxSizing: 'border-box', width: model.width, height: model.height, padding: layout.padding, gap: layout.gap, overflow: 'hidden',
    background: PAPER, backgroundImage: 'radial-gradient(rgba(21,21,21,.10) 2px, transparent 2.4px)', backgroundSize: '28px 28px',
    fontFamily: BRICOLAGE, color: INK,
  }, [topBar, ...(Array.isArray(middle) ? middle : [middle]), games])
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
    tree(model, { head: svgSource(head), burst: svgSource(burst), dance: svgSource(dance), brand: model.brand }) as never,
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
