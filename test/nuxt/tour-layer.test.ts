import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TourLayer from '~/components/TourLayer.vue'
import { MEMBER_TOUR } from '~~/shared/tour'

// The Tour's layer (#647): one box in the popover look with the step's text and its buttons. It takes the keys, holds the focus, announces each
// step and says how the Tour ended; the page's `useTour` decides when it is open and saves what was seen. The look is provisional (#460), so the
// seams here are what a User and assistive technology observe: text, roles, buttons, keys, focus.

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(open = true, steps = MEMBER_TOUR) {
  page = await mountSuspended(TourLayer, { props: { open, steps }, attachTo: document.body })
  await flushPromises()
  return page
}

afterEach(() => {
  page?.unmount()
  page = undefined
  document.body.innerHTML = ''
})

const box = () => document.querySelector<HTMLElement>('[role="dialog"]')
const buttons = () => [...(box()?.querySelectorAll('button') ?? [])].map(button => button.textContent?.trim())
const button = (label: string) => [...box()!.querySelectorAll('button')].find(element => element.textContent?.trim() === label)!
const status = () => box()!.querySelector('[role="status"]')!.textContent
const title = () => document.getElementById(box()!.getAttribute('aria-labelledby')!)?.textContent?.trim()

async function click(label: string) {
  button(label).click()
  await flushPromises()
}

async function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  await flushPromises()
}

const GREETING = 'Willkommen!'
const END = 'Das war’s'

describe('the steps', () => {
  it('opens on the first step with its title and text, no „Zurück“ and „Weiter“ going on', async () => {
    await mount()

    expect(title()).toBe(GREETING)
    expect(box()!.textContent).toContain('Ich zeige dir kurz, wie dieses Event funktioniert.')
    expect(buttons()).toEqual(['Überspringen', 'Weiter'])
  })

  it('goes on to the last step, which can go back and ends on „Fertig“', async () => {
    await mount()

    await click('Weiter')

    expect(title()).toBe(END)
    expect(buttons()).toEqual(['Überspringen', 'Zurück', 'Fertig'])
  })

  it('goes back to the first step', async () => {
    await mount()
    await click('Weiter')

    await click('Zurück')

    expect(title()).toBe(GREETING)
    expect(buttons()).not.toContain('Zurück')
  })

  it('says it is over with „Fertig“', async () => {
    await mount()
    await click('Weiter')

    await click('Fertig')

    expect(page!.emitted('over')).toEqual([['finished']])
  })

  it.each([['the first', 0], ['the last', 1]])('says it was skipped with „Überspringen“ on %s step', async (_which, index) => {
    await mount()
    if (index === 1) await click('Weiter')

    await click('Überspringen')

    expect(page!.emitted('over')).toEqual([['skipped']])
  })

  it('starts on the first step again when it opens again', async () => {
    await mount()
    await click('Weiter')
    await page!.setProps({ open: false })
    await page!.setProps({ open: true })
    await flushPromises()

    expect(title()).toBe(GREETING)
  })

  it('finishes a run of one step with „Fertig“ at once', async () => {
    await mount(true, MEMBER_TOUR.slice(0, 1))

    expect(buttons()).toEqual(['Überspringen', 'Fertig'])
    await click('Fertig')

    expect(page!.emitted('over')).toEqual([['finished']])
  })

  it('renders nothing while closed', async () => {
    await mount(false)

    expect(box()).toBeNull()
    expect(document.body.textContent).not.toContain(GREETING)
  })
})

describe('the keys', () => {
  it('skips on Escape', async () => {
    await mount()

    await press('Escape')

    expect(page!.emitted('over')).toEqual([['skipped']])
  })

  it('walks with the arrows and finishes with ArrowRight on the last step', async () => {
    await mount()

    await press('ArrowRight')
    expect(title()).toBe(END)
    await press('ArrowLeft')
    expect(title()).toBe(GREETING)
    await press('ArrowLeft')
    expect(title()).toBe(GREETING)
    await press('ArrowRight')
    await press('ArrowRight')

    expect(page!.emitted('over')).toEqual([['finished']])
  })

  it('leaves the browser\'s own shortcuts alone: Alt, Ctrl or Meta with an arrow does nothing', async () => {
    await mount()
    await press('ArrowRight')

    for (const modifier of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      await press('ArrowLeft', modifier)
      expect(title()).toBe(END)
    }
    expect(page!.emitted('over')).toBeUndefined()
  })

  it('takes the keys while the focus is on the page behind, where a click on it leaves it', async () => {
    await mount()
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(document.activeElement).toBe(document.body)

    await press('ArrowRight')

    expect(title()).toBe(END)
  })

  it('takes no key while it is closed', async () => {
    await mount(false)

    await press('Escape')
    await press('ArrowRight')

    expect(page!.emitted('over')).toBeUndefined()
  })

  it('keeps the focus inside on Tab', async () => {
    await mount()
    const last = button('Weiter')
    last.focus()

    await press('Tab', {}, last)
    expect(box()!.contains(document.activeElement)).toBe(true)
    ;(document.activeElement as HTMLElement).blur()
    await press('Tab')

    expect(box()!.contains(document.activeElement)).toBe(true)
  })
})

describe('the focus', () => {
  it('goes into the dialog when it opens and back to where it was when it closes', async () => {
    const before = document.createElement('button')
    document.body.append(before)
    before.focus()
    await mount(false)

    await page!.setProps({ open: true })
    await flushPromises()
    expect(box()!.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(button('Weiter'))

    await page!.setProps({ open: false })
    await flushPromises()
    expect(document.activeElement).toBe(before)
  })

  it('stays on the forward button after a step, also where „Zurück“ has gone', async () => {
    await mount()

    await click('Weiter')
    expect(document.activeElement).toBe(button('Fertig'))

    await click('Zurück')
    expect(document.activeElement).toBe(button('Weiter'))
  })
})

describe('for assistive technology', () => {
  it('is a modal dialog named by the step\'s title', async () => {
    await mount()

    expect(box()!.getAttribute('aria-modal')).toBe('true')
    expect(box()!.getAttribute('aria-labelledby')).toBeTruthy()
    expect(title()).toBe(GREETING)
    await click('Weiter')
    expect(title()).toBe(END)
  })

  it('announces each step politely with its title and text', async () => {
    await mount()
    const region = box()!.querySelector('[role="status"]')!

    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(status()).toContain(GREETING)
    expect(status()).toContain('Ich zeige dir kurz')
    await click('Weiter')

    expect(status()).toContain(END)
    expect(status()).toContain('Auf deinem Profil')
    expect(status()).not.toContain(GREETING)
  })
})

describe('the look', () => {
  it('stands on the popover layer with the scale\'s class only, and has no scrim and no Compibert', async () => {
    await mount()

    const classes = [...page!.element.classList, ...[...page!.element.querySelectorAll('*')].flatMap(element => [...element.classList])]
    expect(page!.element.classList).toContain('layer-popover')
    expect(classes.filter(token => /^-?z-/.test(token))).toEqual([])
    expect(page!.element.classList).toContain('pointer-events-none')
    expect(box()!.classList).toContain('pointer-events-auto')
    expect(page!.element.querySelector('.bg-overlay, .bg-backdrop')).toBeNull()
    expect(page!.element.querySelector('svg[aria-label], [data-testid="compibert"]')).toBeNull()
  })
})
