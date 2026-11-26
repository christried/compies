import { apiFailure } from '~/utils/api-error'
import type { AdminUserDeletion } from '~~/shared/admin'
import type { AccountDeleted } from '~~/shared/auth'

// „Konto löschen“ for another User on the Admin page (#941, spec #938), the counterpart of `useAccountDelete` (#918): the read of what the deletion takes with it
// (`load`, when the sheet opens) and the deletion itself (`remove`, the hold's action). Unlike the Profil page's, two reasons are told apart: `account_games_held`
// (rare, ADR 0018 rules it out) is a refusal the sheet words on its own, from the read already, and every other failure is one notice. The Platform admin stays
// signed in: no sign-out and no navigation, the list reads again (`AdminUsers`).
export function useAdminUserDelete() {
  /** Null until the read answered: the sheet's hold waits for it, so nobody confirms before the sheet says what goes. */
  const counts = ref<AdminUserDeletion | null>(null)
  const countsFailed = ref(false)
  /** The server refuses this deletion for good (`account_games_held`): the sheet says so and the hold stays idle. */
  const held = ref(false)
  /** The last deletion failed for another reason; cleared when the sheet opens again. */
  const failed = ref(false)
  let reads = 0

  /** Reads again each time the sheet opens, and drops the answer of an older read that arrives late. */
  async function load(id: string) {
    reads += 1
    const mine = reads
    counts.value = null
    countsFailed.value = false
    held.value = false
    failed.value = false
    try {
      const answer = await $fetch<AdminUserDeletion>(`/api/admin/users/${id}/deletion`)
      if (mine === reads) counts.value = answer
    }
    catch (failure) {
      if (mine !== reads) return
      if (apiFailure(failure).code === 'account_games_held') held.value = true
      else countsFailed.value = true
    }
  }

  async function remove(id: string): Promise<boolean> {
    failed.value = false
    try {
      await $fetch<AccountDeleted>(`/api/admin/users/${id}`, { method: 'DELETE' })
      return true
    }
    catch (failure) {
      if (apiFailure(failure).code === 'account_games_held') held.value = true
      else failed.value = true
      return false
    }
  }

  return { counts, countsFailed, held, failed, load, remove }
}
