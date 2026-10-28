<script setup lang="ts">
import { Crown, FerrisWheel, Hand, Scale, Swords } from '@lucide/vue'
import { chooseMode, setHiddenWheel, setVetoAllowance, type EventDraft } from '~/utils/event-draft'
import { AVAILABLE_SELECTION_MODES, VETO_ALLOWANCE_MAX, VETO_ALLOWANCE_MIN } from '~~/shared/settings'

// Step 5: the Selection mode (#145). Lucky Wheel and Admin-Wahl are open; the other three are shown as „Bald
// verfügbar“ so the Host knows what is coming. With the Lucky Wheel: Rad verdecken and the Veto allowance,
// both kept in the draft's wheel options while Admin-Wahl is chosen. The step never blocks.
const draft = defineModel<EventDraft>({ required: true })
const blocker = defineModel<string | null>('blocker', { default: null })

const { t } = useI18n()

watchEffect(() => {
  blocker.value = null
})

const options = computed(() => [
  { value: 'admin_pick', label: t('setup.mode.admin.name'), desc: t('setup.mode.admin.desc'), icon: Crown },
  { value: 'lucky_wheel', label: t('setup.mode.wheel.name'), desc: t('setup.mode.wheel.desc'), icon: FerrisWheel },
  { value: 'pick_ban', label: t('setup.mode.pickBan.name'), desc: t('setup.mode.pickBan.desc'), icon: Swords },
  { value: 'losers_pick', label: t('setup.mode.loserPick.name'), desc: t('setup.mode.loserPick.desc'), icon: Hand },
  { value: 'losers_advantage', label: t('setup.mode.loserAdv.name'), desc: t('setup.mode.loserAdv.desc'), icon: Scale },
].map(option => ({ ...option, locked: !(AVAILABLE_SELECTION_MODES as readonly string[]).includes(option.value) })))

function choose(value: string) {
  if (value === 'lucky_wheel' || value === 'admin_pick') draft.value = chooseMode(draft.value, value)
}

const wheel = computed(() => draft.value.settings.selectionMode === 'lucky_wheel')
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <RadioCardGroup
      :model-value="draft.settings.selectionMode"
      :options="options"
      :label="t('setup.mode.title')"
      @update:model-value="choose"
    />
    <p class="m-0 text-[14px] text-pretty text-ink-2">
      {{ t('setup.mode.plannedNote') }}
    </p>

    <div
      v-if="wheel"
      class="flex flex-col gap-3.5 rounded-2xl border-(length:--cp-bw) border-line bg-surface p-4"
    >
      <ToggleSwitch
        :model-value="draft.settings.hiddenWheel"
        :label="t('setup.mode.hideWheel')"
        :help="t('setup.mode.hideWheelHelp')"
        @update:model-value="draft = setHiddenWheel(draft, $event)"
      />
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex min-w-[150px] flex-1 flex-col leading-[1.3]">
          <b>{{ t('setup.mode.vetoes') }}</b>
          <span class="text-[12px] text-ink-2">{{ t('setup.mode.vetoesHelp') }}</span>
        </div>
        <NumberStepper
          :model-value="draft.wheel.vetoAllowance"
          :min="VETO_ALLOWANCE_MIN"
          :max="VETO_ALLOWANCE_MAX"
          :label="t('setup.mode.vetoes')"
          :min-reason="t('setup.mode.vetoesMin')"
          :max-reason="t('setup.mode.vetoesMax')"
          @update:model-value="draft = setVetoAllowance(draft, $event)"
        />
      </div>
    </div>
  </div>
</template>
