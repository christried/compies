import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clean, normalise, theme } from './css-tokens'

// The look of formatted notes (#729, spec #717, hand-off 18-notizen.md § NoteContent): one stylesheet, `.cp-note`, one modifier per size. jsdom computes no
// cascade, so the numbers of the hand-off are pinned at the stylesheet. #454's editor reads the same file (`--edit`).
const css = normalise(clean(readFileSync(resolve(import.meta.dirname, '../../app/assets/css/notes.css'), 'utf8')))

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`${selector} is not in notes.css`)
  return css.slice(start + selector.length + 2, css.indexOf('}', start))
}

const SIZES = {
  sm: { fs: '14px', lh: '1.45', p: '6px', h: '17px', hm: '12px', pl: '20px', li: '2px', ic: '12px' },
  md: { fs: '15px', lh: '1.5', p: '8px', h: '18px', hm: '14px', pl: '22px', li: '3px', ic: '13px' },
  lg: { fs: '16px', lh: '1.55', p: '10px', h: '20px', hm: '16px', pl: '24px', li: '3px', ic: '14px' },
  edit: { fs: '16px', lh: '1.5', p: '8px', h: '20px', hm: '14px', pl: '24px', li: '3px', ic: '14px' },
} as const

describe('notes.css (#729)', () => {
  it('is imported by the theme, the single entry', () => {
    expect(clean(theme)).toContain('@import "./notes.css"')
  })

  it.each(Object.entries(SIZES))('%s holds the numbers of the hand-off', (size, v) => {
    const block = rule(`.cp-note--${size}`)

    expect(block).toContain(`--note-fs: ${v.fs}`)
    expect(block).toContain(`--note-lh: ${v.lh}`)
    expect(block).toContain(`--note-p: ${v.p}`)
    expect(block).toContain(`--note-h: ${v.h}`)
    expect(block).toContain(`--note-hm: ${v.hm}`)
    expect(block).toContain(`--note-pl: ${v.pl}`)
    expect(block).toContain(`--note-li: ${v.li}`)
    expect(block).toContain(`--note-ic: ${v.ic}`)
  })

  it('sets the text: ink, weight 500, pretty wrapping, a break inside a long word', () => {
    const block = rule('.cp-note')

    expect(block).toContain('color: var(--cp-ink)')
    expect(block).toContain('font-weight: 500')
    expect(block).toContain('text-wrap: pretty')
    expect(block).toContain('overflow-wrap: break-word')
  })

  it('sets a heading in Lilita with line-height 1.15, balanced, 4 px below', () => {
    const block = rule('.cp-note :is(h3, h4)')

    expect(block).toContain('font-family: var(--cp-font-display)')
    expect(block).toContain('line-height: 1.15')
    expect(block).toContain('text-wrap: balance')
    expect(block).toContain('margin: var(--note-hm) 0 4px')
    expect(block).toContain('font-size: var(--note-h)')
  })

  it('sets the lists: square bullets, decimal numbers with tabular figures, two more pixels of indent for numbers', () => {
    expect(rule('.cp-note ul')).toContain('list-style-type: square')
    expect(rule('.cp-note ul')).toContain('padding-left: var(--note-pl)')
    expect(rule('.cp-note ol')).toContain('list-style-type: decimal')
    expect(rule('.cp-note ol')).toContain('font-variant-numeric: tabular-nums')
    expect(rule('.cp-note ol')).toContain('padding-left: calc(var(--note-pl) + 2px)')
    expect(rule('.cp-note li')).toContain('margin: var(--note-li) 0')
  })

  it('sets bold 800 and italic', () => {
    expect(rule('.cp-note strong')).toContain('font-weight: 800')
    expect(rule('.cp-note em')).toContain('font-style: italic')
  })

  it('draws a link in info-fg, 650, underlined 2 px at an offset of 3 px, and darker with a 3 px underline on hover', () => {
    const block = rule('.cp-note a')

    expect(block).toContain('color: var(--cp-info-fg)')
    expect(block).toContain('font-weight: 650')
    expect(block).toContain('text-decoration-thickness: 2px')
    expect(block).toContain('text-underline-offset: 3px')
    expect(block).toContain('overflow-wrap: anywhere')
    expect(rule('.cp-note a:hover')).toContain('color: var(--cp-ink)')
    expect(rule('.cp-note a:hover')).toContain('text-decoration-thickness: 3px')
  })

  it('keeps the first block flush at the top and the last at the bottom', () => {
    expect(rule('.cp-note > :first-child')).toContain('margin-top: 0')
    expect(rule('.cp-note > :last-child')).toContain('margin-bottom: 0')
  })

  it('hides the arrow and the new-tab text in the editor, where a link is not clickable', () => {
    expect(rule('.cp-note--edit .cp-note-arrow, .cp-note--edit .cp-note-new-tab')).toContain('display: none')
  })
})

// The motions of the notes CSS (#822, CODING_STANDARDS § Motion): the popover's pop in notes.css and the toolbar tooltip in RichNotesToolbar.vue. A motion's test pins its
// easing, its duration and that something animates, and the geometry of the reduced fallback.
const toolbar = normalise(clean(readFileSync(resolve(import.meta.dirname, '../../app/components/RichNotesToolbar.vue'), 'utf8').match(/<style[^>]*>([\s\S]*)<\/style>/)![1]!))

describe('the notes popover pop (#822)', () => {
  it('scales from .96 and fades in over --cp-dur-base on --cp-ease-out', () => {
    expect(rule('.cp-note-pop')).toContain('animation: cp-note-pop var(--cp-dur-base) var(--cp-ease-out) both')
    expect(css).toContain('@keyframes cp-note-pop { from { opacity: 0; transform: scale(0.96); } }')
  })

  it.each(['@media (prefers-reduced-motion: reduce) { .cp-note-pop {', '[data-motion=reduced] .cp-note-pop {'])('is opacity only under reduced motion (%s): no scale, --cp-dur-fast, linear', (selector) => {
    const start = css.indexOf(selector)
    expect(start).toBeGreaterThan(-1)
    expect(css.slice(start, css.indexOf('}', start))).toContain('animation: cp-note-pop-reduced var(--cp-dur-fast) linear both')
    expect(css).toContain('@keyframes cp-note-pop-reduced { from { opacity: 0; } }')
  })
})

describe('the toolbar tooltip (#822)', () => {
  const block = (selector: string) => {
    const start = toolbar.indexOf(`${selector} {`)
    if (start < 0) throw new Error(`${selector} is not in the toolbar`)
    return toolbar.slice(start, toolbar.indexOf('}', start))
  }

  it('rests transparent and 4 px down, and leaves in --cp-dur-instant on --cp-ease-in', () => {
    expect(block('.cp-note-tip')).toContain('opacity: 0')
    expect(block('.cp-note-tip')).toContain('transform: translate(var(--tip-x), 4px)')
    expect(block('.cp-note-tip')).toContain('transition: opacity var(--cp-dur-instant) var(--cp-ease-in), transform var(--cp-dur-instant) var(--cp-ease-in)')
  })

  it('arrives at once on keyboard focus: opacity 1, in place, over --cp-dur-fast on --cp-ease-out', () => {
    const shown = block('.cp-note-tb:focus-visible .cp-note-tip')

    expect(shown).toContain('opacity: 1')
    expect(shown).toContain('transform: translate(var(--tip-x), 0)')
    expect(shown).toContain('transition: opacity var(--cp-dur-fast) var(--cp-ease-out), transform var(--cp-dur-fast) var(--cp-ease-out)')
  })

  it('arrives 500 ms after a fine pointer comes, never on touch', () => {
    const start = toolbar.indexOf('@media (hover: hover) and (pointer: fine) {')
    expect(start).toBeGreaterThan(-1)
    expect(toolbar.slice(start, toolbar.indexOf('} }', start))).toContain('transition: opacity var(--cp-dur-fast) var(--cp-ease-out) 500ms, transform var(--cp-dur-fast) var(--cp-ease-out) 500ms')
  })

  it.each(['@media (prefers-reduced-motion: reduce) { .cp-note-tip {', '[data-motion=reduced] .cp-note-tip {'])('keeps the opacity and drops the 4 px under reduced motion (%s)', (selector) => {
    const start = toolbar.indexOf(selector)
    expect(start).toBeGreaterThan(-1)
    expect(toolbar.slice(start, toolbar.indexOf('}', start))).toContain('transform: translate(var(--tip-x), 0)')
  })
})
