import type { ComputedRef } from 'vue'
import type { SessionView } from '~~/shared/event'

// The Reopen notices of an Event's Sessions (#14, #55): a Session whose Date a Reopen withdrew shows a notice
// until the Member closes it. A Session the Host removed with its Date shows the same notice (#65). The closed
// notice stays closed in this browser, per Session and withdrawn Date, so a later Reopen with another Date shows
// again. Without storage it returns on reload.

const KEY_PREFIX = 'compies-reopen-closed:'

function readStored(sessionId: string): string | null {
  try {
    return localStorage.getItem(KEY_PREFIX + sessionId)
  }
  catch {
    // Storage blocked: nothing is remembered.
    return null
  }
}

function writeStored(sessionId: string, previous: string) {
  try {
    localStorage.setItem(KEY_PREFIX + sessionId, previous)
  }
  catch {
    // Storage blocked: the notice comes back after a reload.
  }
}

/** A Session as its notice needs it: its id and the Date that was withdrawn, if any. */
type NoticeSession = Pick<SessionView, 'id' | 'previousStartsAt'>
/** A Session whose notice shows: a Reopen or a removal (#65) withdrew its Date. */
type ShownNotice = NoticeSession & { previousStartsAt: string }

export function useReopenNotices(sessions: ComputedRef<NoticeSession[]>) {
  /** The withdrawn Date each Session's notice was closed at, by Session id. */
  const closed = ref<Record<string, string | null>>({})
  // False during SSR and until the stored state is read, so a closed notice never paints.
  const storageRead = ref(false)

  const notices = computed(() => (storageRead.value
    ? sessions.value.filter((session): session is ShownNotice => session.previousStartsAt !== null && session.previousStartsAt !== closed.value[session.id])
    : []))

  function read() {
    for (const session of sessions.value) closed.value[session.id] = readStored(session.id)
  }

  function close(session: ShownNotice) {
    closed.value[session.id] = session.previousStartsAt
    writeStored(session.id, session.previousStartsAt)
  }

  // Storage exists only in the browser, so the closed Dates are read after mount, not during SSR.
  onMounted(() => {
    read()
    storageRead.value = true
  })
  watch(sessions, () => {
    if (storageRead.value) read()
  })

  return { notices, close }
}
