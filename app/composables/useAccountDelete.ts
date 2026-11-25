import { HOME_EVENTS_KEY } from '~/utils/event-data'
import type { AccountDeleted, HostedCounts } from '~~/shared/auth'

// „Konto löschen“ on the Profil page (#918, spec #907): the read of what the deletion takes with it (`load`, when the sheet opens) and the deletion itself (`remove`,
// the hold's action). One notice stands for every refusal, `account_games_held` included, so no `apiErrorKey` is read.
export function useAccountDelete() {
  const afterSignOut = useAfterSignOut()
  /** Null until the read answered: the sheet's hold waits for it, so a Host never confirms before the sheet says what goes. */
  const hosted = ref<HostedCounts | null>(null)
  const hostedFailed = ref(false)
  /** The last deletion was refused; cleared when the sheet opens again. */
  const failed = ref(false)
  let reads = 0

  /** Reads again each time the sheet opens, and drops the answer of an older read that arrives late. */
  async function load() {
    reads += 1
    const mine = reads
    hosted.value = null
    hostedFailed.value = false
    failed.value = false
    try {
      const counts = await $fetch<HostedCounts>('/api/me/hosted')
      if (mine === reads) hosted.value = counts
    }
    catch {
      if (mine === reads) hostedFailed.value = true
    }
  }

  async function remove(): Promise<boolean> {
    failed.value = false
    try {
      await $fetch<AccountDeleted>('/api/me', { method: 'DELETE' })
    }
    catch {
      failed.value = true
      return false
    }
    // The deletion is taken: the User's Events are gone with it, and a failed navigation never turns it into a refusal.
    clearNuxtData(HOME_EVENTS_KEY)
    try {
      await afterSignOut()
    }
    catch {
      // The session is gone already; the next page load lands on the sign-in page.
    }
    return true
  }

  return { hosted, hostedFailed, failed, load, remove }
}
