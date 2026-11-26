import { computed, shallowRef } from 'vue'
import type { InstallOutcome, InstallPrompt } from '~/composables/useInstallPrompt'

// The browser's install prompt (#676, spec #927 § The install hint). Chrome on Android fires `beforeinstallprompt` early, on any page, once the app
// qualifies, so the listener is here at app start and not on Home: it keeps the browser's own mini-bar away (`preventDefault`) and holds the event
// until Home's banner asks for it. `useInstallPrompt()` is the way in. `appinstalled` is not listened to: the choice of `prompt()` is the answer.

/** The event as Chrome fires it; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: InstallOutcome }>
}

export default defineNuxtPlugin(() => {
  const held = shallowRef<BeforeInstallPromptEvent | null>(null)
  // The open dialog's answer: a second tap meanwhile gets it too instead of opening a second prompt.
  let asking: Promise<InstallOutcome> | null = null

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    held.value = event as BeforeInstallPromptEvent
  })

  async function ask(event: BeforeInstallPromptEvent): Promise<InstallOutcome> {
    try {
      await event.prompt()
      return (await event.userChoice).outcome
    }
    catch {
      // A used event throws InvalidStateError: nothing to ask any more.
      return 'dismissed'
    }
    finally {
      // Released once the choice has settled, so the banner (and its busy button) stays while the dialog is open. A used event cannot be used
      // again: the banner is gone until the browser fires a fresh one (next load).
      held.value = null
      asking = null
    }
  }

  const installPrompt: InstallPrompt = {
    held: computed(() => held.value !== null),
    prompt() {
      if (asking) return asking
      if (!held.value) return Promise.resolve('dismissed')
      asking = ask(held.value)
      return asking
    },
  }
  return { provide: { installPrompt } }
})
