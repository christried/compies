import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import AppShell from '~/components/AppShell.vue'
import SettingsCard from '~/components/SettingsCard.vue'
import UserMenu from '~/components/UserMenu.vue'
import { revealTheme } from '~/utils/theme-reveal'
import { kitty, signInAs } from './auth'
import { shownToasts } from './event-page'
import { motion } from './motion'

// The Theme reveal (#931, 04-motion § UI enters): the new Appearance spreads as a circle from the tapped option over the old picture,
// or cross-fades under Reduced motion and in a browser without View Transitions. happy-dom has neither `startViewTransition` nor a
// reliable `animate`, so both are fakes; the seams are what the page can show: `<html data-theme-reveal>`, the keyframes handed to
// the browser and the order in which the new look is shown.

const html = document.documentElement
const reveal = () => html.dataset.themeReveal
/** An `apply` that notes what `data-theme-reveal` says at the moment the new look is shown. */
const seeing = (seen: (string | undefined)[]) => () => void seen.push(reveal())

interface FakeTransition {
  /** Runs the held callback, as the browser does once it has taken the old picture. */
  run: () => Promise<void>
  /** Lets `finished` resolve, as the browser does when the animation is over. */
  end: () => void
  /** Lets `ready` resolve (with `holdReady`), as the browser does once both pictures are taken. */
  markReady: () => void
  /** `<html data-theme>` the moment the callback was done, undefined before. */
  themeWhenDone: string | null | undefined
  /** The `.theme-edge`s in the document the moment the callback was done, undefined before. */
  edgesWhenDone?: HTMLElement[]
}

/**
 * A `document.startViewTransition` that runs the callback a task later, as the browser takes the old picture first. With `holdCallback`
 * the callback waits for `run()`, with `holdFinish` the transition waits for `end()`, with `holdReady` `ready` waits for `markReady()`,
 * with `skip` the transition is skipped once its callback ran: `ready` and `finished` reject, as a browser's do.
 * `edgesAtStart` is the number of `.theme-edge`s in the document each time a transition starts.
 */
function viewTransitions({ holdCallback = false, holdFinish = false, holdReady = false, skip = false } = {}) {
  const transitions: FakeTransition[] = []
  const edgesAtStart: number[] = []
  const start = vi.fn((callback: () => void | Promise<void>) => {
    edgesAtStart.push(document.querySelectorAll('.theme-edge').length)
    let run!: () => Promise<void>
    const ran = new Promise<void>((resolve) => {
      run = () => {
        resolve(Promise.resolve(callback()))
        return ran
      }
    })
    let end!: () => void
    const ended = holdFinish
      ? new Promise<void>((resolve) => {
          end = resolve
        })
      : Promise.resolve()
    let markReady!: () => void
    const readied = new Promise<void>((resolve) => {
      markReady = resolve
    })
    const skipped = () => Promise.reject(new DOMException('Skipped', 'AbortError'))
    const ready = skip ? ran.then(skipped) : holdReady ? readied : ran
    const finished = skip ? ran.then(skipped) : ran.then(() => ended)
    // Handled here too: a skipped transition's promises reject before the page takes them.
    ready.catch(() => {})
    finished.catch(() => {})
    const transition: FakeTransition = { run, end: () => end(), markReady: () => markReady(), themeWhenDone: undefined }
    // What the new picture is taken of: `<html data-theme>` and the edge the moment the callback is done.
    void ran.then(() => {
      transition.themeWhenDone = html.getAttribute('data-theme')
      transition.edgesWhenDone = [...document.querySelectorAll<HTMLElement>('.theme-edge')]
    })
    transitions.push(transition)
    if (!holdCallback) setTimeout(() => void run(), 0)
    return { ready, finished }
  })
  Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true, writable: true })
  return { start, transitions, edgesAtStart }
}

/** The `.theme-edge` in the document, if any. */
const edgeOf = () => document.querySelector('.theme-edge')

/** Every `.theme-edge` ever added to the page, however soon it leaves: the observer's records, read after a task. */
function watchEdges() {
  const added: Element[] = []
  const take = (records: MutationRecord[]) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof Element && node.matches('.theme-edge')) added.push(node)
    }
  }
  const observer = new MutationObserver(take)
  observer.observe(document.body, { childList: true, subtree: true })
  return {
    added,
    stop: async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
      take(observer.takeRecords())
      observer.disconnect()
      return added.length
    },
  }
}

const realAnimate = Object.getOwnPropertyDescriptor(html, 'animate')
/** `html.animate` recording its calls; the animation ends at once. */
function recordAnimate() {
  const animate = vi.fn(() => ({ finished: Promise.resolve() }))
  Object.defineProperty(html, 'animate', { value: animate, configurable: true, writable: true })
  return animate
}

/** A button at a known place: centre (100, 200) in a window of 400 x 600, so the farthest corner is 300 right and 400 down: radius 500. */
function tapped() {
  const button = document.createElement('button')
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 90, top: 190, width: 20, height: 20, right: 110, bottom: 210, x: 90, y: 190, toJSON: () => ({}) })
  return button
}

/** The tokens as the page's stylesheet sets them: the minified CSS spells 600ms as `.6s` and 140ms as `.14s` (#370). */
function tokens() {
  html.style.setProperty('--cp-dur-slower', '.6s')
  html.style.setProperty('--cp-dur-fast', '.14s')
  html.style.setProperty('--cp-ease-io', 'cubic-bezier(.1,.2,.3,.4)')
}

beforeEach(() => {
  vi.stubGlobal('innerWidth', 400)
  vi.stubGlobal('innerHeight', 600)
  tokens()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (document as { startViewTransition?: unknown }).startViewTransition
  if (realAnimate) Object.defineProperty(html, 'animate', realAnimate)
  else delete (html as { animate?: unknown }).animate
  html.removeAttribute('style')
  delete html.dataset.themeReveal
})

describe('revealTheme', () => {
  it('spreads a circle from the centre of the tapped option to the farthest corner, in dur-slower on ease-io', async () => {
    viewTransitions()
    const animate = recordAnimate()
    const apply = vi.fn()

    await revealTheme(tapped(), true, apply)

    expect(animate).toHaveBeenCalledOnce()
    expect(animate).toHaveBeenCalledWith(
      { clipPath: ['circle(0px at 100px 200px)', 'circle(500px at 100px 200px)'] },
      { duration: 600, easing: 'cubic-bezier(.1,.2,.3,.4)', pseudoElement: '::view-transition-new(root)' },
    )
    expect(apply).toHaveBeenCalledOnce()
  })

  it('marks the page as spreading while the transition runs, and not after', async () => {
    const vt = viewTransitions({ holdFinish: true })
    recordAnimate()

    const done = revealTheme(tapped(), true, () => {})
    await vi.waitFor(() => expect(vt.transitions).toHaveLength(1))
    expect(reveal()).toBe('spread')
    vt.transitions[0]!.end()
    await done

    expect(reveal()).toBeUndefined()
  })

  it('shows the new look in the transition\'s callback, not before the old picture is taken', async () => {
    const vt = viewTransitions({ holdCallback: true })
    recordAnimate()
    const apply = vi.fn()

    const done = revealTheme(tapped(), true, apply)
    await Promise.resolve()
    expect(apply).not.toHaveBeenCalled()
    await vt.transitions[0]!.run()
    await done

    expect(apply).toHaveBeenCalledOnce()
  })

  it('reads the tapped option before it waits: an element gone a task later still gives its centre', async () => {
    viewTransitions()
    const animate = recordAnimate()
    const button = tapped()

    const done = revealTheme(button, true, () => {})
    // The header's menu closes on the tap: its item is removed, and a removed element has an empty rect.
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 0, 0))
    await done

    expect(animate).toHaveBeenCalledWith(
      { clipPath: ['circle(0px at 100px 200px)', 'circle(500px at 100px 200px)'] },
      expect.anything(),
    )
  })

  it('shows the look at once and sets nothing for a choice that changes nothing', async () => {
    const vt = viewTransitions()
    const animate = recordAnimate()
    const seen: (string | undefined)[] = []

    await revealTheme(tapped(), false, seeing(seen))

    expect(seen).toEqual([undefined])
    expect(vt.start).not.toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
    expect(reveal()).toBeUndefined()
  })

  it('cross-fades under Reduced motion: marked fade while the look changes, gone after dur-fast, no transition', async () => {
    const vt = viewTransitions()
    motion('reduced')
    vi.useFakeTimers()
    const seen: (string | undefined)[] = []

    const done = revealTheme(tapped(), true, seeing(seen))

    expect(seen).toEqual(['fade'])
    expect(reveal()).toBe('fade')
    await vi.advanceTimersByTimeAsync(139)
    expect(reveal()).toBe('fade')
    await vi.advanceTimersByTimeAsync(1)
    await done
    expect(reveal()).toBeUndefined()
    expect(vt.start).not.toHaveBeenCalled()
  })

  it('cross-fades in a browser without View Transitions', async () => {
    vi.useFakeTimers()
    const animate = recordAnimate()
    const seen: (string | undefined)[] = []

    const done = revealTheme(tapped(), true, seeing(seen))

    expect(seen).toEqual(['fade'])
    await vi.advanceTimersByTimeAsync(140)
    await done
    expect(reveal()).toBeUndefined()
    expect(animate).not.toHaveBeenCalled()
  })

  it('cross-fades when there is no tapped option (a switch back), whatever the browser can do', async () => {
    const vt = viewTransitions()
    vi.useFakeTimers()
    const seen: (string | undefined)[] = []

    const done = revealTheme(null, true, seeing(seen))

    expect(seen).toEqual(['fade'])
    await vi.advanceTimersByTimeAsync(140)
    await done
    expect(vt.start).not.toHaveBeenCalled()
    expect(reveal()).toBeUndefined()
  })

  it('lets an older reveal end without clearing what a newer one set', async () => {
    const vt = viewTransitions({ holdFinish: true })
    recordAnimate()

    const first = revealTheme(tapped(), true, () => {})
    await vi.waitFor(() => expect(vt.transitions).toHaveLength(1))
    const second = revealTheme(tapped(), true, () => {})
    await vi.waitFor(() => expect(vt.transitions).toHaveLength(2))

    vt.transitions[0]!.end()
    await first
    expect(reveal()).toBe('spread')
    vt.transitions[1]!.end()
    await second
    expect(reveal()).toBeUndefined()
  })

  it('does not set the mark again when the newer one ended first', async () => {
    const vt = viewTransitions({ holdFinish: true })
    recordAnimate()

    const first = revealTheme(tapped(), true, () => {})
    await vi.waitFor(() => expect(vt.transitions).toHaveLength(1))
    const second = revealTheme(tapped(), true, () => {})
    await vi.waitFor(() => expect(vt.transitions).toHaveLength(2))

    vt.transitions[1]!.end()
    await second
    vt.transitions[0]!.end()
    await first

    expect(reveal()).toBeUndefined()
  })
})

// The edge of the circle (#933, note 20 „Kartenkante“): a card's cream line and ink shadow on the growing circle, in the new picture only.
describe('the edge of the circle', () => {
  it('a spread to Dunkel draws one edge after the new look, in the new picture only, at the circle\'s centre and radius', async () => {
    const vt = viewTransitions()
    recordAnimate()
    const apply = vi.fn()

    await revealTheme(tapped(), true, apply, 'dark')

    expect(apply).toHaveBeenCalledOnce()
    expect(vt.edgesAtStart).toEqual([0])
    expect(vt.transitions[0]!.edgesWhenDone).toHaveLength(1)
    const edge = vt.transitions[0]!.edgesWhenDone![0]!
    expect(edge.getAttribute('aria-hidden')).toBe('true')
    expect(edge.getAttribute('data-to')).toBe('dark')
    expect(edge.style.getPropertyValue('--vt-x')).toBe('100px')
    expect(edge.style.getPropertyValue('--vt-y')).toBe('200px')
    expect(edge.style.getPropertyValue('--vt-r')).toBe('500px')
    const disc = edge.querySelector(':scope > .theme-edge__disc')!
    expect(disc.querySelector(':scope > .theme-edge__line[data-theme="dark"]')).not.toBeNull()
    expect(disc.querySelector(':scope > .theme-edge__shadow[data-theme="light"]')).not.toBeNull()
  })

  it('a spread to Hell draws a light edge with the same children', async () => {
    const vt = viewTransitions()
    recordAnimate()

    await revealTheme(tapped(), true, () => {}, 'light')

    const edge = vt.transitions[0]!.edgesWhenDone![0]!
    expect(edge.getAttribute('data-to')).toBe('light')
    const disc = edge.querySelector(':scope > .theme-edge__disc')!
    expect(disc.querySelector(':scope > .theme-edge__line[data-theme="dark"]')).not.toBeNull()
    expect(disc.querySelector(':scope > .theme-edge__shadow[data-theme="light"]')).not.toBeNull()
  })

  it('runs with the circle: it is marked is-running when the transition is ready, and gone when it finishes', async () => {
    const vt = viewTransitions({ holdReady: true, holdFinish: true })
    recordAnimate()

    const done = revealTheme(tapped(), true, () => {}, 'dark')
    await vi.waitFor(() => expect(vt.transitions[0]!.edgesWhenDone).toHaveLength(1))
    const edge = vt.transitions[0]!.edgesWhenDone![0]!
    expect(edge.classList.contains('is-running')).toBe(false)

    vt.transitions[0]!.markReady()
    await vi.waitFor(() => expect(edge.classList.contains('is-running')).toBe(true))
    expect(edgeOf()).toBe(edge)

    vt.transitions[0]!.end()
    await done
    expect(edgeOf()).toBeNull()
  })

  it('is gone when the transition is skipped', async () => {
    const vt = viewTransitions({ skip: true })
    recordAnimate()

    await revealTheme(tapped(), true, () => {}, 'dark')

    expect(vt.transitions[0]!.edgesWhenDone).toHaveLength(1)
    expect(edgeOf()).toBeNull()
  })

  it('a second spread removes the first\'s edge before it starts: at no time two edges, and the second\'s stays until it finishes', async () => {
    const vt = viewTransitions({ holdCallback: true, holdFinish: true })
    recordAnimate()

    const first = revealTheme(tapped(), true, () => {}, 'dark')
    await vt.transitions[0]!.run()
    const firstEdge = edgeOf()
    const second = revealTheme(tapped(), true, () => {}, 'light')
    await vt.transitions[1]!.run()

    expect(firstEdge).not.toBeNull()
    expect(vt.edgesAtStart).toEqual([0, 0])
    expect(vt.transitions[1]!.edgesWhenDone).toHaveLength(1)
    const secondEdge = vt.transitions[1]!.edgesWhenDone![0]!
    expect(secondEdge).not.toBe(firstEdge)
    expect(secondEdge.getAttribute('data-to')).toBe('light')

    vt.transitions[0]!.end()
    await first
    expect(edgeOf()).toBe(secondEdge)
    vt.transitions[1]!.end()
    await second
    expect(edgeOf()).toBeNull()
  })

  it.each<[string, { reduced?: boolean, transitions?: boolean, origin?: boolean, changes?: boolean, to?: 'dark' | 'light' }]>([
    ['under Reduced motion', { reduced: true, to: 'dark' }],
    ['in a browser without View Transitions', { transitions: false, to: 'dark' }],
    ['with no tapped option', { origin: false, to: 'dark' }],
    ['for a choice that changes nothing', { changes: false, to: 'dark' }],
    ['for a spread without a look to draw it to', {}],
  ])('is drawn only with the circle, never %s', async (_name, options) => {
    if (options.reduced) motion('reduced')
    if (options.transitions !== false) viewTransitions()
    recordAnimate()
    const seen = watchEdges()
    const apply = vi.fn()

    await revealTheme(options.origin === false ? null : tapped(), options.changes ?? true, apply, options.to)

    expect(apply).toHaveBeenCalledOnce()
    expect(await seen.stop()).toBe(0)
    expect(edgeOf()).toBeNull()
  })
})

// ---- through the controls (the header's menu, the avatar menu's row, the Profil card) ----

const BUTTON = 'button[aria-label="Darstellung"]'
const theme = () => html.getAttribute('data-theme')

/** Every change of `data-theme-reveal` and `data-theme` on `<html>`, in order: `reveal:spread`, `reveal:-` (gone), `theme:dark`. */
function watchHtml() {
  const log: string[] = []
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.attributeName === 'data-theme-reveal') log.push(`reveal:${html.getAttribute('data-theme-reveal') ?? '-'}`)
      else log.push(`theme:${theme()}`)
    }
  })
  observer.observe(html, { attributes: true, attributeFilter: ['data-theme-reveal', 'data-theme'] })
  return { log, stop: () => observer.disconnect() }
}

/** The device's own look: `(prefers-color-scheme: dark)` answers `dark`, and `flip` changes it and tells the listeners, as a device does. */
function device(dark: boolean) {
  const listeners = new Set<(event: Event) => void>()
  let current = dark
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    get matches() {
      return query === '(prefers-color-scheme: dark)' && current
    },
    media: query,
    addEventListener: (_type: string, listener: (event: Event) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: Event) => void) => listeners.delete(listener),
  }) as unknown as MediaQueryList)
  return {
    flip(next: boolean) {
      current = next
      for (const listener of listeners) listener(new Event('change'))
    },
  }
}

/** The save's endpoint: records what it gets, and waits for `release()` when held. A `failure` answers with an error once released. */
function endpoint({ hold = false, failure = false } = {}) {
  const received: unknown[] = []
  let answered = 0
  let release!: () => void
  const gate = hold
    ? new Promise<void>((resolve) => {
        release = resolve
      })
    : Promise.resolve()
  registerEndpoint('/api/me/appearance', {
    method: 'POST',
    handler: async (event) => {
      const { appearance } = await readBody(event)
      received.push(appearance)
      await gate
      answered++
      if (failure) throw createError({ statusCode: 500 })
      return { appearance }
    },
  })
  return {
    received,
    release: () => release(),
    settled: async () => {
      await vi.waitFor(() => expect(answered).toBe(received.length))
      // The page takes the answer a few ticks later; a save still open when the next test resets the User would send again.
      await new Promise(resolve => setTimeout(resolve, 50))
    },
  }
}

const mounted: { unmount: () => void }[] = []
async function mountHeader() {
  const page = await mountSuspended(AppShell, { props: { kind: 'hub' }, route: '/', attachTo: document.body })
  mounted.push(page)
  return page.get('header')
}
async function mountCard() {
  const card = await mountSuspended(SettingsCard)
  mounted.push(card)
  return card
}
/** A button's rect at a known place, as `tapped()` gives one; the radius for the 400 x 600 window is 500. */
function placeAt(element: Element) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 90, top: 190, width: 20, height: 20, right: 110, bottom: 210, x: 90, y: 190, toJSON: () => ({}) })
}
const SPREAD = [
  { clipPath: ['circle(0px at 100px 200px)', 'circle(500px at 100px 200px)'] },
  { duration: 600, easing: 'cubic-bezier(.1,.2,.3,.4)', pseudoElement: '::view-transition-new(root)' },
]

describe('the Appearance controls reveal', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    // A save a failed case left open must not leak into the next.
    useState('appearance-save').value = undefined
    html.setAttribute('data-theme', 'light')
  })
  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('from the header menu\'s item, whose menu closes on the same tap', async () => {
    viewTransitions()
    const animate = recordAnimate()
    const save = endpoint()
    const header = await mountHeader()
    await header.get(BUTTON).trigger('click')
    const item = header.findAll('[role="menuitemradio"]')[1]!
    placeAt(item.element)

    await item.trigger('click')

    await vi.waitFor(() => expect(animate).toHaveBeenCalledWith(...SPREAD))
    expect(header.find('[role="menu"]').exists()).toBe(false)
    await save.settled()
  })

  it('from the avatar menu\'s row', async () => {
    viewTransitions()
    const animate = recordAnimate()
    const save = endpoint()
    const menu = await mountSuspended(UserMenu, { attachTo: document.body })
    mounted.push(menu)
    await menu.get('[data-tour-avatar]').trigger('click')
    const radio = menu.findAll('[role="radio"]').find(r => r.text() === 'Dunkel')!
    placeAt(radio.element)

    await radio.trigger('click')

    await vi.waitFor(() => expect(animate).toHaveBeenCalledWith(...SPREAD))
    await save.settled()
  })

  it('from the Profil card\'s radio', async () => {
    viewTransitions()
    const animate = recordAnimate()
    const save = endpoint()
    const card = await mountCard()
    const radios = card.findAll('[role="radio"]')
    placeAt(radios[1]!.element)

    await radios[1]!.trigger('click')

    await vi.waitFor(() => expect(animate).toHaveBeenCalledWith(...SPREAD))
    await save.settled()
  })

  it('not from the radio a key selects: only a tap spreads the circle, a key cross-fades (#1008)', async () => {
    const vt = viewTransitions()
    const animate = recordAnimate()
    const save = endpoint()
    const card = await mountCard()
    const radios = card.findAll('[role="radio"]')
    placeAt(radios[1]!.element)
    const watch = watchHtml()

    await radios[0]!.trigger('keydown', { key: 'ArrowRight' })

    await vi.waitFor(() => expect(watch.log).toContain('reveal:-'))
    expect(watch.log[0]).toBe('reveal:fade')
    expect(vt.start).not.toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
    watch.stop()
    await save.settled()
  })

  it('and html[data-theme] is the new Appearance when the transition\'s callback has finished, while data-theme-reveal says spread', async () => {
    const vt = viewTransitions({ holdFinish: true })
    recordAnimate()
    const save = endpoint()
    const card = await mountCard()

    await card.findAll('[role="radio"]')[1]!.trigger('click')
    await vi.waitFor(() => expect(vt.transitions).toHaveLength(1))
    await vi.waitFor(() => expect(vt.transitions[0]!.themeWhenDone).toBe('dark'))

    expect(reveal()).toBe('spread')
    vt.transitions[0]!.end()
    await vi.waitFor(() => expect(reveal()).toBeUndefined())
    expect(theme()).toBe('dark')
    await save.settled()
  })

  it('the edge goes to Dunkel on a tap from Hell', async () => {
    signInAs({ ...kitty, appearance: 'light' })
    const vt = viewTransitions()
    recordAnimate()
    const save = endpoint()
    const card = await mountCard()
    const radios = card.findAll('[role="radio"]')
    placeAt(radios[1]!.element)

    await radios[1]!.trigger('click')

    await vi.waitFor(() => expect(vt.transitions[0]?.edgesWhenDone).toHaveLength(1))
    expect(vt.transitions[0]!.edgesWhenDone![0]!.getAttribute('data-to')).toBe('dark')
    await save.settled()
  })

  it('the edge goes to Hell on a tap from Dunkel', async () => {
    signInAs({ ...kitty, appearance: 'dark' })
    html.setAttribute('data-theme', 'dark')
    const vt = viewTransitions()
    recordAnimate()
    const save = endpoint()
    const card = await mountCard()
    const radios = card.findAll('[role="radio"]')
    placeAt(radios[0]!.element)

    await radios[0]!.trigger('click')

    await vi.waitFor(() => expect(vt.transitions[0]?.edgesWhenDone).toHaveLength(1))
    expect(vt.transitions[0]!.edgesWhenDone![0]!.getAttribute('data-to')).toBe('light')
    await save.settled()
  })

  it('the edge goes to Dunkel on a tap on System from Hell, on a dark device', async () => {
    signInAs({ ...kitty, appearance: 'light' })
    device(true)
    const vt = viewTransitions()
    recordAnimate()
    const save = endpoint()
    const card = await mountCard()
    const system = card.findAll('[role="radio"]').find(r => r.text() === 'System')!
    placeAt(system.element)

    await system.trigger('click')

    await vi.waitFor(() => expect(vt.transitions[0]?.edgesWhenDone).toHaveLength(1))
    expect(vt.transitions[0]!.edgesWhenDone![0]!.getAttribute('data-to')).toBe('dark')
    await save.settled()
  })

  it.each([
    ['Reduced motion', () => motion('reduced'), true],
    ['no View Transitions', () => {}, false],
  ] as const)('with %s as a cross-fade: marked fade, the new look already shown, no transition', async (_name, setup, withTransitions) => {
    const vt = withTransitions ? viewTransitions() : undefined
    setup()
    const save = endpoint()
    const card = await mountCard()
    // After the mount: the page writes its own `data-theme` while it mounts.
    const watch = watchHtml()

    await card.findAll('[role="radio"]')[1]!.trigger('click')

    await vi.waitFor(() => expect(watch.log).toContain('reveal:-'))
    expect(watch.log[0]).toBe('reveal:fade')
    // The new look is on `<html>` while the mark is still set, and nothing sweeps.
    expect(watch.log.indexOf('theme:dark')).toBeGreaterThan(-1)
    expect(watch.log.indexOf('theme:dark')).toBeLessThan(watch.log.indexOf('reveal:-'))
    if (vt) expect(vt.start).not.toHaveBeenCalled()
    expect(theme()).toBe('dark')
    watch.stop()
    await save.settled()
  })

  it.each([
    ['Hell to System on a light device', 'light', 'system', false],
    ['Dunkel to System on a dark device', 'dark', 'system', true],
  ] as const)('nothing for a choice that shows the same look (%s), which is still saved', async (_name, from, to, dark) => {
    signInAs({ ...kitty, appearance: from })
    device(dark)
    const vt = viewTransitions()
    recordAnimate()
    const watch = watchHtml()
    const save = endpoint()
    const card = await mountCard()

    await card.findAll('[role="radio"]').find(r => r.text() === 'System')!.trigger('click')

    await vi.waitFor(() => expect(save.received).toEqual([to]))
    await save.settled()
    expect(vt.start).not.toHaveBeenCalled()
    expect(watch.log.filter(entry => entry.startsWith('reveal:'))).toEqual([])
    watch.stop()
  })

  it('a device switch under System and another device\'s change reveal nothing', async () => {
    signInAs({ ...kitty, appearance: 'system' })
    const phone = device(false)
    const vt = viewTransitions()
    recordAnimate()
    await mountCard()
    const watch = watchHtml()

    phone.flip(true)
    await flushPromises()
    useAuthUser().value = { ...kitty, appearance: 'dark' }
    await flushPromises()

    expect(vt.start).not.toHaveBeenCalled()
    expect(watch.log.filter(entry => entry.startsWith('reveal:'))).toEqual([])
    watch.stop()
  })

  it('cross-fades back, not as a circle, when the save fails', async () => {
    const vt = viewTransitions()
    recordAnimate()
    const save = endpoint({ hold: true, failure: true })
    const watch = watchHtml()
    const header = await mountHeader()
    await header.get(BUTTON).trigger('click')

    await header.findAll('[role="menuitemradio"]')[1]!.trigger('click')
    await vi.waitFor(() => expect(theme()).toBe('dark'))
    await vi.waitFor(() => expect(watch.log).toContain('reveal:-'))
    save.release()

    await vi.waitFor(() => expect(shownToasts()).toHaveLength(1))
    await vi.waitFor(() => expect(theme()).toBe('light'))
    await vi.waitFor(() => expect(watch.log.filter(entry => entry === 'reveal:-')).toHaveLength(2))
    expect(watch.log.filter(entry => entry.startsWith('reveal:') && entry !== 'reveal:-')).toEqual(['reveal:spread', 'reveal:fade'])
    expect(vt.start).toHaveBeenCalledOnce()
    expect(useAuthUser().value?.appearance).toBe('light')
    expect(shownToasts()[0]).toMatchObject({ tone: 'error', text: 'Das hat nicht geklappt, die Darstellung ist wieder wie vorher. Versuch’s nochmal.' })
    watch.stop()
  })

  it('and the newest tap wins: the User, <html> and the last save end on System, the mark goes with the second reveal', async () => {
    const vt = viewTransitions({ holdFinish: true })
    recordAnimate()
    const save = endpoint({ hold: true })
    const card = await mountCard()
    const pick = (label: string) => card.findAll('[role="radio"]').find(r => r.text() === label)!.trigger('click')

    await pick('Dunkel')
    await vi.waitFor(() => expect(save.received).toEqual(['dark']))
    await pick('System')
    await vi.waitFor(() => expect(vt.transitions).toHaveLength(2))
    await vi.waitFor(() => expect(theme()).toBe('system'))

    expect(useAuthUser().value?.appearance).toBe('system')
    vt.transitions[0]!.end()
    await flushPromises()
    expect(reveal()).toBe('spread')
    vt.transitions[1]!.end()
    await vi.waitFor(() => expect(reveal()).toBeUndefined())
    save.release()
    await vi.waitFor(() => expect(save.received.at(-1)).toBe('system'))
    await save.settled()
    expect(useAuthUser().value?.appearance).toBe('system')
    expect(theme()).toBe('system')
  })

  it('and a second tap before the first\'s callback ran is not dropped, and the first callback shows the second choice', async () => {
    const vt = viewTransitions({ holdCallback: true })
    recordAnimate()
    const save = endpoint({ hold: true })
    const card = await mountCard()
    const pick = (label: string) => card.findAll('[role="radio"]').find(r => r.text() === label)!.trigger('click')

    await pick('Dunkel')
    // Back to the Appearance still on screen: the User state has not changed yet, but the choice is a new one.
    await pick('Hell')
    await vi.waitFor(() => expect(vt.transitions).toHaveLength(2))
    await vt.transitions[0]!.run()

    await vi.waitFor(() => expect(useAuthUser().value?.appearance).toBe('light'))
    expect(theme()).toBe('light')
    await vt.transitions[1]!.run()
    save.release()
    await vi.waitFor(() => expect(save.received).toEqual(['dark', 'light']))
    await save.settled()
  })

  it('and a hidden tab, whose transition never calls back, still saves', async () => {
    viewTransitions({ holdCallback: true })
    recordAnimate()
    const save = endpoint()
    const card = await mountCard()

    await card.findAll('[role="radio"]')[1]!.trigger('click')

    await vi.waitFor(() => expect(save.received).toEqual(['dark']))
    await save.settled()
  })

  it('nothing for a signed-out device: no reveal, nothing saved', async () => {
    signInAs(null)
    const vt = viewTransitions()
    const save = endpoint()
    const holder = await mountSuspended(defineComponent({
      setup: () => useAppearance(),
      render: () => null,
    }))
    mounted.push(holder)

    await (holder.vm as unknown as { choose: (value: string) => Promise<void> }).choose('dark')

    await flushPromises()
    expect(vt.start).not.toHaveBeenCalled()
    expect(reveal()).toBeUndefined()
    expect(save.received).toEqual([])
  })
})
