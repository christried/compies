import { apiErrorKey, apiFailure } from '~/utils/api-error'
import { teamName } from '~/utils/board'
import type { Place } from '~~/shared/board'
import { asRecord } from '~~/shared/record'

// A move on the Game board as the person who makes it sees it (#160): the avatar is in its new place at once and
// stays there until the server has answered and the Event is refetched. A refusal sends it back (the board glides
// it home with the spring, `bounced` says whose way it is) and a toast says why; of two Players racing for the last
// place the slower one learns by name who was faster. Moves of one Event queue up on the server, so each is sent at
// once and the answers are handled in the order they come.

/** Who stands where, for the name in the lost-race toast. */
export interface BoardPeople {
  nameOf: (userId: string) => string
}

export function useBoardMoves(slug: Readonly<Ref<string>>, refresh: () => Promise<unknown>, people: BoardPeople) {
  const { t } = useI18n()
  const { toast } = useToast()

  /** Moves on their way to the server, by Member: drawn at once, dropped when the server has answered. */
  const pending = ref<Record<string, Place>>({})
  /** The Members whose move was refused and who are on their way home (not reactive: the board reads and clears it when it animates). */
  const bounced = new Set<string>()

  function dropPending(userId: string) {
    pending.value = Object.fromEntries(Object.entries(pending.value).filter(([key]) => key !== userId))
  }

  async function move(userId: string, to: Place): Promise<boolean> {
    pending.value = { ...pending.value, [userId]: to }
    let taken = false
    try {
      await $fetch(`/api/e/${slug.value}/move`, { method: 'POST', body: { userId, to } })
      taken = true
    }
    catch (failure) {
      bounced.add(userId)
      dropPending(userId)
      toast({ tone: 'error', text: refusalText(failure, to) })
    }
    finally {
      // Refetch first so the server's place replaces the drawn one without a flicker back to the old one.
      await refresh()
      dropPending(userId)
    }
    return taken
  }

  /** The toast for a refusal: the lost race names the winner; every other reason has its shared copy. */
  function refusalText(failure: unknown, to: Place): string {
    const { code } = apiFailure(failure)
    const winnerId = asRecord(asRecord(asRecord(failure).data).data).winnerId
    if (code === 'team_full' && to.zone === 'team' && typeof winnerId === 'string') {
      return t('board.reason.lostRace', { name: people.nameOf(winnerId), team: teamName(to.team, t) })
    }
    return t(apiErrorKey(failure))
  }

  return { pending, bounced, move }
}
