import { ref, readonly, type Ref } from 'vue'

export type InstallOutcome = 'accepted' | 'dismissed'

/** The browser's install prompt as a page sees it (#676): whether one is held, and a way to open it. */
export interface InstallPrompt {
  held: Readonly<Ref<boolean>>
  /** Opens the held prompt and answers with the User's choice; `dismissed` when nothing is held or the browser refuses. */
  prompt: () => Promise<InstallOutcome>
}

// Without the client plugin (the server render) nothing is ever held.
const inert: InstallPrompt = { held: readonly(ref(false)), prompt: async () => 'dismissed' }

/** The held install prompt, from `app/plugins/install-prompt.client.ts`; inert on the server. */
export function useInstallPrompt(): InstallPrompt {
  return (useNuxtApp().$installPrompt as InstallPrompt | undefined) ?? inert
}
