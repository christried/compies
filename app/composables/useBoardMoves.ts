import { apiFailure } from '~/utils/api-error'
import type { Place } from '~~/shared/board'

// A move on the Game board as the person who makes it sees it (#160): the avatar is in its new place at once and
// stays there until the server has answered and the Event is refetched. A refusal sends it back (the board glides
// it home with the spring, `bounced` says whose way it is) and a toast says why; of two Players racing for the last
// place the slower one learns by name who was faster. Moves of one Event queue up on the server, so each is sent at
// once and the answers are handled in the order they come. The request goes through useEventMutation (`send`), which
// refetches before it returns, so the drawn place is dropped only after the server's place has arrived.

/** Who stands where and what the teams are called, for the lost-race toast. */
export interface BoardPeople {
  nameOf: (userId: string) => string
  teamName: (position: number) => string
}

export function useBoardMoves(slug: Readonly<Ref<string>>, refresh: () => Promise<unknown>, people: BoardPeople) {
  const { t } = useI18n()
  const { send } = useEventMutation(slug, refresh)

  /** Moves on their way to the server, by Member: drawn at once, dropped when the server has answered. */
  const pending = ref<Record<string, Place>>({})
  /** The Members whose move was refused and who are on their way home (not reactive: the board reads and clears it when it animates). */
  const bounced = new Set<string>()

  function dropPending(userId: string) {
    pending.value = Object.fromEntries(Object.entries(pending.value).filter(([key]) => key !== userId))
  }

  async function move(userId: string, to: Place): Promise<boolean> {
    pending.value = { ...pending.value, [userId]: to }
    const taken = await send('POST', 'move', {
      body: { userId, to },
      refused: () => {
        bounced.add(userId)
        dropPending(userId)
      },
      refusalText: failure => lostRaceText(failure, to),
    })
    // `send` has refetched by now, so the server's place replaces the drawn one without a flicker back to the old one.
    dropPending(userId)
    return taken
  }

  /** The toast for the lost race, which names the winner; every other refusal keeps its shared copy. */
  function lostRaceText(failure: unknown, to: Place): string | undefined {
    const { code, data } = apiFailure(failure)
    const winnerId = data?.winnerId
    if (code === 'team_full' && to.zone === 'team' && typeof winnerId === 'string') {
      return t('board.reason.lostRace', { name: people.nameOf(winnerId), team: people.teamName(to.team) })
    }
    return undefined
  }

  return { pending, bounced, move }
}
