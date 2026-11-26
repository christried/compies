import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AppShell from '~/components/AppShell.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import { kitty, signInAs } from './auth'
import { stubScreen } from './event-page'
import { FIRST, mount, mountedPage, serveState, SESSION, STARTED, unmountPage } from './event-page-states'

// Where the stage smoke is on (#675, note 19-rauch-auf-der-buehne): the Event page's stage, for the Host's read and a Member's alike, in the
// shell's `decor` slot between the paper and the page's cards, and on no other page, view or state. jsdom applies no CSS, so the order of
// the layers is asserted on the classes that set it, as the header's widths are (app-header.test.ts).

const SMOKE = '[data-layer="stage-smoke"]'
const RUNNING = [SESSION(1, FIRST, { startedAt: STARTED })]

describe('the stage smoke on the Event page', () => {
  beforeEach(() => signInAs(kitty))
  afterEach(unmountPage)

  for (const host of [true, false]) {
    it(`is on the stage, outside <main>, once, for ${host ? 'the Host' : 'a Member'}`, async () => {
      stubScreen(true)
      const { slug } = serveState({ sessions: RUNNING, missing: 0, host, phase: 'running', running: 0 })

      const page = await mount(slug)

      expect(page.findAll(SMOKE)).toHaveLength(1)
      expect(page.get('main').find(SMOKE).exists()).toBe(false)
    })
  }

  it('lies over the shell\'s paper and under the page: the shell keeps its ground, the column and the banner take the content layer', async () => {
    stubScreen(true)
    const { slug } = serveState({ sessions: RUNNING, missing: 0, phase: 'running', running: 0 })

    const page = await mount(slug)

    expect(page.element.classList).toContain('tex-paper')
    const column = page.get('main').element.parentElement!
    expect(column.classList).toContain('relative')
    expect(column.classList).toContain('layer-content')
    expect(page.get('[class*="empty:hidden"]').classes()).toEqual(expect.arrayContaining(['relative', 'layer-content']))
  })

  describe('on a phone', () => {
    const view = async (name: string) => {
      const page = mountedPage()!
      const tab = page.findAll('nav[aria-label="Event"] button').find((button: { attributes: (name: string) => string | undefined, text: () => string }) => (button.attributes('aria-label') ?? button.text()).startsWith(name))
      await tab!.trigger('click')
    }

    beforeEach(() => stubScreen(false))

    it('is on the Event view', async () => {
      const { slug } = serveState({ sessions: RUNNING, missing: 0, phase: 'running', running: 0 })

      const page = await mount(slug)

      expect(page.findAll(SMOKE)).toHaveLength(1)
    })

    for (const name of ['Tabelle', 'Chat', 'Aktivität']) {
      it(`is gone on the view „${name}“ and back on the Event view`, async () => {
        const { slug } = serveState({ sessions: RUNNING, missing: 0, phase: 'running', running: 0 })
        const page = await mount(slug)

        await view(name)
        expect(page.findAll(SMOKE)).toHaveLength(0)

        await view('Event')
        expect(page.findAll(SMOKE)).toHaveLength(1)
      })
    }
  })

  it('is not on the load and error states', async () => {
    stubScreen(true)
    registerEndpoint('/api/e/gone-675', { method: 'GET', handler: () => {
      throw createError({ statusCode: 404 })
    },
    })

    const page = await mountSuspended(EventPage, { route: '/e/gone-675' })

    expect(page.find('h1').exists()).toBe(true)
    expect(page.findAll(SMOKE)).toHaveLength(0)
    page.unmount()
  })
})

describe('the shell without the decor slot', () => {
  beforeEach(() => signInAs(kitty))

  it('has no smoke, and its column keeps the classes it had: the order of layers is the Event page\'s alone', async () => {
    const page = await mountSuspended(AppShell, { props: { kind: 'hub' }, slots: { default: '<p>Inhalt</p>' } })

    expect(page.element.classList).toContain('tex-paper')
    expect(page.findAll(SMOKE)).toHaveLength(0)
    const column = page.get('main').element.parentElement!
    expect(column.classList).not.toContain('relative')
    expect(column.classList).not.toContain('layer-content')
  })

  it('puts what the slot holds beside the column, not in <main>', async () => {
    const page = await mountSuspended(AppShell, { props: { kind: 'event' }, slots: { default: '<p>Inhalt</p>', decor: '<i data-decor="x"></i>' } })

    expect(page.findAll('[data-decor="x"]')).toHaveLength(1)
    expect(page.get('main').find('[data-decor="x"]').exists()).toBe(false)
    expect(page.get('main').element.parentElement!.classList).toContain('layer-content')
  })
})
