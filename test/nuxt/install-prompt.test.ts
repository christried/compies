import { describe, expect, it, vi } from 'vitest'
import { useInstallPrompt } from '~/composables/useInstallPrompt'

// The browser's install prompt (#676, spec #927): the browser fires `beforeinstallprompt` early, on any page, so a client plugin catches it at app
// start, keeps the page from showing the browser's own mini-bar and holds the event until Home asks. What a page can observe is `useInstallPrompt()`.

/** The browser's event: cancelable, with the prompt and the User's choice. `choice` settles when the dialog closes. */
function browserEvent(choice: Promise<{ outcome: 'accepted' | 'dismissed' }>, prompt = vi.fn(async () => {})) {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: typeof prompt, userChoice: typeof choice }
  event.prompt = prompt
  event.userChoice = choice
  return event
}

describe('useInstallPrompt', () => {
  it('holds nothing until the browser fires its prompt', () => {
    expect(useInstallPrompt().held.value).toBe(false)
  })

  it('keeps the browser from showing its own bar, and holds the event', () => {
    const event = browserEvent(Promise.resolve({ outcome: 'accepted' }))

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(useInstallPrompt().held.value).toBe(true)
  })

  it('opens the held prompt, returns the User\'s choice and lets the event go after it', async () => {
    window.dispatchEvent(browserEvent(Promise.resolve({ outcome: 'accepted' })))
    const installPrompt = useInstallPrompt()

    expect(await installPrompt.prompt()).toBe('accepted')
    expect(installPrompt.held.value).toBe(false)
  })

  it('returns a dismissal as it is, and the event is gone too: the browser offers a used event once', async () => {
    window.dispatchEvent(browserEvent(Promise.resolve({ outcome: 'dismissed' })))
    const installPrompt = useInstallPrompt()

    expect(await installPrompt.prompt()).toBe('dismissed')
    expect(installPrompt.held.value).toBe(false)
  })

  it('keeps the event held, and ignores a second tap, while the browser\'s dialog is open', async () => {
    let close!: (choice: { outcome: 'accepted' | 'dismissed' }) => void
    const prompt = vi.fn(async () => {})
    window.dispatchEvent(browserEvent(new Promise((resolve) => { close = resolve }), prompt))
    const installPrompt = useInstallPrompt()

    const first = installPrompt.prompt()
    const second = installPrompt.prompt()
    await vi.waitFor(() => expect(prompt).toHaveBeenCalled())

    expect(installPrompt.held.value).toBe(true)
    close({ outcome: 'accepted' })
    expect(await first).toBe('accepted')
    expect(await second).toBe('accepted')
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(installPrompt.held.value).toBe(false)
  })

  it('counts a prompt that throws (a used event) as dismissed and lets the event go', async () => {
    const prompt = vi.fn(async () => {
      throw new DOMException('already used', 'InvalidStateError')
    })
    window.dispatchEvent(browserEvent(new Promise(() => {}), prompt))
    const installPrompt = useInstallPrompt()

    expect(await installPrompt.prompt()).toBe('dismissed')
    expect(installPrompt.held.value).toBe(false)
  })

  it('says dismissed when nothing is held', async () => {
    expect(await useInstallPrompt().prompt()).toBe('dismissed')
  })
})
