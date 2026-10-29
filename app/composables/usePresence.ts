/**
 * Who is online (#162, GLOSSARY: Online), as the room says it: `presence.sync` when the connection opens, then
 * `presence.join` and `presence.leave`. It is known only after a sync on an open connection and unknown again when
 * the connection closes, so a dot never shows a state nobody confirmed (no stale dots). Without a Worker the room is
 * never open and nothing is known. A join or leave heard before the sync, or twice, changes nothing.
 */
export function usePresence(room: Pick<ReturnType<typeof useEventRoom>, 'on' | 'state'>) {
  const online = ref<ReadonlySet<string> | null>(null)

  room.on('presence.sync', (message) => {
    if (room.state.value === 'open') online.value = new Set(message.userIds)
  })
  room.on('presence.join', (message) => {
    if (online.value) online.value = new Set([...online.value, message.userId])
  })
  room.on('presence.leave', (message) => {
    if (online.value) online.value = new Set([...online.value].filter(userId => userId !== message.userId))
  })
  watch(room.state, (state) => {
    if (state !== 'open') online.value = null
  })

  return {
    known: computed(() => online.value !== null),
    /** Whether this user has a socket open in the room; false while nothing is known, so check `known` first. */
    isOnline: (userId: string) => online.value?.has(userId) ?? false,
  }
}
