<script setup lang="ts">
import { ChevronLeft, ChevronRight, CircleHelp } from '@lucide/vue'

// The layout of the guided Event setup (02-components § EventStepper, screen 05). It knows no step: the
// parent says which steps there are (5 now, 8 with the Selection mode and the pools) and which one is
// current, and puts the step's form in the default slot and its explanation in the `info` slot.
// Desktop (md+): step list left (230 px), form centre, info column right (340 px). Phones: a progress bar,
// the info behind an „Info“ button in a bottom sheet, and a sticky footer with Zurück and Weiter.
// A blocked Weiter is aria-disabled with its reason beside it, as on the old create form (#49).
const props = defineProps<{
  steps: { key: string, label: string }[]
  /** Index of the current step. */
  current: number
  /** The highest step index the Host has reached: the steps before it are finished and can be clicked. */
  reached: number
  /** The title of the current step („Wer gegen wen?“). */
  title: string
  /** The info column's and sheet's heading. */
  infoTitle?: string
  nextLabel: string
  /** Why Weiter cannot be used right now, or null. */
  nextBlocked: string | null
  /** The last step is being sent: Weiter waits, without a reason. */
  busy?: boolean
}>()

const emit = defineEmits<{ go: [index: number], next: [], back: [] }>()

const { t } = useI18n()
const heading = useTemplateRef<HTMLElement>('heading')
const infoOpen = ref(false)
const blockedId = useId()

// A step is finished once the Host has been past it; the current one is never a link to itself.
const finishedUpTo = computed(() => Math.max(props.current, props.reached))
const isFinished = (index: number) => index < finishedUpTo.value
const isLink = (index: number) => isFinished(index) && index !== props.current

// Screen readers hear the new step: the heading takes the focus when the step changes (not on first show).
watch(() => props.current, async () => {
  infoOpen.value = false
  await nextTick()
  heading.value?.focus()
})

// Weiter is a submit button, so Enter in a field goes on too.
function next() {
  if (props.nextBlocked !== null || props.busy) return
  emit('next')
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:items-start">
    <nav
      :aria-label="t('stepper.nav')"
      class="hidden flex-none flex-col gap-1 rounded-2xl border-(length:--cp-bw) border-line bg-surface-2 p-4 md:sticky md:top-4 md:flex md:w-[230px]"
    >
      <span class="mx-1.5 mb-3 font-display text-[24px] leading-none">{{ t('stepper.heading') }}</span>
      <ol class="m-0 flex list-none flex-col gap-1 p-0">
        <li
          v-for="(step, index) in steps"
          :key="step.key"
          :aria-current="index === current ? 'step' : undefined"
          class="flex min-h-11 items-center gap-2.5 rounded-xl border-(length:--cp-bw) px-2 text-[14px]"
          :class="index === current ? 'border-line bg-surface font-extrabold' : ['border-transparent font-semibold', index > current && !isFinished(index) ? 'text-ink-2' : '']"
        >
          <component
            :is="isLink(index) ? 'button' : 'span'"
            :type="isLink(index) ? 'button' : undefined"
            class="flex min-h-11 flex-1 items-center gap-2.5 text-left"
            :class="isLink(index) && 'rounded-xl focus-visible:focus-ring'"
            @click="isLink(index) && emit('go', index)"
          >
            <span
              class="grid size-[26px] flex-none place-items-center rounded-pill border-2 border-line text-[12px] font-extrabold"
              :class="isFinished(index) ? 'bg-ink text-paper' : index === current ? 'bg-primary text-on-primary' : 'bg-surface'"
            >
              <template v-if="isFinished(index)">✓</template>
              <template v-else>{{ index + 1 }}</template>
            </span>
            {{ step.label }}
          </component>
        </li>
      </ol>
    </nav>

    <form
      novalidate
      class="flex min-w-0 flex-1 flex-col self-stretch"
      @submit.prevent="next"
    >
      <div class="flex flex-1 flex-col gap-[18px] md:px-3 md:py-2">
        <div
          data-testid="progress"
          aria-hidden="true"
          class="grid gap-1 md:hidden"
          :style="{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }"
        >
          <span
            v-for="(step, index) in steps"
            :key="step.key"
            class="h-2 rounded-pill border-[1.5px] border-line"
            :class="isFinished(index) ? 'bg-ink' : index === current ? 'bg-primary' : 'bg-transparent'"
          />
        </div>

        <div class="flex items-start gap-2">
          <h1
            ref="heading"
            tabindex="-1"
            class="m-0 flex flex-1 flex-col gap-0.5 text-[14px] font-normal outline-none"
          >
            <span class="text-[13px] font-bold text-ink-2">{{ t('stepper.kicker', { n: current + 1, total: steps.length }) }}</span>
            <span class="font-display text-[34px] leading-none md:text-[44px]">{{ title }}</span>
          </h1>
          <IconButton
            v-if="$slots.info"
            :icon="CircleHelp"
            :label="t('stepper.info')"
            class="md:hidden"
            @click="infoOpen = true"
          />
        </div>

        <slot />
      </div>

      <div
        data-testid="stepper-footer"
        class="sticky bottom-0 layer-sticky -mx-3.5 mt-4 flex flex-none items-center justify-between gap-3 border-t-(length:--cp-bw) border-line bg-surface px-3.5 py-3 md:mx-0 md:rounded-2xl md:border-(length:--cp-bw)"
      >
        <AppButton
          v-if="current > 0"
          variant="secondary"
          class="border-transparent shadow-none"
          @click="emit('back')"
        >
          <template #icon>
            <AppIcon
              :icon="ChevronLeft"
              :size="18"
            />
          </template>
          {{ t('stepper.back') }}
        </AppButton>
        <span v-else />
        <div class="flex min-w-0 flex-1 items-center justify-end gap-3">
          <span
            v-if="nextBlocked"
            :id="blockedId"
            class="min-w-0 text-right text-small font-bold text-pretty text-ink-2"
          >{{ nextBlocked }}</span>
          <AppButton
            type="submit"
            size="lg"
            :aria-disabled="nextBlocked !== null || busy ? 'true' : undefined"
            :aria-describedby="nextBlocked ? blockedId : undefined"
          >
            {{ nextLabel }}
            <AppIcon
              :icon="ChevronRight"
              :size="18"
            />
          </AppButton>
        </div>
      </div>
    </form>

    <aside
      v-if="$slots.info"
      :aria-label="t('stepper.infoAside')"
      class="hidden w-[340px] flex-none flex-col gap-3 rounded-2xl border-(length:--cp-bw) border-line bg-surface p-4 md:sticky md:top-4 md:flex"
    >
      <h2
        v-if="infoTitle"
        class="m-0 flex items-center gap-2 font-display text-[22px] leading-[1.1] font-normal"
      >
        <AppIcon
          :icon="CircleHelp"
          :size="18"
        />
        {{ infoTitle }}
      </h2>
      <slot name="info" />
    </aside>

    <AppSheet
      v-if="$slots.info"
      :open="infoOpen"
      :title="infoTitle ?? t('stepper.info')"
      @close="infoOpen = false"
    >
      <slot name="info" />
    </AppSheet>
  </div>
</template>
