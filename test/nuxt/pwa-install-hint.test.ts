import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import PwaInstallHint from '~/components/PwaInstallHint.vue'
import { PWA_STORAGE_KEY } from '~/utils/install-hint'

// The install banner on Home (#676, spec #927 § The install hint, screen 29): what a User sees and what the page stores. The device is stubbed
// (`matchMedia` for the pointer and the display mode, the user agent, the touch points) and so is the browser's install prompt, held by a fake.
// The component decides only from those and the stored entry; `hasPlayed` is its prop.

const TITLE = 'Compies als App installieren'
const TEXT = 'Eigenes Fenster und ein Icon auf dem Home-Bildschirm: Compies öffnet sich wie eine App.'
const DONE = 'Installiert. Ab jetzt hast du Compies auf deinem Home-Bildschirm.'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

/** The held prompt the page sees: whether the browser has handed one over, and what the User's choice will be. */
const prompt = vi.hoisted(() => ({ held: null as null | { value: boolean }, outcome: 'accepted' as 'accepted' | 'dismissed', open: null as null | Promise<void> }))
mockNuxtImport('useInstallPrompt', () => () => ({
  held: prompt.held!,
  prompt: async () => {
    await prompt.open
    prompt.held!.value = false
    return prompt.outcome
  },
}))

/** The rig as the done state sees it. */
const rigStub = defineComponent({
  name: 'CompibertRig',
  props: { state: { type: String, default: 'idle' }, variant: String, size: Number },
  setup: props => () => h('span', { 'data-part': 'rig', 'data-state': props.state }),
})

type Device = { coarse: boolean, standalone: boolean, ua: string, touchPoints: number }
const PHONE: Device = { coarse: true, standalone: false, ua: ANDROID_UA, touchPoints: 5 }

function device(facts: Device) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: (query === '(pointer: coarse)' && facts.coarse) || (query === '(display-mode: standalone)' && facts.standalone),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList)
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(facts.ua)
  vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(facts.touchPoints)
}

async function mountHint(hasPlayed = true) {
  const page = await mountSuspended(PwaInstallHint, { props: { hasPlayed }, global: { stubs: { LazyCompibertRig: rigStub, CompibertRig: rigStub } } })
  // The device is read after mount; the server render and the first client render show nothing.
  await vi.waitFor(() => expect(page.element).toBeTruthy())
  await new Promise(resolve => setTimeout(resolve, 0))
  return page
}

const button = (page: Awaited<ReturnType<typeof mountHint>>, name: string) => page.findAll('button').find(candidate => candidate.text() === name)

beforeEach(() => {
  prompt.held = ref(true)
  prompt.outcome = 'accepted'
  prompt.open = null
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-26T12:00:00Z'))
  device(PHONE)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the install banner', () => {
  it('invites an Android User who has played, with the title, the text and both buttons', async () => {
    const page = await mountHint()

    expect(page.get('section').text()).toContain(TITLE)
    expect(page.text()).toContain(TEXT)
    expect(button(page, 'Später')).toBeDefined()
    expect(button(page, 'Installieren')).toBeDefined()
  })

  it('names the section by its title', async () => {
    const page = await mountHint()

    const section = page.get('section')
    const heading = page.get(`#${section.attributes('aria-labelledby')}`)
    expect(heading.text()).toBe(TITLE)
  })

  it.each([
    ['the User has not played', () => mountHint(false)],
    ['the device is a computer', () => {
      device({ ...PHONE, coarse: false, touchPoints: 0 })
      return mountHint()
    }],
    ['the page runs as the installed app', () => {
      device({ ...PHONE, standalone: true })
      return mountHint()
    }],
    ['the browser holds no install prompt', () => {
      prompt.held = ref(false)
      return mountHint()
    }],
    ['the iOS steps were done', () => {
      localStorage.setItem(PWA_STORAGE_KEY, 'done')
      return mountHint()
    }],
  ])('shows nothing when %s', async (_why, mount) => {
    const page = await mount()

    expect(page.text()).not.toContain(TITLE)
    expect(page.find('[role="status"]').exists()).toBe(false)
  })

  it('shows nothing for an iPhone until the sheet exists (#929)', async () => {
    device({ coarse: true, standalone: false, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', touchPoints: 5 })

    const page = await mountHint()

    expect(page.text()).not.toContain(TITLE)
  })
})

describe('„Installieren“', () => {
  it('opens the held prompt, and an accepted install says Installiert until the User leaves Home', async () => {
    const page = await mountHint()

    await button(page, 'Installieren')!.trigger('click')

    await vi.waitFor(() => expect(page.get('[role="status"]').text()).toBe(DONE))
    expect(page.text()).not.toContain(TITLE)
    await vi.waitFor(() => expect(page.get('[role="status"] [data-part="rig"]').attributes('data-state')).toBe('cheer'))

    // The User leaves Home and comes back: the prompt is used up, so nothing shows.
    page.unmount()
    const back = await mountHint()
    expect(back.text()).not.toContain(TITLE)
    expect(back.find('[role="status"]').exists()).toBe(false)
  })

  it('takes the banner away when the User dismisses the browser\'s dialog', async () => {
    prompt.outcome = 'dismissed'
    const page = await mountHint()

    await button(page, 'Installieren')!.trigger('click')

    await vi.waitFor(() => expect(page.text()).not.toContain(TITLE))
    expect(page.find('[role="status"]').exists()).toBe(false)
  })

  it('keeps the banner, with a busy button, while the browser\'s dialog is open', async () => {
    let close!: () => void
    prompt.open = new Promise<void>((resolve) => { close = resolve })
    const page = await mountHint()

    await button(page, 'Installieren')!.trigger('click')

    expect(page.text()).toContain(TITLE)
    expect(button(page, 'Installieren')!.attributes('aria-busy')).toBe('true')
    close()
    await vi.waitFor(() => expect(page.get('[role="status"]').text()).toBe(DONE))
  })
})

describe('„Später“', () => {
  it('stores today\'s Berlin day, hides the banner, and keeps it away for 14 days', async () => {
    const page = await mountHint()

    await button(page, 'Später')!.trigger('click')

    expect(localStorage.getItem(PWA_STORAGE_KEY)).toBe('later:2026-11-26')
    expect(page.text()).not.toContain(TITLE)

    const sameDay = await mountHint()
    expect(sameDay.text()).not.toContain(TITLE)

    vi.setSystemTime(new Date('2026-12-09T12:00:00Z'))
    expect((await mountHint()).text()).not.toContain(TITLE)

    vi.setSystemTime(new Date('2026-12-10T12:00:00Z'))
    expect((await mountHint()).text()).toContain(TITLE)
  })
})

describe('storage that is blocked', () => {
  beforeEach(() => {
    // Chrome with site data blocked throws on the access itself.
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the banner, and „Später“ hides it for this page view only', async () => {
    const page = await mountHint()
    expect(page.text()).toContain(TITLE)

    await button(page, 'Später')!.trigger('click')

    expect(page.text()).not.toContain(TITLE)
    expect((await mountHint()).text()).toContain(TITLE)
  })
})
