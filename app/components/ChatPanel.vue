<script setup lang="ts">
import { CircleAlert, Crown, Send, Trash2 } from '@lucide/vue'
import { apiErrorKey, apiFailure } from '~/utils/api-error'
import { teamNameAt } from '~/utils/board'
import { formatActivityTime } from '~/utils/berlin-time'
import { groupMessages, markDeleted, mergeMessages, splitMessageText } from '~/utils/chat'
import { membershipEnded } from '~/utils/members'
import { shownPerson } from '~/utils/shown-person'
import { chatRise } from '~/utils/motion'
import { MESSAGE_MAX, normaliseMessageLineBreaks, parseMessageText } from '~~/shared/message-text'
import { characterCount, cutToCharacters } from '~~/shared/text'
import type { Message, MessageDeleter, MessagePage, WriterView } from '~~/shared/chat'
import type { BoardTeam, MemberView } from '~~/shared/event'
import { NOTES_LINK_REL } from '~~/shared/notes-doc'

// The Chat (#761, GLOSSARY: Chat, 02-components § ChatPanel, spec #719 § A): the Event's Messages, oldest at the top and the newest at the bottom, scrolled to the
// end on load, and the composer at the foot (#667). It follows the Activity feed (`ActivityFeed.vue`): the first page from the Chat's endpoint, what the room sends (`chat.added`) at once, the first page
// again whenever the connection opens (a message sent while the socket was down is gone; a page that shares no id with what is held replaces it, #848), and „Ältere laden“ for the page before the oldest one shown. A Message
// the page and the room both bring shows once (by id). A Message stores no name and no place (ADR 0016's opposite, on purpose): the name line of each group
// takes the writer's current Display name, Team and place from the Event read's Members, so a rename or a move shows in old Messages; a writer who is no Member takes the name and picture
// the Chat's read carries (`writers`, #916). An address in a Message is a link (#762).
// A writer deletes their own Message, and the Host any Message (#764): it is hidden at once, a toast offers „Rückgängig“ and the call goes out when the toast ends (#763); a delete
// the room announces (`chat.deleted`) turns the Message into its line, also one that is not held yet (#848). The line a Message the page sent shows as until it settles is an `Outgoing`.
const props = withDefaults(defineProps<{
  slug: string
  room: Pick<ReturnType<typeof useEventRoom>, 'state' | 'on'>
  /** The Event's Members: the name line is computed from them, never from the Chat's read. */
  members: MemberView[]
  /** The Event's teams, for the name of the Team a writer sits in. */
  teams: BoardTeam[]
  viewerId: string
  /** The panel's tab is the one shown: the log scrolls to its end when it turns true, since a log that mounted hidden could not (#761). */
  active?: boolean
  /** The page is finished: no composer, a note instead (#667). */
  finished?: boolean
}>(), { active: true, finished: false })

const { t } = useI18n()

/** Oldest first. */
const messages = ref<Message[]>([])
/** The deletes the room announced, id → deleter, kept next to `messages` for Messages the Chat does not hold yet (#848). Not reactive: it only feeds `mergeMessages`. */
const deleted = new Map<string, MessageDeleter>()
/** The writers of the pages read so far who are no Member of the Event, by id (#916): a name line takes them from here when the Members do not list them. */
const writers = ref<Record<string, WriterView>>({})
/** Each read's writers join the held ones; a writer a later read carries again takes its newer values. */
const mergeWriters = (page: MessagePage) => {
  writers.value = { ...writers.value, ...page.writers }
}
/** The cursor of the page before the oldest one loaded; null when there is none. */
const next = ref<string | null>(null)
const status = ref<'loading' | 'ready' | 'failed'>('loading')
const loadingOlder = ref(false)
const scroller = ref<HTMLElement>()
const now = new Date()

/** A page is newest first. */
const pageMessages = (page: MessagePage): Message[] => [...page.messages].reverse()

const atEnd = () => !scroller.value || scroller.value.scrollHeight - scroller.value.scrollTop - scroller.value.clientHeight < 40
const scrollToEnd = () => void nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight }))

const bubbles = () => [...(scroller.value?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [])]
/** The first bubble that reaches below the log's top edge, with its place on the screen: the row the reader is looking at. */
function topBubble() {
  const edge = scroller.value?.getBoundingClientRect().top ?? 0
  const bubble = bubbles().find(candidate => candidate.getBoundingClientRect().bottom > edge + 1)
  return bubble?.dataset.messageId ? { id: bubble.dataset.messageId, top: bubble.getBoundingClientRect().top } : undefined
}

async function loadFirst() {
  try {
    const page = await $fetch<MessagePage>(`/api/e/${props.slug}/messages`)
    mergeWriters(page)
    const first = status.value !== 'ready'
    // Read before the list changes, as the `chat.added` handler does: a re-read (the room's connection opened again) follows to the end only for a reader who is there (#881).
    const follow = atEnd()
    // A re-read that shares no id with what is held while older Messages remain: more was missed than a page holds, and the Messages between would be a hole „Ältere laden“ cannot reach
    // (its cursor lies below the held ones). Start over as on a fresh open (#848, spec story 17); the outgoing lines and the pending deletes are not `messages` and stay.
    const missedMore = !first && page.next !== null && !page.messages.some(message => isHeld(message.id))
    messages.value = mergeMessages(missedMore ? [] : messages.value, pageMessages(page), deleted)
    dropSettled()
    if (first || missedMore) next.value = page.next
    status.value = 'ready'
    if (first || missedMore || follow) scrollToEnd()
  }
  catch {
    // A Chat that has shown Messages keeps them; the next open of the connection tries again.
    if (status.value !== 'ready') status.value = 'failed'
  }
}

async function loadOlder() {
  if (!next.value || loadingOlder.value) return
  loadingOlder.value = true
  try {
    const page = await $fetch<MessagePage>(`/api/e/${props.slug}/messages`, { query: { before: next.value } })
    // The list grows above what is read: keep what the reader looks at where it is. The scroller opts out of the browser's scroll anchoring (`overflow-anchor: none`), so this
    // correction is the only one: Chrome's anchoring had moved `scrollTop` by the same growth when the log was not at its top, and the log moved twice (#881).
    // The row is kept where it is on the screen, not by the growth of `scrollHeight`: the last page also removes the button above the log, which grows the log upwards (#881).
    const anchor = topBubble()
    mergeWriters(page)
    messages.value = mergeMessages(messages.value, pageMessages(page), deleted)
    next.value = page.next
    await nextTick()
    const moved = anchor && bubbles().find(bubble => bubble.dataset.messageId === anchor.id)
    if (moved && scroller.value) scroller.value.scrollTop += moved.getBoundingClientRect().top - anchor.top
  }
  catch {
    // The button stays; pressing it again tries again.
  }
  finally {
    loadingOlder.value = false
  }
}

function retry() {
  status.value = 'loading'
  void loadFirst()
}

// A Message of this writer that the page sent and has not seen settle (#667): it shows at once under the held Messages, as „wird gesendet …“, and is a Message
// of the Chat when the answer or the room's `chat.added` brings it, whichever is first (by id). A failed one keeps its text for „Erneut senden“, which sends the same id.
interface Outgoing {
  id: string
  text: string
  at: string
  state: 'sending' | 'failed'
  /** The last failure was the limiter's (429). */
  limited: boolean
}
const draft = ref('')
const outgoing = ref<Outgoing[]>([])
const fieldId = useId()
const draftCount = computed(() => characterCount(draft.value))
const nearLimit = computed(() => draftCount.value >= MESSAGE_MAX * 0.8)
const sendable = computed(() => parseMessageText(draft.value).ok)
const outgoingById = computed(() => new Map(outgoing.value.map(entry => [entry.id, entry])))

const isHeld = (id: string) => messages.value.some(held => held.id === id)
/** A Message the Chat holds is settled, whatever a call says: its line leaves the outgoing ones. */
const dropSettled = () => {
  if (outgoing.value.some(entry => isHeld(entry.id))) outgoing.value = outgoing.value.filter(entry => !isHeld(entry.id))
}

/** The bubble of one Message rises, once, where it shows. */
function riseOf(id: string) {
  void nextTick(() => {
    const bubble = [...scroller.value?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []].find(element => element.dataset.messageId === id)
    if (bubble) chatRise(bubble)
  })
}

async function post(id: string, text: string) {
  try {
    const answer = await $fetch<Message>(`/api/e/${props.slug}/messages`, { method: 'POST', body: { id, text } })
    // No refetch of anything: the answer is the Message as stored (a deleted one shows as its line, never its text).
    messages.value = mergeMessages(messages.value, [answer], deleted)
    outgoing.value = outgoing.value.filter(entry => entry.id !== id)
  }
  catch (error) {
    if (isHeld(id)) {
      dropSettled()
      return
    }
    const entry = outgoing.value.find(item => item.id === id)
    if (!entry) return
    const failure = apiFailure(error)
    entry.limited = failure.status === 429 || failure.code === 'rate_limited'
    entry.state = 'failed'
  }
}

function send() {
  const parsed = parseMessageText(draft.value)
  if (!parsed.ok) return
  const id = crypto.randomUUID()
  outgoing.value.push({ id, text: parsed.text, at: new Date().toISOString(), state: 'sending', limited: false })
  draft.value = ''
  // The writer sees their own line, wherever the log was scrolled to.
  scrollToEnd()
  void post(id, parsed.text)
}

/** Sends the same id and text again: a retry after a lost answer shows and stores the Message once. */
function resend(entry: Outgoing) {
  entry.state = 'sending'
  entry.limited = false
  void post(entry.id, entry.text)
}

function onInput(event: Event) {
  const el = event.target as HTMLInputElement
  let value = normaliseMessageLineBreaks(el.value)
  if (characterCount(value) > MESSAGE_MAX) value = cutToCharacters(value, MESSAGE_MAX)
  // Written back directly, as `NoteEditor` does: when the cut value equals the draft, Vue would not patch the field.
  if (value !== el.value) {
    const caret = Math.min(el.selectionStart ?? value.length, value.length)
    el.value = value
    el.setSelectionRange(caret, caret)
  }
  draft.value = value
}

// Enter sends; the field is one line. Not while an IME is composing.
function onEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  send()
}

// Deleting a Message (#763, ADR 0013: no server timer, the undo is the page's). The Message is hidden at once (a view filter: `messages` itself is untouched, so a re-read
// that brings it again leaves it hidden), a toast offers „Rückgängig“ for 5 s, and the call goes out when the toast ends.
const UNDO_MS = 5000
const hidden = ref<string[]>([])
const { toast, toasts, dismiss } = useToast()
/** Message id → the id of its toast, for each delete not sent yet. Not reactive: nothing is drawn from it. */
const pending = new Map<string, number>()

const unhide = (id: string) => {
  hidden.value = hidden.value.filter(item => item !== id)
}

/** The call: the answer is the Message as stored (the line, also when the Host or a racing delete was first); a failure puts the Message back. Sent once, whoever asks first. */
async function flush(id: string) {
  if (!pending.delete(id)) return
  try {
    // `keepalive` lets the call outlive a page that is being left.
    const answer = await $fetch<Message>(`/api/e/${props.slug}/messages/${id}`, { method: 'DELETE', keepalive: true })
    messages.value = mergeMessages(messages.value, [answer], deleted)
    unhide(id)
  }
  catch (error) {
    unhide(id)
    toast({ tone: 'error', text: t(apiErrorKey(error, 'error.saveFailed')) })
  }
}

function requestDelete(id: string) {
  hidden.value = [...hidden.value, id]
  const toastId = toast({ tone: 'info', text: t('chat.deletedToast'), duration: UNDO_MS, action: { label: t('chat.undo'), run: () => undo(id) } })
  pending.set(id, toastId)
  // The pressed control leaves the DOM: the log takes the focus (not the composer, which would open the phone's keyboard).
  scroller.value?.focus({ preventScroll: true })
}

/** „Rückgängig“: nothing was sent, so nothing is undone on the server. The pending entry goes first, so the toast's own dismissal finds none. */
function undo(id: string) {
  pending.delete(id)
  unhide(id)
}

// The toast's end sends the call: its timer, its ✕ and the eviction of the oldest toast by a fourth all take its id out of the list (`useToast` has no end hook and needs none).
watch(() => toasts.value.map(item => item.id), (ids) => {
  for (const [id, toastId] of pending) {
    if (!ids.includes(toastId)) void flush(id)
  }
})

/** Leaving the page, or this panel: every pending delete goes out now and its toast goes. */
function flushAll() {
  for (const [id, toastId] of [...pending]) {
    dismiss(toastId)
    void flush(id)
  }
}
onMounted(() => window.addEventListener('pagehide', flushAll))
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', flushAll)
  flushAll()
})

const stopListening = props.room.on('chat.added', ({ message }) => {
  // A Message of an outgoing line settles by the room's copy (the answer then merges nothing new), and an own Message never rises: its held opacity would end the pending bubble's look.
  const own = outgoingById.value.has(message.id)
  outgoing.value = outgoing.value.filter(entry => entry.id !== message.id)
  if (isHeld(message.id)) return
  const follow = atEnd()
  messages.value = mergeMessages(messages.value, [message], deleted)
  // The bubble that arrived rises alone, also where it joins a group; the first page, an older page and a re-read never do. A line (its delete came first) does not rise.
  if (!own && !deleted.has(message.id)) riseOf(message.id)
  if (follow) scrollToEnd()
})
onScopeDispose(stopListening)

// A Message deleted, by the Host or its writer (also this page's own, once the call went out): its line takes its place. It changes `messages` only, never `hidden`, so a Message the
// deleter still has pending stays hidden until the call is answered. No scroll, rise or sound.
const stopListeningDeleted = props.room.on('chat.deleted', ({ id, deletedBy }) => {
  // Remembered for an id the Chat does not hold yet too: its page or its `chat.added` may still be on the way (#848). The first deleter stays, as `markDeleted` keeps it.
  if (!deleted.has(id)) deleted.set(id, deletedBy)
  messages.value = markDeleted(messages.value, id, deletedBy)
})
onScopeDispose(stopListeningDeleted)

watch(props.room.state, (state) => {
  if (state === 'open' && status.value === 'ready') void loadFirst()
})
watch(() => props.active, (active) => {
  if (active) scrollToEnd()
})
// A Member the Event no longer lists (a deleted account, #916; a removal from 0.22, #697): only the Chat's read knows the writer now, so it reads again, once per such change and not
// per `event.changed` (#990). The merge takes the writer's newer values, so the name line reads „Gelöschtes Konto“, or the real name of a writer who left without being deleted.
watch(() => props.members.map(member => member.id), (ids, before) => {
  if (membershipEnded(before, ids)) void loadFirst()
})
onMounted(() => void loadFirst())

const memberById = computed(() => new Map(props.members.map(member => [member.id, member])))

const viewerIsHost = computed(() => memberById.value.get(props.viewerId)?.isHost === true)
/** The writer's own live Message, and for the Host any live Message (#764). A line the page sent and has not seen settle may not exist on the server yet, so it has none. */
const canDelete = (message: Message) => message.text !== null && !outgoingById.value.has(message.id) && (message.writerId === props.viewerId || viewerIsHost.value)
/** The control's name: the writer's shown name (a Member's, or a writer the page carries, #916); „Du“ for the viewer's own Message of a writer the page does not name; else no name (`chat.deleteAnyAria`, #764). */
const deleteLabel = (group: { own: boolean, shownName?: string }) => {
  const name = group.shownName ?? (group.own ? t('common.you') : undefined)
  return name !== undefined ? t('chat.deleteAria', { name }) : t('chat.deleteAnyAria')
}

/** The groups with what their name line shows, all computed from the Members the page holds. */
const groups = computed(() => groupMessages([
  ...messages.value.filter(message => !hidden.value.includes(message.id)),
  // Appended after the held Messages, never sorted into them: a clock that is off must not put a pending line above a Message already shown.
  ...outgoing.value.filter(entry => !isHeld(entry.id)).map((entry): Message => ({ id: entry.id, writerId: props.viewerId, text: entry.text, at: entry.at })),
]).map((group) => {
  const member = memberById.value.get(group.writerId)
  // A Member, else a writer the page carries who is no Member (#916); a Deleted User reads „Gelöschtes Konto“ either way (shownPerson, #915).
  const person = member ?? writers.value[group.writerId]
  const shown = person ? shownPerson(person, t) : undefined
  const own = group.writerId === props.viewerId
  const first = group.messages[0]!
  return {
    key: first.id,
    own,
    member,
    name: own ? t('common.you') : shown?.name,
    shownName: shown?.name,
    shown,
    /** In a team: the team's number and name; on the Stands: no number. Nothing for a writer the Event no longer lists. */
    place: member ? { team: member.zone === 'team' ? member.team : null, text: member.zone === 'team' && member.team !== null ? teamNameAt(props.teams, member.team, t) : t('board.stands') } : undefined,
    messages: group.messages,
    at: first.at,
    time: formatActivityTime(new Date(first.at), now),
  }
}))
</script>

<template>
  <!-- It fills its parent (the SidePanel's tab), which has the height; the log scrolls inside. -->
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div
      v-if="status === 'failed'"
      class="m-3 flex flex-col items-center gap-3 rounded-[12px] border-2 border-dashed border-line-soft p-3.5"
    >
      <p class="m-0 text-center text-ink-2">
        {{ t('chat.loadFailed') }}
      </p>
      <AppButton
        variant="secondary"
        @click="retry"
      >
        {{ t('chat.retry') }}
      </AppButton>
    </div>

    <template v-else>
      <AppButton
        v-if="next"
        variant="secondary"
        class="mt-3 self-center"
        :aria-disabled="loadingOlder"
        @click="loadOlder"
      >
        {{ t('chat.older') }}
      </AppButton>

      <div
        ref="scroller"
        role="log"
        tabindex="-1"
        aria-live="polite"
        :aria-busy="status === 'loading'"
        :aria-label="t('chat.logAria')"
        class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3 pb-1.5 [overflow-anchor:none]"
        :class="next && 'fade-top'"
      >
        <!-- The feed's dashed look, not `EmptyState`: its 120 px Compibert is too wide for the panel. -->
        <div
          v-if="status === 'ready' && messages.length === 0"
          class="rounded-[12px] border-2 border-dashed border-line-soft p-3.5 text-[14px] text-pretty text-ink-2"
        >
          <p class="m-0 font-extrabold text-ink">
            {{ t('empty.chat.title') }}
          </p>
          <p class="m-0 mt-1 font-semibold">
            {{ t('empty.chat.text') }}
          </p>
        </div>

        <div
          v-for="group in groups"
          :key="group.key"
          class="flex items-end gap-2"
          :class="group.own && 'flex-row-reverse'"
        >
          <UserAvatar
            v-if="!group.own"
            :size="28"
            :name="group.shown?.name ?? '?'"
            :image="group.shown?.image"
            :team="group.member?.team"
            :deleted="group.shown?.deleted"
          />
          <div
            class="flex max-w-[84%] min-w-0 flex-col gap-[3px]"
            :class="group.own ? 'items-end' : 'items-start'"
          >
            <div class="flex max-w-full min-w-0 items-center gap-1.5 px-1 text-[12px]">
              <b
                v-if="group.name !== undefined"
                class="truncate font-extrabold"
              >{{ group.name }}</b>
              <span
                v-if="group.member?.isHost"
                class="inline-flex h-[18px] flex-none items-center gap-[3px] rounded-pill border-[1.5px] border-line bg-primary px-1.5 text-[10px] font-bold text-on-primary"
              >
                <AppIcon
                  :icon="Crown"
                  :size="10"
                />{{ t('common.host') }}
              </span>
              <span
                v-if="group.place"
                class="flex min-w-0 items-center gap-1 text-ink-2"
              >
                <TeamMark
                  v-if="group.place.team !== null"
                  :team="group.place.team"
                  :size="16"
                />
                <span class="truncate">{{ group.place.text }}</span>
              </span>
              <time
                :datetime="group.at"
                class="flex-none text-ink-2 tabular-nums"
              >{{ group.time }}</time>
            </div>

            <template
              v-for="message in group.messages"
              :key="message.id"
            >
              <!-- A deleted Message keeps its place and its group; `markDeleted` turns a live one into this line (#763). -->
              <div
                v-if="message.text === null"
                :data-message-id="message.id"
                class="border-2 border-dashed border-ink-3 px-3 py-1.5 text-[13px] text-ink-2 italic"
                :class="group.own ? 'rounded-[14px_14px_4px_14px]' : 'rounded-[14px_14px_14px_4px]'"
              >
                {{ message.deletedBy === 'host' ? t('chat.deleted') : t('chat.deletedByWriter') }}
              </div>
              <div
                v-else
                class="flex max-w-full min-w-0 items-center gap-1"
                :class="group.own && 'flex-row-reverse'"
              >
                <!-- The text is interpolated, never `v-html`; a link piece is an `a` (#762). -->
                <div
                  :data-message-id="message.id"
                  :data-outgoing-state="outgoingById.get(message.id)?.state"
                  class="min-w-0 border-2 border-line px-3 py-2 text-[14px] leading-[1.4]"
                  :class="[group.own ? 'rounded-[14px_14px_4px_14px] bg-primary text-on-primary' : 'rounded-[14px_14px_14px_4px] bg-surface text-ink', outgoingById.get(message.id)?.state === 'sending' && 'opacity-60']"
                >
                  <span class="[overflow-wrap:anywhere]"><template
                    v-for="(piece, index) in splitMessageText(message.text)"
                    :key="index"
                  ><a
                    v-if="piece.href"
                    :href="piece.href"
                    target="_blank"
                    :rel="NOTES_LINK_REL"
                    class="underline underline-offset-2"
                  >{{ piece.text }}</a><template v-else>{{ piece.text }}</template></template></span>
                </div>
                <!-- Always visible, in the tab order (the reference draws it so): a control that shows on hover would be none on a phone or for a keyboard (#763). -->
                <button
                  v-if="canDelete(message)"
                  type="button"
                  :aria-label="deleteLabel(group)"
                  :title="t('chat.delete')"
                  class="hit-44 grid size-8 flex-none place-items-center rounded-pill text-ink-2 hover:bg-surface-2 hover:text-error-fg"
                  @click="requestDelete(message.id)"
                >
                  <AppIcon
                    :icon="Trash2"
                    :size="15"
                  />
                </button>
              </div>
              <!-- What became of the line the page sent (#667): sending, or failed with the one button that sends the same Message again. -->
              <span
                v-if="outgoingById.get(message.id)?.state === 'sending'"
                class="self-end text-[11px] text-ink-2"
              >{{ t('chat.sending') }}</span>
              <template v-else-if="outgoingById.get(message.id)?.state === 'failed'">
                <p
                  v-if="outgoingById.get(message.id)?.limited"
                  class="m-0 self-end text-[12px] text-error-fg"
                  role="status"
                >
                  {{ t('error.rateLimited') }}
                </p>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 self-end px-1 py-0.5 text-[12px] font-bold text-error-fg"
                  @click="resend(outgoingById.get(message.id)!)"
                >
                  <AppIcon
                    :icon="CircleAlert"
                    :size="13"
                  />{{ t('chat.failed') }}
                </button>
              </template>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- The composer, or the note of a finished Event (#667). Every Member writes, whatever zone, seat, role or Phase; only the Finish and a failed read take it away. -->
    <template v-if="status !== 'failed'">
      <p
        v-if="finished"
        class="m-0 flex-none border-t-2 border-line-soft bg-surface-2 p-2.5 text-[13px] font-semibold text-ink-2"
      >
        {{ t('chat.finished') }}
      </p>
      <div
        v-else
        class="flex flex-none flex-col gap-1.5 border-t-2 border-line-soft bg-surface-2 p-2.5"
      >
        <span
          v-if="nearLimit"
          aria-hidden="true"
          class="self-end font-mono text-[12px] font-bold"
          :class="draftCount >= MESSAGE_MAX - 8 ? 'text-warning-fg' : 'text-ink-2'"
        >{{ t('common.counter', { n: draftCount, max: MESSAGE_MAX }) }}</span>
        <span
          class="sr-only"
          aria-live="polite"
        >{{ nearLimit ? t('chat.remaining', { n: MESSAGE_MAX - draftCount }) : '' }}</span>
        <div class="flex items-end gap-1.5">
          <label
            :for="fieldId"
            class="sr-only"
          >{{ t('chat.placeholder') }}</label>
          <input
            :id="fieldId"
            type="text"
            autocomplete="off"
            enterkeyhint="send"
            :value="draft"
            :placeholder="t('chat.placeholder')"
            class="h-11 min-w-0 flex-1 rounded-[12px] border-2 border-line bg-surface px-3 text-[16px] text-ink placeholder:text-ink-2"
            @input="onInput"
            @keydown.enter.prevent="onEnter"
          >
          <button
            type="button"
            :aria-label="t('chat.send')"
            :aria-disabled="!sendable"
            class="inline-flex size-11 flex-none items-center justify-center rounded-pill border-2 border-line"
            :class="sendable ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-2 text-ink shadow-none'"
            @click="send"
          >
            <AppIcon
              :icon="Send"
              :size="22"
            />
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
