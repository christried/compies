<script setup lang="ts">
import { Crown, FerrisWheel, Hand, Lock, Scale, Swords } from '@lucide/vue'
import type { Component } from 'vue'
import { vetoAllowanceOf, type EventDraft, type StepLocks } from '~/utils/event-draft'
import { AVAILABLE_SELECTION_MODES, VETO_ALLOWANCE_MAX, VETO_ALLOWANCE_MIN, hasWheel, type SelectionMode } from '~~/shared/settings'

// The Selection mode (#145). The Lucky Wheel (Glücksrad) and Host-Wahl are open; the other three are shown as „Bald
// verfügbar“ on their cards, so the Host knows what is coming (no note under them, #174). With the Lucky Wheel:
// Rad verdecken and the Veto allowance, both kept in the draft while Host-Wahl is chosen, and the Veto allowance follows the Team size until the Host sets
// it (`vetoAllowanceOf`). „Pool vorher zeigen“ (#225) sits in the wheel's box with the Lucky Wheel and in a box of its own
// with Host-Wahl. The step never blocks. In the settings editor (#147) `locks.reason` locks the mode (the Event
// is running; Rad verdecken, Pool vorher zeigen and the Veto allowance stay open) and `locks.floors` keeps the Veto
// allowance from going below what a Party has spent.
const props = defineProps<{ locks?: StepLocks }>()
const draft = defineModel<EventDraft>({ required: true })
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()

useStepBlocker(blocker)

const options = computed<{ value: SelectionMode, label: string, desc: string, icon: Component, locked: boolean }[]>(() => ([
  { value: 'admin_pick', label: t('setup.mode.admin.name'), desc: t('setup.mode.admin.desc'), icon: Crown },
  { value: 'lucky_wheel', label: t('setup.mode.wheel.name'), desc: t('setup.mode.wheel.desc'), icon: FerrisWheel },
  { value: 'pick_ban', label: t('setup.mode.pickBan.name'), desc: t('setup.mode.pickBan.desc'), icon: Swords },
  { value: 'losers_pick', label: t('setup.mode.loserPick.name'), desc: t('setup.mode.loserPick.desc'), icon: Hand },
  { value: 'losers_advantage', label: t('setup.mode.loserAdv.name'), desc: t('setup.mode.loserAdv.desc'), icon: Scale },
] as const).map(option => ({ ...option, locked: !AVAILABLE_SELECTION_MODES.includes(option.value) })))

function choose(value: SelectionMode) {
  if (value === 'lucky_wheel' || value === 'admin_pick') draft.value = { ...draft.value, settings: { ...draft.value.settings, selectionMode: value } }
}

const vetoMin = computed(() => Math.max(VETO_ALLOWANCE_MIN, props.locks?.floors?.vetoAllowance ?? VETO_ALLOWANCE_MIN))
const vetoMinReason = computed(() => (vetoMin.value > VETO_ALLOWANCE_MIN ? t('setup.mode.vetoesFloor', { n: vetoMin.value }) : t('setup.mode.vetoesMin')))

const wheel = computed(() => hasWheel(draft.value.settings.selectionMode))
const veto = computed(() => vetoAllowanceOf(draft.value))

// „Pool vorher zeigen“ (#225) is always off under „Rad verdecken“. Turning „Rad verdecken“ on turns it off; turning it off
// leaves it off until the Host turns it on, so nothing is revealed by surprise.
const poolPreview = computed({
  get: () => draft.value.poolPreview && !(wheel.value && draft.value.hiddenWheel),
  set: (value) => {
    draft.value = { ...draft.value, poolPreview: value }
  },
})

function hideWheel(hidden: boolean) {
  draft.value = hidden ? { ...draft.value, hiddenWheel: true, poolPreview: false } : { ...draft.value, hiddenWheel: false }
}
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <NoticeBanner
      v-if="locks?.reason"
      tone="info"
      :icon="Lock"
    >
      {{ locks.reason }}
    </NoticeBanner>
    <RadioCardGroup
      :model-value="draft.settings.selectionMode"
      :options="options"
      :label="t('setup.mode.title')"
      :locked-reason="locks?.reason"
      @update:model-value="choose"
    />
    <div
      v-if="!wheel"
      class="flex flex-col gap-3.5 rounded-2xl border-(length:--cp-bw) border-line bg-surface p-4"
    >
      <ToggleSwitch
        v-model="poolPreview"
        :label="t('setup.mode.poolPreview')"
        :help="t('setup.mode.poolPreviewHelp')"
      />
    </div>
    <div
      v-else
      class="flex flex-col gap-3.5 rounded-2xl border-(length:--cp-bw) border-line bg-surface p-4"
    >
      <ToggleSwitch
        :model-value="draft.hiddenWheel"
        :label="t('setup.mode.hideWheel')"
        :help="t('setup.mode.hideWheelHelp')"
        @update:model-value="hideWheel"
      />
      <ToggleSwitch
        v-model="poolPreview"
        :label="t('setup.mode.poolPreview')"
        :help="draft.hiddenWheel ? t('setup.mode.poolPreviewHidden') : t('setup.mode.poolPreviewHelp')"
        :disabled="draft.hiddenWheel"
      />
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex min-w-[150px] flex-1 flex-col leading-[1.3]">
          <b>{{ t('setup.mode.vetoes') }}</b>
          <span class="text-[12px] text-ink-2">{{ t('setup.mode.vetoesHelp') }}</span>
        </div>
        <NumberStepper
          :model-value="veto"
          :min="vetoMin"
          :max="VETO_ALLOWANCE_MAX"
          :label="t('setup.mode.vetoes')"
          :min-reason="vetoMinReason"
          :max-reason="t('setup.mode.vetoesMax')"
          @update:model-value="draft = { ...draft, vetoAllowance: $event }"
        />
      </div>
    </div>
  </div>
</template>
