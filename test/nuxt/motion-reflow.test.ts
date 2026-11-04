import { afterEach, describe, expect, it, vi } from 'vitest'
import { leaveInPlace, REFLOW_CLASS, unwatched } from '~/utils/motion'

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

describe('leaveInPlace', () => {
  /** An element laid out by the browser: jsdom has no layout, so the offsets are given. */
  function laidOut(offsets: { top: number, left: number, width: number, height: number }) {
    const element = document.createElement('li')
    Object.defineProperties(element, {
      offsetTop: { value: offsets.top },
      offsetLeft: { value: offsets.left },
      offsetWidth: { value: offsets.width },
      offsetHeight: { value: offsets.height },
    })
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
})
