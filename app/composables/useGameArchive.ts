import { apiErrorKey } from '~/utils/api-error'
import type { GameView } from '~~/shared/game'

/**
 * The one home of archiving and restoring a game from the browser (#467): the card's „Wiederherstellen“ and the switch on the game's page.
 * After the call the library list and the game reload, so a card leaves the filter „Archiviert“ and the page shows the new state.
 * A failure shows the error toast and leaves the control where it was.
 */
export function useGameArchive() {
  const { t } = useI18n()
  const { toast } = useToast()

  async function setArchived(id: string, archived: boolean): Promise<boolean> {
    try {
      await $fetch<GameView>(`/api/games/${id}/archived`, { method: 'PUT', body: { archived } })
    }
    catch (error) {
      toast({ tone: 'error', text: t(apiErrorKey(error)) })
      return false
    }
    await Promise.all([refreshGameLibrary(), refreshNuxtData(libraryGameKey(id))])
    toast({ tone: 'success', text: t(archived ? 'library.archivedDone' : 'library.restoredDone') })
    return true
  }

  return { setArchived }
}
