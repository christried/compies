import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StickerConfetti from '~/components/StickerConfetti.vue'

// The sticker confetti layer (#276, 04-motion § Confetti; built to be reused by the 0.9 award ceremony): a decorative layer over its positioned
// parent that bursts pieces from a point and does nothing under reduced motion, so no caller has to remember.

let page: VueWrapper | undefined
let animations: { onfinish: (() => void) | null }[]
const originalAnimate = Element.prototype.animate

/** The page's motion setting, as the tokens put it in `--cp-motion`. */
function motion(value: 'full' | 'reduced') {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => (name === '--cp-motion' ? value : '') } as CSSStyleDeclaration)
}

const pieces = () => page!.element.querySelectorAll('span')

async function mount() {
  page = await mountSuspended(StickerConfetti)
  return page
}

beforeEach(() => {
  animations = []
  Element.prototype.animate = vi.fn(() => {
    const animation = { onfinish: null as (() => void) | null }
    animations.push(animation)
    return animation
  }) as unknown as typeof Element.prototype.animate
  motion('full')
})

afterEach(() => {
  page?.unmount()
  page = undefined
  Element.prototype.animate = originalAnimate
  vi.restoreAllMocks()
})

describe('StickerConfetti', () => {
  it('is a layer that screen readers skip and the pointer goes through, over its parent', async () => {
    await mount()

    const layer = page!.element as HTMLElement
    expect(layer.getAttribute('aria-hidden')).toBe('true')
    expect(layer.classList).toContain('pointer-events-none')
    expect(layer.classList).toContain('absolute')
    expect(layer.classList).toContain('inset-0')
    expect(layer.classList).toContain('layer-confetti')
    expect(pieces()).toHaveLength(0)
  })

  it('bursts 18 pieces from a point by default', async () => {
    await mount()

    ;(page!.vm as unknown as { burst: (x: number, y: number, count?: number) => void }).burst(120, 40)

    expect(pieces()).toHaveLength(18)
    const first = pieces()[0] as HTMLElement
    // The piece is centred on the point: 12 px wide, so left = x − 6.
    expect(first.style.left).toBe('114px')
    expect(first.style.top).toBe('34px')
  })

  it('bursts as many pieces as it is asked for', async () => {
    await mount()

    ;(page!.vm as unknown as { burst: (x: number, y: number, count?: number) => void }).burst(0, 0, 5)

    expect(pieces()).toHaveLength(5)
  })

  it('removes each piece when it has landed', async () => {
    await mount()
    ;(page!.vm as unknown as { burst: (x: number, y: number, count?: number) => void }).burst(0, 0, 3)
    expect(pieces()).toHaveLength(3)

    for (const animation of animations.filter(item => item.onfinish !== null)) animation.onfinish!()

    expect(pieces()).toHaveLength(0)
  })

  it('adds no piece under reduced motion', async () => {
    motion('reduced')
    await mount()

    ;(page!.vm as unknown as { burst: (x: number, y: number, count?: number) => void }).burst(120, 40)

    expect(pieces()).toHaveLength(0)
    expect(Element.prototype.animate).not.toHaveBeenCalled()
  })
})
