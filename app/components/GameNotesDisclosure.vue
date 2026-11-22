<script setup lang="ts">
import { ChevronDown, Lock, StickyNote } from '@lucide/vue'
import type { NotesDoc } from '~~/shared/notes-doc'

// The Game notes of a game (#224, GLOSSARY: Game notes) as a disclosure: collapsed by default, announced as open or
// closed, and the document formatted by RichNotes (#728). A document without a visible character shows no button; `notes` left at null (the slot's use) shows it. The panel is rendered only while it is open.
// Only the Host gets the notes of a pool game (#224); 0.7 reuses it for the Host on the Round card (#217), where it starts
// open (#228): the notes are what the Host needs while the game is played. Since 0.19 the Round card sets `remember` (#838) instead of `startOpen`: open the first
// time, then open or closed as the Host left it on this device (`useRoundNotesMemory`); the library page's list of a game's Events does not, and stays closed. The Session rows reuse it for the Notes
// on a Slot's Votes (#349): the `label` names it with the count, and its default slot is the panel's content instead of the text.
// The Host's Event notes of the game (#732) come above the Game notes in the same panel: a game with only Event notes shows the disclosure too.
// The Round card has its own look (#729, hand-off 18-notizen.md § RoundCard „Notizen“): `variant="round"`, a 44 px button with the sticky note, „Notizen“, the
// lock and „Nur du siehst das“ and a chevron at the right, and a paper-2 panel that opens in a height run: the Event block (sm, framed), a rule, the game block
// (bare). Every other place keeps the default look: „Alle Tags“ (#615) and the Session notes (#349).
const props = withDefaults(defineProps<{
  notes?: NotesDoc | null
  eventNotes?: NotesDoc | null
  label?: string
  startOpen?: boolean
  variant?: 'default' | 'round'
  remember?: boolean
}>(), { notes: null, eventNotes: null, label: undefined, startOpen: false, variant: 'default', remember: false })

const { t } = useI18n()
const panelId = useId()
// The Round card's notes remember open or closed on this device (`remember`, #838); every other place keeps its own state, starting as `startOpen` says.
const memory = props.remember ? useRoundNotesMemory() : null
const local = ref(props.startOpen)
const open = computed({
  get: () => (memory ? memory.open.value : local.value),
  set: (value: boolean) => (memory ? memory.set(value) : (local.value = value)),
})
// The panel of a stored `closed` is already hidden by the head script when the page takes the choice over, so its leave has nothing to run.
const leave = (element: Element, done: () => void) => (memory?.hiddenByScript() ? done() : disclosureLeave(element, done))
const { doc, eventDoc } = useNotePair(() => props.notes, () => props.eventNotes)
const shown = computed(() => (props.notes === null && props.eventNotes === null) || doc.value !== null || eventDoc.value !== null)
</script>

<template>
  <div
    v-if="shown && variant === 'round'"
    class="flex flex-col gap-2"
  >
    <button
      type="button"
      class="flex h-11 w-full items-center gap-2 px-1 text-left text-ink"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      @click="open = !open"
    >
      <AppIcon
        :icon="StickyNote"
        :size="18"
      />
      <span class="text-[15px] font-extrabold">{{ label ?? t('howWePlay.notes') }}</span>
      <span class="inline-flex min-w-0 items-center gap-1 text-[12px] font-semibold text-ink-2">
        <AppIcon
          :icon="Lock"
          :size="12"
        />
        {{ t('common.hostOnly') }}
      </span>
      <AppIcon
        :icon="ChevronDown"
        :size="20"
        class="ml-auto transition-transform dur-base ease-snap motion-reduce:transition-none reduced:transition-none round-notes-closed:rotate-0"
        :class="open && 'rotate-180'"
      />
    </button>
    <Transition
      :css="false"
      @enter="disclosureEnter"
      @leave="leave"
    >
      <div
        v-if="open"
        :id="panelId"
        class="overflow-hidden rounded-[12px] bg-paper-2 round-notes-closed:hidden"
      >
        <GameNotesStack
          class="px-3.5 pt-3 pb-3.5"
          :notes="doc"
          :event-notes="eventDoc"
          size="sm"
          bare
        />
      </div>
    </Transition>
  </div>
  <div
    v-else-if="shown"
    class="flex flex-col gap-2"
  >
    <button
      type="button"
      class="inline-flex h-11 items-center gap-1.5 self-start px-1 text-[13px] font-bold text-ink underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      @click="open = !open"
    >
      {{ label ?? t('howWePlay.notes') }}
      <AppIcon
        :icon="ChevronDown"
        :size="14"
        :class="open && 'rotate-180'"
      />
    </button>
    <div
      v-if="open"
      :id="panelId"
      class="rounded-[12px] bg-paper-2 px-3.5 py-3"
    >
      <slot>
        <GameNotesStack
          :notes="doc"
          :event-notes="eventDoc"
          size="sm"
        />
      </slot>
    </div>
  </div>
</template>
