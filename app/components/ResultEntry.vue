<script setup lang="ts">
import { ChevronDown, ChevronUp, Equal, GripVertical } from '@lucide/vue'
import { teamName } from '~/utils/board'
import { draftPlaces, draftPoints, moveRow, newResultDraft, setScore, toggleLevel } from '~/utils/result-draft'
import type { BoardTeam } from '~~/shared/event'
import type { RoundGame } from '~~/shared/game'
import { SCORE_MAX, type ResultPlace } from '~~/shared/results'
import type { PointsTable } from '~~/shared/settings'
import { cutToCharacters } from '~~/shared/text'

// The result sheet (#273, GLOSSARY: Result, Place, Shared place, Score; 02-components § ResultEntry, screen 16): the Host orders the Parties into
// Places. The rows start in team order; a drag by the handle (mouse at once, finger by long press), the arrow buttons and the keyboard all make
// the same move (result-draft.ts). „gleichauf“ between two neighbours gives them one Place (1, 1, 3). A Score is optional and counts for nothing.
// Each row shows the points it earns by the Points table. Nothing is sent before „Ergebnis speichern“; closing discards the draft, and
// opening starts again from team order. The save is the page's (EventRounds); it says whether the server took the Result, and only then the sheet
// closes, so a refusal keeps the order and the Scores. FFA and the Correction are not built here (#275 does the latter).
const props = defineProps<{
  open: boolean
  /** The game of the Round, shown above the rows; null while no Round is chosen. */
  game: RoundGame | null
  /** The Parties, in team order. */
  teams: BoardTeam[]
  pointsTable: PointsTable
  /** Sends the Places; resolves to whether the server took them. */
  save: (places: ResultPlace[]) => Promise<boolean>
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const draft = ref(newResultDraft(props.teams.length))
/** What the live region says; empty until a row moves. */
const announcement = ref('')
const busy = ref(false)

watch(() => props.open, (open) => {
  if (!open) return
  draft.value = newResultDraft(props.teams.length)
  announcement.value = ''
  busy.value = false
})

const nameOf = (position: number) => {
  const team = props.teams.find(item => item.position === position)
  return team ? teamName(team, t) : teamName(position, t)
}

const places = computed(() => draftPlaces(draft.value))
const points = computed(() => draftPoints(draft.value, props.pointsTable))

function move(from: number, to: number) {
  const next = moveRow(draft.value, from, to)
  if (next === draft.value) return
  draft.value = next
  announcement.value = t('result.nowPlace', { team: nameOf(next.order[to]!), n: draftPlaces(next)[to]!.place })
}

/** A button press moves the row; the row's buttons are re-ordered in the DOM, which can drop the focus, so it is put back on the same kind of button. */
async function moveBy(index: number, step: -1 | 1) {
  const team = draft.value.order[index]!
  move(index, index + step)
  await nextTick()
  const row = rowEls.get(team)
  const wanted = row?.querySelector<HTMLButtonElement>(`[data-move="${step < 0 ? 'up' : 'down'}"]`)
  const other = row?.querySelector<HTMLButtonElement>(`[data-move="${step < 0 ? 'down' : 'up'}"]`)
  ;(wanted && !wanted.disabled ? wanted : other)?.focus()
}

function typeScore(team: number, event: Event) {
  const input = event.target as HTMLInputElement
  const cut = cutToCharacters(input.value, SCORE_MAX)
  // Written back directly: when the cut value equals the stored one, Vue would not patch the input.
  if (cut !== input.value) input.value = cut
  draft.value = setScore(draft.value, team, cut)
}

const rowEls = new Map<number, HTMLElement>()
const setRow = (team: number, element: unknown) => {
  if (element instanceof HTMLElement) rowEls.set(team, element)
  else rowEls.delete(team)
}

const { dragging, dropIndex, start } = useRowDrag({
  rowCount: () => draft.value.order.length,
  rowMiddles: () => draft.value.order.map((team) => {
    const rect = rowEls.get(team)?.getBoundingClientRect()
    return rect ? rect.top + rect.height / 2 : 0
  }),
  move: (from, to) => move(from, to),
})

/** Where the drop line shows relative to a row while another one is held over it. */
function dropLine(index: number): 'above' | 'below' | null {
  if (!dragging.value || dropIndex.value !== index || dropIndex.value === dragging.value.index) return null
  return index > dragging.value.index ? 'below' : 'above'
}

async function onSave() {
  if (busy.value) return
  busy.value = true
  try {
    if (await props.save(draftPlaces(draft.value))) emit('close')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('result.title')"
    full
    @close="emit('close')"
  >
    <div class="flex flex-col gap-1">
      <p
        v-if="game"
        class="m-0 font-display text-[22px] leading-tight"
      >
        {{ game.name }}
      </p>
      <p class="m-0 text-[14px] text-ink-2">
        {{ t('result.help') }}
      </p>
    </div>

    <TransitionGroup
      tag="ol"
      :aria-label="t('result.placement')"
      move-class="transition-transform dur-slower ease-spring motion-reduce:transition-none reduced:transition-none"
      class="m-0 flex list-none flex-col p-0"
    >
      <li
        v-for="(team, index) in draft.order"
        :key="team"
        class="relative"
        :class="dragging?.index === index ? 'z-10' : ''"
      >
        <div
          v-if="index > 0"
          class="flex py-1.5 pl-11"
        >
          <button
            type="button"
            role="switch"
            :aria-checked="draft.level[index] ? 'true' : 'false'"
            :aria-label="t('result.tiedAria', { team: nameOf(team), other: nameOf(draft.order[index - 1]!) })"
            class="hit-44 inline-flex h-[26px] items-center gap-1 rounded-pill border-2 border-line px-2.5 text-[12px] font-bold"
            :class="draft.level[index] ? 'bg-primary text-on-primary' : 'border-dashed bg-surface text-ink-2'"
            @click="draft = toggleLevel(draft, index)"
          >
            <AppIcon
              :icon="Equal"
              :size="12"
            />
            {{ t('result.tied') }}
          </button>
        </div>

        <div
          :ref="element => setRow(team, element)"
          class="relative flex flex-col gap-2 rounded-[12px] border-2 bg-surface p-2"
          :class="dragging?.index === index
            ? 'top-(--drag-dy) translate-x-1 -rotate-[0.6deg] border-focus shadow-lift select-none reduced:rotate-0 motion-reduce:rotate-0'
            : 'border-line'"
          :style="dragging?.index === index ? { '--drag-dy': `${dragging.dy}px` } : undefined"
          :data-team="team"
        >
          <span
            v-if="dropLine(index) === 'above'"
            class="absolute inset-x-0 -top-[5px] h-[3px] rounded-pill bg-primary"
            aria-hidden="true"
          />
          <span
            v-if="dropLine(index) === 'below'"
            class="absolute inset-x-0 -bottom-[5px] h-[3px] rounded-pill bg-primary"
            aria-hidden="true"
          />

          <div class="flex items-center gap-2">
            <span
              data-place
              class="grid size-[34px] flex-none place-items-center rounded-full border-[2.5px] border-line font-display text-[17px]"
              :class="places[index]!.place === 1 ? 'bg-primary text-on-primary' : 'bg-surface text-ink'"
            >
              <span aria-hidden="true">{{ places[index]!.place }}</span>
              <span class="sr-only">{{ t('result.place', { n: places[index]!.place }) }}</span>
            </span>
            <TeamMark :team="team" />
            <b
              data-name
              class="min-w-0 flex-1 truncate text-[14px]"
              :title="nameOf(team)"
            >{{ nameOf(team) }}</b>
            <span
              data-earns
              class="flex-none font-num text-[14px] text-ink-2"
            >{{ t('result.earns', { n: points[index]! }, points[index]!) }}</span>
          </div>

          <div class="flex items-center gap-2">
            <IconButton
              :icon="GripVertical"
              :label="t('result.handle', { team: nameOf(team) })"
              :size="36"
              class="cursor-grab touch-none"
              @pointerdown="start($event, index)"
            />
            <IconButton
              :icon="ChevronUp"
              :label="t('result.up', { team: nameOf(team) })"
              :size="36"
              data-move="up"
              :disabled="index === 0"
              class="disabled:border-dashed disabled:border-ink-3 disabled:bg-paper-2 disabled:text-ink-3"
              @click="moveBy(index, -1)"
            />
            <IconButton
              :icon="ChevronDown"
              :label="t('result.down', { team: nameOf(team) })"
              :size="36"
              data-move="down"
              :disabled="index === draft.order.length - 1"
              class="disabled:border-dashed disabled:border-ink-3 disabled:bg-paper-2 disabled:text-ink-3"
              @click="moveBy(index, 1)"
            />
            <input
              :value="draft.scores[team] ?? ''"
              type="text"
              :aria-label="t('result.scoreLabel', { team: nameOf(team) })"
              :placeholder="t('result.score')"
              class="h-10 min-w-0 flex-1 rounded-md border-(length:--cp-bw) border-line bg-surface px-3 text-[15px] text-ink"
              @input="typeScore(team, $event)"
            >
          </div>
        </div>
      </li>
    </TransitionGroup>

    <p
      role="status"
      aria-live="polite"
      class="sr-only"
    >
      {{ announcement }}
    </p>

    <template #footer>
      <AppButton
        class="w-full disabled:border-dashed disabled:border-ink-3 disabled:bg-paper-2 disabled:text-ink-3 disabled:shadow-none"
        size="lg"
        :disabled="busy"
        @click="onSave"
      >
        {{ t('result.save') }}
      </AppButton>
    </template>
  </AppSheet>
</template>
