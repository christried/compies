import { describe, expect, it } from 'vitest'
import { backdrop, cut, hex, isLarge, judgeBox, judgeRing, judgeSurface, judgeText, label, lines, over, ratio, same } from '../../scripts/browser/contrast.mjs'

// scripts/browser/contrast.mjs holds every rule that decides PASS or FAIL of the Dunkel-Check (#407); the page only reads
// computed values, Node judges. The colours are the dark token block of app/assets/css/compies-tokens.css.
type Rgba = [number, number, number, number]
const c = (value: string, alpha = 1): Rgba => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16), alpha]
const flat = (value: string) => ({ color: c(value), image: 'none' as const, stops: [] as Rgba[] })
const ratioOf = (a: string, b: string) => cut(ratio(c(a), c(b)))

const textOf = (change: Record<string, unknown> = {}) => ({
  key: 'div:1>p:1#t0',
  role: 'p',
  text: 'Anmelden',
  behind: [flat('#221b2b')],
  color: c('#b9ad9f'),
  opacity: 1,
  size: 14,
  weight: 400,
  inactive: false,
  over: 'none' as const,
  ...change,
})

describe('ratio', () => {
  it('gives black on white 21', () => {
    expect(ratioOf('#000000', '#ffffff')).toBe('21.00')
  })

  it('gives the dark tokens their documented ratios', () => {
    expect(ratioOf('#f7efe1', '#17121d')).toBe('16.12')
    expect(ratioOf('#b9ad9f', '#17121d')).toBe('8.36')
    expect(ratioOf('#75697f', '#17121d')).toBe('3.57')
    expect(ratioOf('#8fb3ff', '#17121d')).toBe('8.81')
  })

  it('gives a colour on itself 1', () => {
    expect(ratio(c('#17121d'), c('#17121d'))).toBe(1)
  })

  it('prints cut, not rounded, so 4.499 never reads as a passing 4.50', () => {
    expect(cut(4.499)).toBe('4.49')
    expect(cut(4.5)).toBe('4.50')
    expect(cut(3.5798)).toBe('3.57')
  })
})

describe('over and hex', () => {
  it('composites a translucent line over a surface', () => {
    expect(hex(over([247, 239, 225, 0.18], c('#221b2b')))).toBe('#48414c')
  })

  it('returns the top at alpha 1 and the bottom at alpha 0', () => {
    expect(hex(over(c('#ff5a36'), c('#17121d')))).toBe('#ff5a36')
    expect(hex(over(c('#ff5a36', 0), c('#17121d')))).toBe('#17121d')
  })
})

describe('isLarge', () => {
  it('follows WCAG: 24 px, or 18.66 px bold', () => {
    expect(isLarge(24, 400)).toBe(true)
    expect(isLarge(23.99, 400)).toBe(false)
    expect(isLarge(18.66, 700)).toBe(true)
    expect(isLarge(18.66, 600)).toBe(false)
    expect(isLarge(18.65, 700)).toBe(false)
  })
})

describe('backdrop', () => {
  it('composites from the opaque layer up to the nearest', () => {
    const result = backdrop([{ color: c('#ffffff', 0.5), image: 'none', stops: [] }, flat('#000000')])
    expect(result.kind).toBe('flat')
    expect(hex(result.color)).toBe('#808080')
  })

  it('is a picture when any layer is one', () => {
    expect(backdrop([flat('#221b2b'), { color: c('#17121d'), image: 'picture', stops: [] }]).kind).toBe('picture')
  })

  it('keeps the backdrop once per stop of a texture', () => {
    const result = backdrop([{ color: c('#17121d'), image: 'texture', stops: [[255, 176, 32, 0.14]] }])
    expect(result.kind).toBe('texture')
    expect(result.worst.map(hex)).toEqual([hex(over([255, 176, 32, 0.14], c('#17121d')))])
  })
})

describe('judgeText', () => {
  it('passes secondary text on a surface at 7.57', () => {
    const verdict = judgeText(textOf())
    expect(verdict).toMatchObject({ outcome: 'pass', fg: '#b9ad9f', bg: '#221b2b', need: 4.5 })
    expect(cut(verdict.ratio as number)).toBe('7.57')
  })

  it('fails the bad colour, text of the page colour on the page, at 1', () => {
    const verdict = judgeText(textOf({ color: c('#17121d'), behind: [flat('#17121d')] }))
    expect(verdict.outcome).toBe('fail')
    expect(verdict.why).toBe('contrast')
    expect(cut(verdict.ratio as number)).toBe('1.00')
  })

  it('needs 4.5 at 14 px but only 3 at 24 px for the disabled grey', () => {
    const grey = { color: c('#75697f'), behind: [flat('#17121d')] }
    expect(judgeText(textOf({ ...grey, size: 14 })).outcome).toBe('fail')
    expect(judgeText(textOf({ ...grey, size: 24 }))).toMatchObject({ outcome: 'pass', need: 3 })
  })

  it('lowers the ratio with the opacity of the ancestors', () => {
    const full = judgeText(textOf({ behind: [flat('#17121d')] }))
    const half = judgeText(textOf({ behind: [flat('#17121d')], opacity: 0.5 }))
    expect(half.ratio as number).toBeLessThan(full.ratio as number)
    expect(half.fg).toBe('#68605e')
  })

  it('skips a text on a picture, whether the picture is a layer or lies over the element', () => {
    expect(judgeText(textOf({ behind: [{ color: c('#221b2b'), image: 'picture', stops: [] }] }))).toMatchObject({ outcome: 'skip', why: 'picture', ratio: null })
    expect(judgeText(textOf({ over: 'picture' }))).toMatchObject({ outcome: 'skip', why: 'picture' })
  })

  it('skips an inactive control', () => {
    expect(judgeText(textOf({ color: c('#75697f'), inactive: true }))).toMatchObject({ outcome: 'skip', why: 'inactive' })
  })

  it('scores a text on the page texture by its worst stop: 6.40, not 8.36', () => {
    const texture = { color: c('#17121d'), image: 'texture' as const, stops: [[255, 176, 32, 0.14]] as Rgba[] }
    const verdict = judgeText(textOf({ behind: [texture] }))
    expect(verdict.outcome).toBe('pass')
    expect(cut(verdict.ratio as number)).toBe('6.40')
  })

  // The footer link on the current page (#407): its highlight is a gradient that is transparent over the upper part and
  // the primary colour below. The text is judged on the surface and on that stroke, and the lower ratio counts.
  it('scores a text over a highlight stroke by the lower of the surface and the stroke', () => {
    const stroke = { color: [0, 0, 0, 0] as Rgba, image: 'texture' as const, stops: [[0, 0, 0, 0], c('#ffd23f')] as Rgba[] }
    const verdict = judgeText(textOf({ color: c('#f7efe1'), behind: [stroke, flat('#221b2b')] }))
    expect(verdict).toMatchObject({ outcome: 'fail', why: 'contrast', bg: '#ffd23f' })
    expect(cut(verdict.ratio as number)).toBe('1.26')
  })
})

describe('judgeBox', () => {
  const box = (change: Record<string, unknown>) => ({ key: 'button:1', role: 'button', text: 'Weiter', behind: [flat('#221b2b')], border: null, fill: null, inactive: false, ...change })

  it('passes a border that reads when the fill does not', () => {
    expect(judgeBox(box({ border: c('#f7efe1'), fill: c('#221b2b') }))).toMatchObject({ outcome: 'pass', fg: '#f7efe1', need: 3 })
  })

  it('passes a fill alone', () => {
    expect(judgeBox(box({ fill: c('#ffd23f') })).outcome).toBe('pass')
  })

  it('fails when both are below 3: the line colour of a divider at 1.69', () => {
    const verdict = judgeBox(box({ border: c('#48414c') }))
    expect(verdict.outcome).toBe('fail')
    expect(cut(verdict.ratio as number)).toBe('1.69')
  })

  it('composites a semi-transparent border before comparing it', () => {
    expect(judgeBox(box({ border: [247, 239, 225, 0.18] })).fg).toBe('#48414c')
  })

  it('skips an inactive control', () => {
    expect(judgeBox(box({ border: c('#48414c'), inactive: true })).outcome).toBe('skip')
  })

  // A segmented control's options have no edge of their own; the boundary WCAG 1.4.11 asks for is the group's (#430).
  describe('a radio in a group with a border', () => {
    const radio = (change: Record<string, unknown> = {}) => box({ role: 'radio', text: 'Hell', fill: c('#221b2b'), ...change })

    it('passes by the group border when the option is the colour of the card', () => {
      expect(judgeBox(radio({ group: { border: c('#f7efe1'), behind: [flat('#221b2b')] } }))).toMatchObject({ outcome: 'pass', fg: '#f7efe1', need: 3 })
    })

    it('passes on the page colour too (the stepper)', () => {
      const verdict = judgeBox(radio({ behind: [flat('#17121d')], group: { border: c('#f7efe1'), behind: [flat('#17121d')] } }))
      expect(verdict).toMatchObject({ outcome: 'pass', fg: '#f7efe1', bg: '#17121d' })
    })

    it('fails without a group, and with a null one: the own fill is 1.10:1', () => {
      for (const raw of [radio({ behind: [flat('#17121d')] }), radio({ behind: [flat('#17121d')], group: null })]) {
        const verdict = judgeBox(raw)
        expect(verdict.outcome).toBe('fail')
        expect(cut(verdict.ratio as number)).toBe('1.10')
      }
    })

    it('is not rescued by a weak group border (1.69:1)', () => {
      expect(judgeBox(radio({ group: { border: c('#48414c'), behind: [flat('#221b2b')] } })).outcome).toBe('fail')
    })

    it('ignores a group over a picture', () => {
      expect(judgeBox(radio({ group: { border: c('#f7efe1'), behind: [{ color: c('#221b2b'), image: 'picture' as const, stops: [] as Rgba[] }] } })).outcome).toBe('fail')
    })

    it('skips an inactive radio even with a good group', () => {
      expect(judgeBox(radio({ inactive: true, group: { border: c('#f7efe1'), behind: [flat('#221b2b')] } })).outcome).toBe('skip')
    })

    it('returns an own pass as it is: the fill, not the group', () => {
      const verdict = judgeBox(radio({ fill: c('#f7efe1'), group: { border: c('#ffd23f'), behind: [flat('#17121d')] } }))
      expect(verdict).toMatchObject({ outcome: 'pass', fg: '#f7efe1', bg: '#221b2b' })
    })
  })
})

describe('judgeRing', () => {
  const ring = (change: Record<string, unknown>) => ({ key: 'a:1', role: 'a', text: 'Zurück', behind: [flat('#17121d')], ring: c('#8fb3ff'), width: 3, style: 'solid', on: 'self', visible: true, ...change })

  it('fails a control without a ring', () => {
    expect(judgeRing(ring({ on: 'none', ring: null }))).toMatchObject({ outcome: 'fail', why: 'no-ring' })
  })

  it('fails a ring that focus-visible does not show, or of width 0', () => {
    expect(judgeRing(ring({ visible: false })).why).toBe('no-ring')
    expect(judgeRing(ring({ width: 0 })).why).toBe('no-ring')
  })

  it('passes the dark focus colour on the page at 8.81', () => {
    const verdict = judgeRing(ring({}))
    expect(verdict.outcome).toBe('pass')
    expect(cut(verdict.ratio as number)).toBe('8.81')
  })
})

describe('judgeSurface', () => {
  const surface = (change: Record<string, unknown>) => ({ key: 'div:1', role: 'div', text: '', behind: [flat('#17121d')], kind: 'card', fill: null, border: null, shadow: null, ...change })

  it('passes a card whose fill differs from the page, at 1.10', () => {
    const verdict = judgeSurface(surface({ fill: c('#221b2b') }))
    expect(verdict.outcome).toBe('pass')
    expect(cut(verdict.ratio as number)).toBe('1.10')
  })

  it('passes a fill equal to the backdrop when the border differs', () => {
    expect(judgeSurface(surface({ fill: c('#17121d'), border: c('#f7efe1') })).outcome).toBe('pass')
  })

  it('fails when fill, border and shadow all equal the backdrop', () => {
    expect(judgeSurface(surface({ fill: c('#17121d'), border: c('#17121d') }))).toMatchObject({ outcome: 'fail', why: 'same-as-behind' })
  })

  // A layer whose whole edge is the window or a bordered neighbour (the Award ceremony, #409).
  describe('a framed layer', () => {
    const LINE = c('#f7efe1')
    const PAPER = c('#17121d')
    const layer = (change: Record<string, unknown>) => surface({ kind: 'dialog', fill: PAPER, ...change })
    const window4 = { top: 'window', right: 'window', bottom: 'window', left: 'window' }

    it('passes a layer on the window\'s whole edge (phone)', () => {
      expect(judgeSurface(layer({ frame: window4 }))).toMatchObject({ outcome: 'pass', why: null })
    })

    it('passes the ceremony at 1440: header above, side panel right, window left and below', () => {
      const frame = { top: { border: LINE }, right: { border: LINE }, bottom: 'window', left: 'window' }
      expect(judgeSurface(layer({ frame }))).toMatchObject({ outcome: 'pass', why: null })
    })

    it('keeps the same-as-behind pairing in the passing verdict', () => {
      expect(judgeSurface(layer({ frame: window4 }))).toMatchObject({ fg: '#17121d', bg: '#17121d', ratio: 1 })
    })

    it('fails a bottom sheet with a bare side above it', () => {
      const frame = { top: null, right: 'window', bottom: 'window', left: 'window' }
      expect(judgeSurface(layer({ frame }))).toMatchObject({ outcome: 'fail', why: 'same-as-behind' })
    })

    it('fails a centred dialog with four bare sides, and one without a frame', () => {
      const bare = { top: null, right: null, bottom: null, left: null }
      expect(judgeSurface(layer({ frame: bare }))).toMatchObject({ outcome: 'fail', why: 'same-as-behind' })
      expect(judgeSurface(layer({}))).toMatchObject({ outcome: 'fail', why: 'same-as-behind' })
      expect(judgeSurface(layer({ frame: null }))).toMatchObject({ outcome: 'fail', why: 'same-as-behind' })
    })

    it('fails a neighbour border that stays under 3:1 on the fill', () => {
      const frame = { top: { border: c('#221b2b') }, right: 'window', bottom: 'window', left: 'window' }
      expect(judgeSurface(layer({ frame }))).toMatchObject({ outcome: 'fail', why: 'same-as-behind' })
    })

    it('fails a translucent layer: the page shows through', () => {
      expect(judgeSurface(layer({ fill: c('#17121d', 0.5), frame: window4 }))).toMatchObject({ outcome: 'fail', why: 'same-as-behind' })
    })

    it('applies to a dialog only, not to a card or a menu', () => {
      expect(judgeSurface(layer({ kind: 'card', frame: window4 }))).toMatchObject({ outcome: 'fail', why: 'same-as-behind' })
      expect(judgeSurface(layer({ kind: 'menu', frame: window4 }))).toMatchObject({ outcome: 'fail', why: 'same-as-behind' })
    })

    it('never changes a pass: a fill that differs keeps its own ratio', () => {
      const verdict = judgeSurface(layer({ fill: c('#221b2b'), frame: window4 }))
      expect(verdict.outcome).toBe('pass')
      expect(cut(verdict.ratio as number)).toBe('1.10')
    })

    it('is a second way to pass, not a replacement for the border or the shadow', () => {
      expect(judgeSurface(layer({ border: c('#17121d'), frame: window4 })).outcome).toBe('pass')
      const open = { top: null, right: 'window', bottom: 'window', left: 'window' }
      expect(judgeSurface(layer({ border: c('#17121d'), frame: open })).outcome).toBe('fail')
    })
  })
})

describe('lines', () => {
  const raws = [textOf({ key: 'a', text: 'eins' }), textOf({ key: 'b', text: 'zwei' }), textOf({ key: 'c', text: 'drei' }), textOf({ key: 'd', text: 'vier' })]
  const name = (raw: { text: string }) => raw.text

  it('joins three elements with one pairing into one line', () => {
    const three = raws.slice(0, 3)
    const result = lines('text', three, three.map(judgeText), name)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ kind: 'text', role: 'p', count: 3, texts: ['eins', 'zwei', 'drei'], keys: ['a', 'b', 'c'], outcome: 'pass' })
  })

  it('names at most the first three, and keeps every key', () => {
    const result = lines('text', raws, raws.map(judgeText), name)
    expect(result[0]!.texts).toEqual(['eins', 'zwei', 'drei'])
    expect(result[0]!.keys).toHaveLength(4)
  })

  it('gives no line for no element', () => {
    expect(lines('text', [], [], name)).toEqual([])
  })

  it('keeps a fail and a pass as two lines', () => {
    const pair = [raws[0]!, textOf({ key: 'x', color: c('#17121d'), behind: [flat('#17121d')] })]
    const result = lines('text', pair, pair.map(judgeText), name)
    expect(result.map(line => line.outcome)).toEqual(['pass', 'fail'])
  })
})

describe('same', () => {
  const item = (change: Record<string, unknown> = {}) => ({ kind: 'text', key: 'p:1#t0', role: 'p', text: 'Anmelden', behind: [flat('#221b2b')], color: c('#b9ad9f'), ...change })

  it('finds no difference in equal readings', () => {
    expect(same([item()], [item()])).toEqual([])
  })

  it('names one changed colour', () => {
    const result = same([item({ color: c('#17121d') })], [item()])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ key: 'p:1#t0', what: 'color', dark: '#17121d', system: '#b9ad9f' })
  })

  it('names a changed backdrop', () => {
    const result = same([item({ behind: [flat('#17121d')] })], [item()])
    expect(result.map(difference => difference.what)).toEqual(['behind'])
  })

  it('names an item only one reading has as missing', () => {
    const result = same([item(), item({ key: 'p:2#t0' })], [item()])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ key: 'p:2#t0', what: 'missing' })
  })
})

describe('label', () => {
  const copy = ['Anmelden', 'Willkommen, {name}!', '{n}', 'Eine Runde | {n} Runden']

  it('names a text that is a copy string', () => {
    expect(label('Anmelden', copy, false)).toBe('„Anmelden“')
  })

  it('matches a copy string with a placeholder by its filled form, and prints the copy, not the filler', () => {
    expect(label('Willkommen, Anna!', copy, false)).toBe('„Willkommen, {name}!“')
  })

  it('matches each alternative of a plural copy string', () => {
    expect(label('Eine Runde', copy, false)).toBe('„Eine Runde“')
    expect(label('3 Runden', copy, false)).toBe('„{n} Runden“')
  })

  it('does not let a copy string that is only a placeholder name every text', () => {
    expect(label('Anna Beispiel', copy, false)).toBe('‹13 Zeichen›')
  })

  it('names the dev Users and the script\'s own R011 names', () => {
    expect(label('Dev Host', copy, false)).toBe('„Dev Host“')
    expect(label('R011 Dunkel-Check Spiel', copy, false)).toBe('„R011 Dunkel-Check Spiel“')
  })

  it('hides any other text, which comes from the database', () => {
    expect(label('Anna Beispiel', [], false)).toBe('‹13 Zeichen›')
  })

  it('names every text of a static state', () => {
    expect(label('Anna Beispiel', [], true)).toBe('„Anna Beispiel“')
  })
})
