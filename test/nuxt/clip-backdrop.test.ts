import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ClipBackdrop from '~/components/ClipBackdrop.vue'
import { clean, theme } from '../unit/css-tokens'

// The Clip's backdrop (#587): a full-viewport scrim of its own, outside the Clip's section, while a Clip shows on this device. It has no
// state or instant of its own: the page passes `shown` on from the overlay. happy-dom computes no layout and stubs Transition, so presence,
// attributes and DOM position are the seams here; the colour and the layers are the browser check's.

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

const html = () => document.documentElement.classList
const backdrop = () => page!.find('[data-testid="clip-backdrop"]')

async function mount(shown: boolean) {
  page = await mountSuspended(ClipBackdrop, { props: { shown } })
  await flushPromises()
  return page
}

afterEach(() => {
  page?.unmount()
  page = undefined
  html().remove('overflow-hidden', 'scroll-gutter')
})

describe('the backdrop', () => {
  it('is one hidden, full-viewport layer of its own colour and layer, with nothing in it to reach', async () => {
    await mount(true)

    expect(page!.findAll('[data-testid="clip-backdrop"]')).toHaveLength(1)
    expect(backdrop().attributes('aria-hidden')).toBe('true')
    expect(backdrop().classes()).toEqual(expect.arrayContaining(['fixed', 'inset-0', 'layer-backdrop', 'bg-backdrop']))
    expect(backdrop().element.tagName).toBe('DIV')
    expect(backdrop().find('section').exists()).toBe(false)
    expect(backdrop().find('button').exists()).toBe(false)
  })

  it('does nothing on a click, and lies outside any section', async () => {
    await mount(true)

    await backdrop().trigger('click')

    expect(page!.emitted()).toEqual({})
    expect(backdrop().exists()).toBe(true)
    expect(backdrop().element.closest('section')).toBeNull()
  })

  it('is absent while no Clip shows', async () => {
    await mount(false)

    expect(backdrop().exists()).toBe(false)
  })

  it('fades in with the Clip\'s own duration and curve, and out with the Clip\'s own leave', async () => {
    await mount(true)

    const transition = page!.findComponent({ name: 'Transition' })
    expect(transition.props('enterActiveClass')).toBe('animate-backdrop-in')
    expect(transition.props('leaveActiveClass')).toBe('transition-opacity dur-base ease-in')
    expect(transition.props('leaveToClass')).toBe('opacity-0')
    expect(transition.props('appear')).toBeFalsy()
  })
})

describe('the stylesheet', () => {
  const css = clean(theme)

  it('opens the backdrop over --cp-dur-slow on --cp-ease-out, and gives it the Clip\'s calm fade under reduced motion', () => {
    expect(css).toMatch(/--animate-backdrop-in:[^;]*cp-fade-in[^;]*var\(--cp-dur-slow\)[^;]*var\(--cp-ease-out\)/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.animate-backdrop-in[^}]*cp-fade-in var\(--cp-dur-fast\) linear both/)
    expect(css).toMatch(/\[data-motion=reduced\] \.animate-backdrop-in[^{]*\{ animation: cp-fade-in var\(--cp-dur-fast\) linear both; \}/)
  })
})

// The lock takes the scrollbar away on a desktop with a classic one, and the page and every fixed element would move by its width (#658).
// So a page that scrolls keeps the scrollbar's place as a gutter while locked; a page that does not scroll has no scrollbar and needs none.
// happy-dom has no layout: the scrollbar is the difference between the window's width and the root's `clientWidth`, which the test sets.
describe('the lock keeps the width of the page (#658)', () => {
  const SCROLLBAR = 15
  const scrollbar = (width: number) => Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => window.innerWidth - width })
  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, 'clientWidth')
  })

  it('on a page that scrolls, keeps the scrollbar\'s place while locked, and gives it back with the lock', async () => {
    scrollbar(SCROLLBAR)
    await mount(true)
    expect(html().contains('overflow-hidden')).toBe(true)
    expect(html().contains('scroll-gutter')).toBe(true)

    await page!.setProps({ shown: false })
    expect(html().contains('overflow-hidden')).toBe(false)
    expect(html().contains('scroll-gutter')).toBe(false)
  })

  it('on a page that does not scroll, reserves no gutter: nothing was there to keep', async () => {
    scrollbar(0)
    await mount(true)

    expect(html().contains('overflow-hidden')).toBe(true)
    expect(html().contains('scroll-gutter')).toBe(false)
  })

  it('frees the gutter too when it is unmounted while shown', async () => {
    scrollbar(SCROLLBAR)
    await mount(true)

    page!.unmount()
    page = undefined

    expect(html().contains('scroll-gutter')).toBe(false)
  })

  it('has a `scroll-gutter` utility that keeps the gutter even where the scrollbar is hidden', () => {
    expect(clean(theme)).toMatch(/@utility scroll-gutter \{\s*scrollbar-gutter: stable;?\s*\}/)
  })
})

describe('the page does not scroll behind it', () => {
  it('locks the page while shown, and frees it at once when the Clip goes', async () => {
    await mount(true)
    expect(html().contains('overflow-hidden')).toBe(true)

    await page!.setProps({ shown: false })
    expect(html().contains('overflow-hidden')).toBe(false)

    await page!.setProps({ shown: true })
    expect(html().contains('overflow-hidden')).toBe(true)
  })

  it('frees the page when it is unmounted while shown', async () => {
    await mount(true)
    expect(html().contains('overflow-hidden')).toBe(true)

    page!.unmount()
    page = undefined

    expect(html().contains('overflow-hidden')).toBe(false)
  })

  it('leaves the page alone while no Clip shows', async () => {
    await mount(false)

    expect(html().contains('overflow-hidden')).toBe(false)
  })
})
