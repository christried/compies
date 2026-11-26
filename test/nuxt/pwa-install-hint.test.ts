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
})

// The iPhone and iPad (#929): Safari never offers an install, so the banner needs no prompt, and „Installieren“ opens the three steps in a sheet.
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const SHEET_TITLE = 'Auf den Home-Bildschirm'
const STEPS = ['Tippe unten auf „Teilen“', 'Wähle „Zum Home-Bildschirm“', 'Tippe auf „Hinzufügen“']
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]')

describe('the iPhone and iPad (#929)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    prompt.held = ref(false)
  })

  it('invites an iPhone User who has played, in any browser and with no install prompt', async () => {
    device({ coarse: true, standalone: false, ua: IPHONE_UA, touchPoints: 5 })

    const page = await mountHint()

    expect(page.text()).toContain(TITLE)
    expect(button(page, 'Später')).toBeDefined()
    expect(button(page, 'Installieren')).toBeDefined()
  })

  it('invites an iPad that reports itself as a Mac', async () => {
    device({ coarse: false, standalone: false, ua: IPAD_AS_MAC_UA, touchPoints: 5 })

    const page = await mountHint()

    expect(page.text()).toContain(TITLE)
  })

  it('shows nothing on an iPhone before the User has played', async () => {
    device({ coarse: true, standalone: false, ua: IPHONE_UA, touchPoints: 5 })

    const page = await mountHint(false)

    expect(page.text()).not.toContain(TITLE)
  })

  it('opens a sheet with the title and the three steps in order, when „Installieren“ is tapped', async () => {
    device({ coarse: true, standalone: false, ua: IPHONE_UA, touchPoints: 5 })
    const page = await mountHint()

    await button(page, 'Installieren')!.trigger('click')

    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    const dialog = sheet()!
    const heading = document.getElementById(dialog.getAttribute('aria-labelledby')!)
    expect(heading?.textContent?.trim()).toBe(SHEET_TITLE)
    const steps = [...dialog.querySelectorAll('li')].map(item => item.textContent ?? '')
    expect(steps).toHaveLength(3)
    STEPS.forEach((text, index) => expect(steps[index]).toContain(text))
    expect(prompt.held!.value).toBe(false)
  })

  it('closing the sheet with its close button stores done: the banner is gone and does not come back', async () => {
    device({ coarse: true, standalone: false, ua: IPHONE_UA, touchPoints: 5 })
    const page = await mountHint()
    await button(page, 'Installieren')!.trigger('click')
    await vi.waitFor(() => expect(sheet()).not.toBeNull())

    sheet()!.querySelector<HTMLButtonElement>('button[aria-label="Schließen"]')!.click()

    expect(localStorage.getItem(PWA_STORAGE_KEY)).toBe('done')
    await vi.waitFor(() => expect(page.text()).not.toContain(TITLE))
    expect((await mountHint()).text()).not.toContain(TITLE)
  })

  it('closing the sheet with Esc stores done too', async () => {
    device({ coarse: true, standalone: false, ua: IPHONE_UA, touchPoints: 5 })
    const page = await mountHint()
    await button(page, 'Installieren')!.trigger('click')
    await vi.waitFor(() => expect(sheet()).not.toBeNull())

    sheet()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(localStorage.getItem(PWA_STORAGE_KEY)).toBe('done')
    await vi.waitFor(() => expect(page.text()).not.toContain(TITLE))
  })

  it('„Später“ on an iPhone stores today\'s Berlin day and hides the banner, as on Android', async () => {
    device({ coarse: true, standalone: false, ua: IPHONE_UA, touchPoints: 5 })
    const page = await mountHint()

    await button(page, 'Später')!.trigger('click')

    expect(localStorage.getItem(PWA_STORAGE_KEY)).toBe('later:2026-11-26')
    expect(page.text()).not.toContain(TITLE)
  })

  it('closing the sheet on blocked storage throws nothing and hides the banner for this page view', async () => {
    device({ coarse: true, standalone: false, ua: IPHONE_UA, touchPoints: 5 })
    const page = await mountHint()
    await button(page, 'Installieren')!.trigger('click')
    await vi.waitFor(() => expect(sheet()).not.toBeNull())
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked })

    try {
      expect(() => sheet()!.querySelector<HTMLButtonElement>('button[aria-label="Schließen"]')!.click()).not.toThrow()
      await vi.waitFor(() => expect(page.text()).not.toContain(TITLE))
    }
    finally {
      vi.unstubAllGlobals()
    }
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
    prompt.open = new Promise<void>((resolve) => {
      close = resolve
    })
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
