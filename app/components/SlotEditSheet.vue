<script setup lang="ts">
import { Plus, X } from '@lucide/vue'
import { apiErrorKey } from '~/utils/api-error'
import { formatSlotWhen } from '~/utils/berlin-time'
import { SLOTS_MAX, slotProblems } from '~~/shared/event'
import { berlinToUtc, utcToBerlin } from '~~/shared/time'

// The Host's Slot editor (#15), opened from the host dock while the Date poll is open. Lists the
// Slots with their Votes and adds one with the create form's Slot row. A Slot without Votes goes at
// once; with Votes it needs HoldToConfirmButton and says how many Votes go with it. The server
// checks every rule again (#1 § Domain rules); the checks here only save a round trip.

export interface EditableSlot {
  id: string
  /** UTC ISO string, as the Event read returns it. */
  startsAt: string
  /** Votes on this Slot, from the last read. */
  votes: number
}

const props = defineProps<{
  open: boolean
  slug: string
  slots: EditableSlot[]
}>()

const emit = defineEmits<{ close: [], changed: [] }>()

const { t } = useI18n()
const { toast } = useToast()
const blockerId = useId()
const newSlot = ref('')
/** Berlin wall-clock now, minute precision, as the field's lower bound (ADR 0003). */
const now = ref(utcToBerlin(new Date()))
const busy = ref(false)
// Bumped after a failed removal so the hold buttons start again from zero.
const epoch = ref(0)

watch(() => props.open, (open) => {
  if (open) now.value = utcToBerlin(new Date())
})

const rows = computed(() => props.slots.map(slot => ({ ...slot, label: formatSlotWhen(new Date(slot.startsAt)) })))

const full = computed(() => props.slots.length >= SLOTS_MAX)

/** The Slot rule the new time breaks, as the server would judge it (shared/event.ts). */
const problem = computed(() => {
  if (newSlot.value === '') return null
  const existing = props.slots.map(slot => new Date(slot.startsAt))
  return slotProblems([berlinToUtc(newSlot.value)], existing, berlinToUtc(now.value))[0] ?? null
})

const problemText = computed(() => {
  if (problem.value === 'in_past') return t('error.slotPast')
  if (problem.value === 'duplicate_slot') return t('error.slotDuplicate')
  return undefined
})

const addBlocked = computed(() => newSlot.value === '' || problem.value !== null)

/** What a failed save says, from the reason the server gives. */
function failureText(failure: unknown): string {
  return t(apiErrorKey(failure, 'error.saveFailed', { invalid_time: 'mvp.slots.incomplete', wrong_phase: 'mvp.slots.locked' }), { max: SLOTS_MAX })
}

async function add() {
  if (addBlocked.value || busy.value) return
  busy.value = true
  try {
    await $fetch(`/api/e/${props.slug}/slots`, { method: 'POST', body: { startsAt: newSlot.value } })
    newSlot.value = ''
    emit('changed')
  }
  catch (failure) {
    toast({ tone: 'error', text: failureText(failure) })
  }
  finally {
    busy.value = false
  }
}

async function remove(slotId: string) {
  try {
    await $fetch(`/api/e/${props.slug}/slots/${slotId}`, { method: 'DELETE' })
    emit('changed')
  }
  catch (failure) {
    epoch.value += 1
    toast({ tone: 'error', text: failureText(failure) })
  }
}
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('mvp.slots.title')"
    @close="emit('close')"
  >
    <section class="flex flex-col gap-2.5">
      <h3 class="m-0 font-display text-[20px] leading-tight font-normal">
        {{ t('mvp.slots.listTitle') }}
      </h3>
      <p
        v-if="rows.length === 0"
        class="m-0 text-small text-ink-2"
      >
        {{ t('mvp.slots.empty') }}
      </p>
      <ul
        v-else
        class="m-0 flex list-none flex-col gap-2.5 p-0"
      >
        <li
          v-for="row in rows"
          :key="row.id"
          class="flex flex-col gap-2 rounded-xl border-(length:--cp-bw) border-line bg-surface p-3"
        >
          <div class="flex items-center gap-3">
            <span class="flex-1 font-num text-[16px] font-bold">{{ row.label }}</span>
            <IconButton
              v-if="row.votes === 0"
              :icon="X"
              :label="t('mvp.slots.remove')"
              @click="remove(row.id)"
            />
          </div>
          <template v-if="row.votes > 0">
            <p class="m-0 text-small font-bold text-ink-2">
              {{ t('mvp.slots.votesLost', { n: row.votes }, row.votes) }}
            </p>
            <HoldToConfirmButton
              :key="`${row.id}-${epoch}`"
              variant="hot"
              :label="t('mvp.slots.remove')"
              :icon="X"
              @confirm="remove(row.id)"
            />
          </template>
        </li>
      </ul>
    </section>

    <form
      v-if="!full"
      novalidate
      class="flex flex-col gap-3 border-t-(length:--cp-bw) border-line pt-4"
      @submit.prevent="add"
    >
      <DateTimeField
        v-model="newSlot"
        :label="t('mvp.slots.newLabel')"
        :error="problemText"
      />
      <p class="m-0 text-small text-pretty text-ink-2">
        {{ t('mvp.slots.addHelp', { max: SLOTS_MAX }) }}
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="hit-44 inline-flex min-h-11 items-center gap-1.5 self-start rounded-pill border-[2.5px] border-dashed border-line px-3.5 text-small font-bold text-ink outline-memphis lift aria-disabled:text-ink-3 aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-none aria-disabled:hover:bg-none"
          :aria-disabled="addBlocked || busy ? 'true' : undefined"
          :aria-describedby="newSlot === '' ? blockerId : undefined"
        >
          <AppIcon
            :icon="Plus"
            :size="16"
          />
          {{ t('mvp.slots.add') }}
        </button>
        <span
          v-if="newSlot === ''"
          :id="blockerId"
          class="text-small font-bold text-ink-2"
        >{{ t('mvp.slots.incomplete') }}</span>
      </div>
    </form>
    <p
      v-else
      class="m-0 text-small font-bold text-ink-2"
    >
      {{ t('error.slotsMax', { max: SLOTS_MAX }) }}
    </p>
  </AppSheet>
</template>
