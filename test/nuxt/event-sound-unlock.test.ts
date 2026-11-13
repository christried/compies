import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { NOTICE_RETURN_MS, NOTICE_SETTLE_MS } from '~/composables/useSoundUnlock'
import { STAGE_COLUMN_CLASS } from '~/utils/event-stage'
import { defaultSettings } from '~~/shared/settings'
import { FakeAudioContext } from '../fake-audio'
import { kitty, signInAs } from './auth'
import { serve, viewWithSessions } from './event-page'

// „Ton aktivieren“ on the Event page (#533, spec #504 § Ton and „Ton aktivieren“): a page-wide listener lets sound through on the first
// gesture while the audio context is held back, and the stage shows a polite notice until then, with Ton on and a Session running. The
// cue player's own rules are in test/nuxt/event-cues.test.ts; a browser that holds the context back is a fake whose state starts suspended
// (its `resume()` runs it, as a real one does).

const FIRST = '2026-10-30T19:00:00.000Z'
const STARTED = '2026-10-30T19:30:00.000Z'
const ENDED = '2026-10-30T22:00:00.000Z'
const SENTENCE = 'Dein Browser spielt Ton erst nach einem Tipp oder Tastendruck ab.'

/** A browser that lets no sound through before a gesture: the context is made suspended. */
class HeldContext extends FakeAudioContext {
  override state = 'suspended'
}

/** A browser that does not count the first gesture: its first `resume()` stays pending and the context stays suspended, the second runs it. */
class StuckContext extends HeldContext {
  override resume() {
    this.resumeCalls += 1
    if (this.resumeCalls === 1) return new Promise<void>(() => {})
    this.setState('running')
    return Promise.resolve()
  }
}

function serveRunning() {
  return serve(slug => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
    event: { isHost: false, phase: 'running' }, settings: defaultSettings(), runningSessionId: `session-${slug}-0`,
  })).slug
}

const context = () => FakeAudioContext.instances.at(-1)
const gesture = {
  pointer: () => document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })),
  key: (key = 'a') => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })),
  click: () => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })),
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
/** Time enough for the settle delay to have passed: a notice that is not there now is not coming. */
const settle = async () => {
  await wait(NOTICE_SETTLE_MS + 100)
  await flushPromises()
}

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(slug: string) {
  page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
  await flushPromises()
  return page
}
const notice = () => [...document.querySelectorAll('[role="status"]')].find(element => element.textContent?.includes('Ton aktivieren')) ?? null
const shown = () => vi.waitFor(() => expect(notice()).not.toBeNull())

beforeEach(() => {
  signInAs(kitty)
  document.body.innerHTML = ''
  FakeAudioContext.instances = []
  vi.stubGlobal('AudioContext', HeldContext)
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.unstubAllGlobals()
  localStorage.removeItem('compies-sound')
})

describe('the notice', () => {
  it('shows with Ton on, a running Session and a held context: its sentence, one button „Ton aktivieren“, a status, and not in the first render', async () => {
    await mount(serveRunning())
    expect(notice()).toBeNull()

    await shown()

    expect(notice()!.textContent).toContain(SENTENCE)
    expect([...notice()!.querySelectorAll('button')].map(button => button.textContent!.trim())).toEqual(['Ton aktivieren'])
    expect(notice()!.getAttribute('role')).toBe('status')
  })

  it('is the first child of the stage, above the blocks', async () => {
    await mount(serveRunning())
    await shown()

    const blocks = document.querySelector('[data-block]')!
    expect(notice()!.compareDocumentPosition(blocks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const wrapper = notice()!.parentElement!
    expect(wrapper.previousElementSibling).toBeNull()
    expect(wrapper.nextElementSibling!.querySelector('[data-block]')).not.toBeNull()
  })

  it('stands in the stage column of the block group, the same classes at every width (#594)', async () => {
    await mount(serveRunning())
    await shown()

    const wrapper = notice()!.parentElement!
    const group = wrapper.nextElementSibling!
    const column = 'mx-auto w-full max-w-[1100px] px-3.5 pt-4 md:px-6 md:pt-6'
    expect(new Set(wrapper.className.split(' '))).toEqual(new Set(column.split(' ')))
    expect(new Set(group.className.split(' '))).toEqual(new Set([...column.split(' '), 'flex', 'flex-col', 'gap-[18px]', 'md:gap-[22px]']))
  })

  it('takes its classes from STAGE_COLUMN_CLASS, which the group and the notice both carry (#594)', async () => {
    await mount(serveRunning())
    await shown()

    const wrapper = notice()!.parentElement!
    const group = wrapper.nextElementSibling!
    for (const token of STAGE_COLUMN_CLASS.split(' ')) {
      expect(wrapper.classList).toContain(token)
      expect(group.classList).toContain(token)
    }
  })

  it('goes after a pointer event, which resumes the context', async () => {
    await mount(serveRunning())
    await shown()

    gesture.pointer()
    await flushPromises()

    expect(notice()).toBeNull()
    expect(context()!.resumeCalls).toBe(1)
    expect(context()!.state).toBe('running')
  })

  it('goes after a key press with a letter, and after a click', async () => {
    await mount(serveRunning())
    await shown()
    gesture.key('a')
    await flushPromises()
    expect(notice()).toBeNull()
    expect(context()!.resumeCalls).toBe(1)

    context()!.setState('suspended')
    await shown()
    gesture.click()
    await flushPromises()
    expect(notice()).toBeNull()
    expect(context()!.resumeCalls).toBe(2)
  })

  it('stays after Escape, which does not resume', async () => {
    await mount(serveRunning())
    await shown()

    gesture.key('Escape')
    await flushPromises()

    expect(notice()).not.toBeNull()
    expect(context()!.resumeCalls).toBe(0)
  })

  it('goes with a click on its button, which resumes the context', async () => {
    await mount(serveRunning())
    await shown()

    notice()!.querySelector('button')!.click()
    await flushPromises()

    expect(notice()).toBeNull()
    expect(context()!.resumeCalls).toBeGreaterThanOrEqual(1)
    expect(context()!.state).toBe('running')
  })

  describe('with a gesture the browser does not count', () => {
    beforeEach(() => {
      vi.stubGlobal('AudioContext', StuckContext)
    })

    it('resumes again on the next gesture, because the first resume never settled', async () => {
      await mount(serveRunning())
      await shown()

      gesture.pointer()
      await flushPromises()
      expect(context()!.resumeCalls).toBe(1)
      expect(context()!.state).toBe('suspended')

      gesture.click()
      await flushPromises()

      expect(context()!.resumeCalls).toBe(2)
      expect(context()!.state).toBe('running')
    })

    it('shows the notice again when the context is still held back after NOTICE_RETURN_MS, and goes for good once a gesture runs it', async () => {
      await mount(serveRunning())
      await shown()

      gesture.pointer()
      await flushPromises()
      expect(notice()).toBeNull()

      await vi.waitFor(() => expect(notice()).not.toBeNull(), { timeout: NOTICE_RETURN_MS + NOTICE_SETTLE_MS + 1500 })

      gesture.pointer()
      await flushPromises()
      expect(context()!.state).toBe('running')
      expect(notice()).toBeNull()
      await wait(NOTICE_RETURN_MS + NOTICE_SETTLE_MS + 100)
      expect(notice()).toBeNull()
    })
  })

  it('does not take the focus, and a removal by a gesture moves it nowhere', async () => {
    await mount(serveRunning())
    await shown()
    expect(document.activeElement).toBe(document.body)

    gesture.pointer()
    await flushPromises()

    expect(document.activeElement).toBe(document.body)
  })
})

describe('when there is no notice', () => {
  it('never with Ton off: no context, and a gesture resumes nothing', async () => {
    localStorage.setItem('compies-sound', 'off')
    await mount(serveRunning())
    await settle()

    gesture.pointer()
    await flushPromises()

    expect(notice()).toBeNull()
    expect(FakeAudioContext.instances).toHaveLength(0)
  })

  it('never without a running Session: a dated one not started, and one that has ended', async () => {
    await mount(serve(slug => viewWithSessions(slug, [{ number: null, startsAt: FIRST }], 0, { settings: defaultSettings() })).slug)
    await settle()
    expect(notice()).toBeNull()
    page!.unmount()

    const ended = serve(slug => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED }], 0, { event: { isHost: false, phase: 'done' }, settings: defaultSettings() }))
    await mount(ended.slug)
    await settle()
    expect(notice()).toBeNull()
  })

  it('never where Web Audio does not exist', async () => {
    vi.stubGlobal('AudioContext', undefined)
    await mount(serveRunning())
    await settle()

    gesture.pointer()
    await flushPromises()

    expect(notice()).toBeNull()
  })

  it('never when the context runs from the start, also after the settle time', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    await mount(serveRunning())
    await settle()

    expect(context()).toBeDefined()
    expect(notice()).toBeNull()
  })
})

describe('the listener', () => {
  it('resumes no more once the context runs, and again after an interruption', async () => {
    await mount(serveRunning())
    await shown()
    gesture.pointer()
    await flushPromises()
    expect(context()!.resumeCalls).toBe(1)

    gesture.pointer()
    gesture.key('b')
    await flushPromises()
    expect(context()!.resumeCalls).toBe(1)

    context()!.setState('suspended')
    await shown()
    gesture.pointer()
    await flushPromises()
    expect(context()!.resumeCalls).toBe(2)
    expect(notice()).toBeNull()
  })

  it('resumes no more after the page is gone', async () => {
    await mount(serveRunning())
    await shown()
    const held = context()!

    page!.unmount()
    page = undefined
    gesture.pointer()
    await flushPromises()

    expect(held.resumeCalls).toBe(0)
  })

  it('lets Ton switched on after mount start the context inside that click', async () => {
    localStorage.setItem('compies-sound', 'off')
    await mount(serveRunning())
    await settle()
    expect(FakeAudioContext.instances).toHaveLength(0)

    ;(document.querySelector('header button[aria-label="Ton"]') as HTMLButtonElement).click()

    expect(context()).toBeDefined()
    expect(context()!.resumeCalls).toBe(1)
    await flushPromises()
    await settle()
    expect(notice()).toBeNull()
  })
})
