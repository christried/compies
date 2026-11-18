import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RichNotesEditor from '~/components/RichNotesEditor.vue'
import type { NotesDoc } from '~~/shared/notes-doc'
import { ensureGeometry, editorOf, toolbarButton } from './helpers/notes-editor'
import { motion } from './motion'

// The motions of the link control (#454, #822, 04-motion § Notizen, CODING_STANDARDS § Motion): the popover from 980 px (0.14 s on --cp-ease-out, `translateY(-4px)`,
// closing in 0.14 s on --cp-ease-in), the bar below it (height, 0.22 s in and 0.14 s out), and what each does under reduced motion. Element.prototype.animate is a
// recorder: happy-dom animates nothing, so what is pinned is what the control asks the browser to do, and whether it lets go when the animation is cancelled.

const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Regeln' }] }] } as NotesDoc
const OUT = 'cubic-bezier(.16,1,.3,1)'
const IN = 'cubic-bezier(.7,0,.84,0)'

interface Call { element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions, finish: () => void, cancel: () => void }
let calls: Call[]
const realAnimate = Element.prototype.animate

beforeEach(() => {
  calls = []
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    let settle: (cancelled: boolean) => void = () => {}
    const finished = new Promise<Animation>((resolve, reject) => {
      settle = cancelled => (cancelled ? reject(new DOMException('cancelled', 'AbortError')) : resolve(animation))
    })
    const animation = { finished, onfinish: null as null | (() => void), cancel: () => settle(true) } as unknown as Animation
    calls.push({
      element: this,
      keyframes,
      options,
      finish: () => {
        settle(false)
        animation.onfinish?.(new Event('finish') as never)
      },
      cancel: () => settle(true),
    })
    return animation
  } as unknown as typeof Element.prototype.animate
})
afterEach(() => {
  Element.prototype.animate = realAnimate
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountOpen(wide: boolean, look: 'full' | 'reduced') {
  ensureGeometry()
  motion(look)
  vi.stubGlobal('matchMedia', () => ({ matches: wide, addEventListener: () => {}, removeEventListener: () => {} }))
  const page = await mountSuspended(RichNotesEditor, { props: { modelValue: doc }, global: { stubs: { Transition: false } }, attachTo: document.body })
  await vi.waitFor(() => expect(page.find('[role="textbox"]').exists()).toBe(true))
  editorOf(page).commands.setTextSelection({ from: 1, to: 7 })
  calls.length = 0
  await toolbarButton(page, 'Link').trigger('click')
  await vi.waitFor(() => expect(page.find('input[type="url"]').exists()).toBe(true))
  await flushPromises()
  return page
}
type Page = Awaited<ReturnType<typeof mountOpen>>
const control = (page: Page) => page.find('[aria-label="Link"][role]')
const close = async (page: Page) => {
  calls.length = 0
  await page.get('input[type="url"]').trigger('keydown', { key: 'Escape' })
  await flushPromises()
}

describe('the popover of the link control (from 980 px)', () => {
  it('opens in 140 ms on ease-out, fading in and moving up from 4 px below', async () => {
    const page = await mountOpen(true, 'full')

    const run = calls.find(call => call.element === control(page).element)!
    expect(run, 'something animated').toBeDefined()
    expect(run.keyframes).toEqual([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }])
    expect(run.options.duration).toBe(140)
    expect(run.options.easing).toBe(OUT)
  })

  it('closes in 140 ms on ease-in, to the same 4 px and to transparent', async () => {
    const page = await mountOpen(true, 'full')
    calls.at(-1)!.finish()
    const element = control(page).element

    await close(page)

    const run = calls.find(call => call.element === element)!
    expect(run, 'something animated').toBeDefined()
    expect(run.keyframes).toEqual([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px)' }])
    expect(run.options.duration).toBe(140)
    expect(run.options.easing).toBe(IN)
  })

  it('only fades under reduced motion, in and out, with no transform', async () => {
    const page = await mountOpen(true, 'reduced')
    const opening = calls.find(call => call.element === control(page).element)!
    expect(opening.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(opening.options.duration).toBe(140)
    opening.finish()

    await close(page)

    const closing = calls.at(-1)!
    expect(closing.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(closing.keyframes.some(frame => 'transform' in frame)).toBe(false)
  })

  it('goes when its closing animation is cancelled', async () => {
    const page = await mountOpen(true, 'full')
    calls.at(-1)!.finish()

    await close(page)
    calls.at(-1)!.cancel()

    await vi.waitFor(() => expect(control(page).exists()).toBe(false))
  })
})

describe('the bar of the link control (below 980 px)', () => {
  it('opens from height 0 in 220 ms on ease-out', async () => {
    const page = await mountOpen(false, 'full')

    const run = calls.find(call => call.element === control(page).element)!
    expect(run, 'something animated').toBeDefined()
    expect(run.keyframes[0]).toEqual({ height: '0px' })
    expect(Object.keys(run.keyframes[1]!)).toEqual(['height'])
    expect(run.options.duration).toBe(220)
    expect(run.options.easing).toBe(OUT)
  })

  it('closes to height 0 in 140 ms on ease-in', async () => {
    const page = await mountOpen(false, 'full')
    calls.at(-1)!.finish()
    const element = control(page).element

    await close(page)

    const run = calls.find(call => call.element === element)!
    expect(run, 'something animated').toBeDefined()
    expect(run.keyframes.at(-1)).toMatchObject({ height: '0px' })
    expect(run.options.duration).toBe(140)
    expect(run.options.easing).toBe(IN)
  })

  it('is cut under reduced motion: no height run, there at once and gone at once', async () => {
    const page = await mountOpen(false, 'reduced')

    expect(control(page).exists()).toBe(true)
    expect(calls.some(call => call.keyframes.some(frame => 'height' in frame))).toBe(false)

    await close(page)

    expect(control(page).exists()).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('goes when its closing animation is cancelled, so the control does not stay in the page', async () => {
    const page = await mountOpen(false, 'full')
    calls.at(-1)!.finish()

    await close(page)
    expect(control(page).exists()).toBe(true)
    calls.at(-1)!.cancel()

    await vi.waitFor(() => expect(control(page).exists()).toBe(false))
  })

  it('lets go of its opening animation when it is cancelled: the clip comes off', async () => {
    const page = await mountOpen(false, 'full')
    const element = control(page).element as HTMLElement
    calls.find(call => call.element === element)!.cancel()
    await flushPromises()

    expect(element.style.overflow).not.toBe('hidden')
  })
})
