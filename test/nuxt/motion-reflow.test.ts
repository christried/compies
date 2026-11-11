import { afterEach, describe, expect, it, vi } from 'vitest'
import { CARD_REFLOW_CLASS, leaveInPlace, REFLOW_CLASS, riseFade, unwatched } from '~/utils/motion'

// What the page's reflow asks for (#276, F4 of the s5 check): the curve and duration of a block or a card that moves because something above it left,
// and the leaver that goes out of the layout in the flush that starts its fade. jsdom has no layout and no transitions: this proves what the helpers
// set, and the browser check (scripts/browser/standings.mjs) proves that the blocks glide.

afterEach(() => {
  vi.restoreAllMocks()
})

describe('unwatched', () => {
  it('is true while the tab is hidden, and false while it shows', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get')

    visibility.mockReturnValue('hidden')
    expect(unwatched()).toBe(true)

    visibility.mockReturnValue('visible')
    expect(unwatched()).toBe(false)
  })
})

describe('the reflow class', () => {
  it('is a transform on the UI curve over the slow duration, and nothing under reduced motion', () => {
    expect(REFLOW_CLASS.split(' ')).toEqual(['transition-transform', 'dur-slow', 'ease-out', 'motion-reduce:transition-none', 'reduced:transition-none'])
  })
})

describe('the card reflow class', () => {
  it('is a transform on the in-out curve over the slower duration, and nothing under reduced motion', () => {
    expect(CARD_REFLOW_CLASS.split(' ')).toEqual(['transition-transform', 'dur-slower', 'ease-io', 'motion-reduce:transition-none', 'reduced:transition-none'])
  })
})

describe('leaveInPlace', () => {
  /** An element laid out by the browser: jsdom has no layout, so its rect is given (the list it sits in starts at 0, 0). */
  function laidOut(rect: { top: number, left: number, width: number, height: number }) {
    const element = document.createElement('li')
    element.getBoundingClientRect = () => rect as DOMRect
    return element
  }
  /** The page's motion setting, as the tokens put it in `--cp-motion`. */
  function motion(value: 'full' | 'reduced') {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => (name === '--cp-motion' ? value : '') } as CSSStyleDeclaration)
  }

  it('pins the element where it is, out of the flow, and takes it out of reach while it fades', () => {
    motion('full')
    const element = laidOut({ top: 102, left: 330, width: 320, height: 96 })

    leaveInPlace(element)

    expect(element.style.position).toBe('absolute')
    expect([element.style.top, element.style.left, element.style.width, element.style.height]).toEqual(['102px', '330px', '320px', '96px'])
    expect(element.hasAttribute('inert')).toBe(true)
    expect(element.style.display).toBe('')
  })

  // Vue's move transition takes any difference between the old and the new rect for a move, and gives that element a 0 s transition: a leaver pinned on a
  // rounded `offsetTop` (the second row of cards stands at 320.2 px) differs by 0.2 px and loses its fade (0.8 review, F5).
  it('pins at the exact, fractional place, so Vue\'s move transition sees no move and the fade runs', () => {
    motion('full')
    const element = laidOut({ top: 320.2, left: 556.5, width: 319.6, height: 96.4 })

    leaveInPlace(element)

    expect([element.style.top, element.style.left, element.style.width, element.style.height]).toEqual(['320.2px', '556.5px', '319.6px', '96.4px'])
  })

  it('pins against the list it sits in, not against the page', () => {
    motion('full')
    const list = document.createElement('ul')
    list.getBoundingClientRect = () => ({ top: 200, left: 24 }) as DOMRect
    const element = laidOut({ top: 302, left: 24, width: 320, height: 96 })
    list.append(element)

    leaveInPlace(element)

    expect([element.style.top, element.style.left]).toEqual(['102px', '0px'])
  })

  it('hides the leaver at once under reduced motion, so it does not show over the block that moved up', () => {
    motion('reduced')
    const element = laidOut({ top: 0, left: 0, width: 320, height: 96 })

    leaveInPlace(element)

    expect(element.style.display).toBe('none')
  })

  it('hides the leaver at once in a hidden tab, where the browser runs no frame to fade it', () => {
    motion('full')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const element = laidOut({ top: 0, left: 0, width: 320, height: 96 })

    leaveInPlace(element)

    expect(element.style.display).toBe('none')
  })

  // Two Results can arrive in one read: Vue calls the hook for each leaver in turn, and the first one's pin takes it out of the flow, so the cards after it move up.
  // The second leaver is pinned where it stood when the render began, not where the first one's pin left it (else it fades one cell off, and Vue's move
  // transition, which takes it for a card that moved, drags it across the grid).
  it('pins a second leaver of the same render where it stood, not where the first one\'s pin left it', () => {
    motion('full')
    const list = document.createElement('ul')
    const first = laidOut({ top: 0, left: 0, width: 320, height: 96 })
    // Once the first card is out of the flow, the second moves into its cell.
    const second = laidOut({ top: 0, left: 332, width: 320, height: 96 })
    second.getBoundingClientRect = () => ({ top: 0, left: first.style.position === 'absolute' ? 0 : 332, width: 320, height: 96 }) as DOMRect
    list.append(first, second)

    leaveInPlace(first)
    leaveInPlace(second)

    expect(second.style.left).toBe('332px')
  })
})

describe('riseFade', () => {
  /** An element whose `animate` the test watches. */
  function animating() {
    const element = document.createElement('div')
    const animate = vi.fn()
    Object.defineProperty(element, 'animate', { configurable: true, value: animate })
    return { element, animate }
  }
  /** The page's tokens: `--cp-dur-fast` and `--cp-ease-out` as the stylesheet resolves them (the minified CSS writes 140ms as .14s, #370). */
  function tokens(values: Record<string, string>) {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => values[name] ?? '' } as CSSStyleDeclaration)
  }

  it('fades the block in over --cp-dur-fast on --cp-ease-out, held at 0 until it starts (the stage block that rose under reduced motion, #441)', () => {
    tokens({ '--cp-dur-fast': '.14s', '--cp-ease-out': 'cubic-bezier(.16,1,.3,1)' })
    const { element, animate } = animating()

    riseFade(element)

    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' })
  })

  it('has the fallbacks of the tokens when the stylesheet has none: 140 ms on ease-out', () => {
    tokens({})
    const { element, animate } = animating()

    riseFade(element)

    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out', fill: 'backwards' })
  })

  it('does nothing for an element without the Web Animations API', () => {
    tokens({})
    const element = document.createElement('div')
    Object.defineProperty(element, 'animate', { configurable: true, value: undefined })

    expect(() => riseFade(element)).not.toThrow()
  })
})
