import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { revealTheme } from '~/utils/theme-reveal'
import { motion } from './motion'

// The Theme reveal (#931, 04-motion § UI enters): the new Appearance spreads as a circle from the tapped option over the old picture,
// or cross-fades under Reduced motion and in a browser without View Transitions. happy-dom has neither `startViewTransition` nor a
// reliable `animate`, so both are fakes; the seams are what the page can show: `<html data-theme-reveal>`, the keyframes handed to
// the browser and the order in which the new look is shown.

const html = document.documentElement
const reveal = () => html.dataset.themeReveal

interface FakeTransition {
  /** Runs the held callback, as the browser does once it has taken the old picture. */
  run: () => Promise<void>
  /** Lets `finished` resolve, as the browser does when the animation is over. */
  end: () => void
}

/**
 * A `document.startViewTransition` that runs the callback a task later, as the browser takes the old picture first. With `holdCallback`
 * the callback waits for `run()`, with `holdFinish` the transition waits for `end()`.
 */
function viewTransitions({ holdCallback = false, holdFinish = false } = {}) {
  const transitions: FakeTransition[] = []
  const start = vi.fn((callback: () => void | Promise<void>) => {
    let run!: () => Promise<void>
    const ran = new Promise<void>((resolve) => {
      run = () => {
        resolve(Promise.resolve(callback()))
        return ran
      }
    })
    let end!: () => void
    const ended = holdFinish ? new Promise<void>((resolve) => { end = resolve }) : Promise.resolve()
    transitions.push({ run, end: () => end() })
    if (!holdCallback) setTimeout(() => void run(), 0)
    return { ready: ran, finished: ran.then(() => ended) }
  })
  Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true, writable: true })
  return { start, transitions }
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

    await revealTheme(tapped(), false, () => seen.push(reveal()))

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

    const done = revealTheme(tapped(), true, () => seen.push(reveal()))

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

    const done = revealTheme(tapped(), true, () => seen.push(reveal()))

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

    const done = revealTheme(null, true, () => seen.push(reveal()))

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
