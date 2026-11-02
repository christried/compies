import { placeKey } from '~/utils/board'
import { placeOf as serverPlaceOf, type Place } from '~~/shared/board'
import type { MemberView } from '~~/shared/event'
import type { BoardPeople } from './useBoardMoves'

// Where everybody is on the Game board (review 1.4 A8), in three layers, the topmost wins: the moves this viewer is
// making (`pending`, until the server has answered), the moves the room announced about other people (`heard`, true at
// once; the refetch it triggers brings the same and drops it, ADR 0013: a heard move is provisional until the refetch
// confirms it) and the server's place from the Event read. Board-internal on purpose: Vetoes and the wheel get their
// own shape when they need one.

/** How long a move the room announced stays drawn without the refetch confirming it. */
export const HEARD_MS = 5000

export function useBoardPlaces(options: {
  slug: Readonly<Ref<string>>
  members: () => readonly Pick<MemberView, 'id' | 'zone' | 'team'>[]
  room: Pick<ReturnType<typeof useEventRoom>, 'on'>
  refresh: () => Promise<unknown>
  people: BoardPeople
}) {
  const moves = useBoardMoves(options.slug, options.refresh, options.people)
  const heard = ref<Record<string, Place>>({})
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function forget(userId: string, to?: Place) {
    const current = heard.value[userId]
    if (current && (!to || placeKey(current) === placeKey(to))) heard.value = Object.fromEntries(Object.entries(heard.value).filter(([key]) => key !== userId))
  }

  // A message the refetch never confirms (a move that was undone meanwhile) is dropped after a while: the Member goes
  // back to the server's place, and the board glides them there like any other change of place.
  function hear(userId: string, to: Place) {
    heard.value = { ...heard.value, [userId]: to }
    clearTimeout(timers.get(userId))
    timers.set(userId, setTimeout(() => forget(userId, to), HEARD_MS))
  }

  watch(options.members, (members) => {
    for (const member of members) {
      const heardPlace = heard.value[member.id]
      if (heardPlace && placeKey(heardPlace) === placeKey(serverPlaceOf(member))) forget(member.id)
    }
  })
  const stopHearing = options.room.on('member.moved', message => hear(message.userId, message.to))
  onScopeDispose(() => {
    stopHearing()
    for (const timer of timers.values()) clearTimeout(timer)
  })

  const places = computed(() => new Map(options.members().map(member => [member.id, moves.pending.value[member.id] ?? heard.value[member.id] ?? serverPlaceOf(member)] as const)))

  return {
    /** Where this Member is drawn; the Bench for somebody the board does not know. */
    placeOf: (userId: string): Place => places.value.get(userId) ?? { zone: 'bench' },
    move: moves.move,
    /** The Members whose move was refused and who are on their way home (not reactive: the board reads and clears it when it animates). */
    bounced: moves.bounced,
  }
}
