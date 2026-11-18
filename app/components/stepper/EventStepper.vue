<script setup lang="ts">
import { ChevronLeft, ChevronRight, CircleHelp } from '@lucide/vue'
import { QuestionMark } from '~/utils/question-mark-icon'

// The layout of the guided Event setup (02-components § EventStepper, screen 05). It knows no step: the
// parent says which steps there are (the wizard's `steps`, 8 on /neu and 6 in the settings editor) and which one is
// current, and puts the step's form in the default slot and its explanation in the `info` slot.
// Desktop (md+): step list left (230 px), form centre, info column right (340 px). Phones: a progress bar,
// the info behind an „Info“ button in a bottom sheet. Zurück and Weiter sit in a pill fixed at the window's bottom,
// its right edge on the form column's, on both (#174, #613). A blocked Weiter is aria-disabled with its reason right above the dock, as on the old create form (#49);
// the reason is red and shows once `reasonShown` says so, which the wizard turns on after a press of the blocked Weiter (#797).
const props = withDefaults(defineProps<{
  steps: { key: string, label: string }[]
  /** Index of the current step. */
  current: number
  /** The highest step index the Host has reached: the steps before it are finished and can be clicked. */
  reached: number
  /** The title of the current step („Wer gegen wen?“). */
  title: string
  /** The step list's heading; `stepper.heading` by default. */
  navTitle?: string
  /** Replaces „Schritt n von m“ above the title (the settings editor, #147); `null` leaves the kicker out (#807). */
  kicker?: string | null
  /** The info column's and sheet's heading. */
  infoTitle?: string
  nextLabel: string
  /** Why Weiter cannot be used right now, or null. */
  nextBlocked: string | null
  /** Whether the reason shows (#797): the wizard turns it on after a press of the blocked Weiter. Weiter stays blocked either way. */
  reasonShown?: boolean
  /** The last step is being sent: Weiter waits, without a reason. */
  busy?: boolean
}>(), { navTitle: undefined, kicker: undefined, infoTitle: undefined, reasonShown: true, busy: false })

const emit = defineEmits<{ go: [index: number], next: [], back: [], blockedPress: [] }>()
const reason = computed(() => (props.reasonShown ? props.nextBlocked : null))

const { t } = useI18n()
const heading = useTemplateRef<HTMLElement>('heading')
const infoOpen = ref(false)
const blockedId = useId()

// A step is finished (✓) once the Host has been past it. Every step up to the highest one reached is a link,
// the current one never to itself, so after going back the Host can jump straight to where they were.
const finishedUpTo = computed(() => Math.max(props.current, props.reached))
const isFinished = (index: number) => index < finishedUpTo.value
const isLink = (index: number) => index <= props.reached && index !== props.current

// Screen readers hear the new step: the heading takes the focus when the step changes (not on first show).
watch(() => props.current, async () => {
  infoOpen.value = false
  await nextTick()
  heading.value?.focus()
})

// While mounted, the page footer leaves room under its links for the fixed pill (#701, PageFooter).
let leavePill: (() => void) | undefined
onMounted(() => {
  leavePill = useStepperPill().attach()
})
onBeforeUnmount(() => {
  leavePill?.()
})

// Weiter is a submit button, so Enter in a field goes on too. A press while it is blocked is the wizard's „submit tried“ (#797).
function next() {
  if (props.busy) return
  if (props.nextBlocked !== null) {
    emit('blockedPress')
    return
  }
  emit('next')
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:items-start">
    <nav
      :aria-label="t('stepper.nav')"
      class="hidden flex-none flex-col gap-1 rounded-2xl border-(length:--cp-bw) border-line bg-surface-2 p-4 md:sticky md:top-4 md:flex md:w-[230px]"
    >
      <span class="mx-1.5 mb-3 font-display text-[24px] leading-none">{{ navTitle ?? t('stepper.heading') }}</span>
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
      <!-- pb-40: room for the fixed pill (16 + 72 px) and a blocked reason of up to three lines, so the last field is never
           under them and the content does not jump when the reason appears (#613). -->
      <div class="flex flex-1 flex-col gap-[18px] pb-40 md:px-3 md:py-2">
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
            <span v-if="kicker !== null" class="text-[13px] font-bold text-ink-2">{{ kicker ?? t('stepper.kicker', { n: current + 1, total: steps.length }) }}</span>
            <span class="font-display text-[34px] leading-none md:text-[44px]">{{ title }}</span>
          </h1>
          <IconButton
            v-if="$slots.info"
            :icon="QuestionMark"
            :label="t('stepper.info')"
            class="md:hidden"
            @click="infoOpen = true"
          />
        </div>

        <slot />
      </div>

      <!-- A dock as wide as its buttons, fixed at the window's bottom on every step, so Weiter keeps one place (#613;
           it sat in a sticky dock before, which only sticks while its natural place is below the window). The anchor
           is a zero-height row at the form's end; the fixed box has no left/right, so it keeps its static position:
           the anchor's right edge, which is the form column's. On a step without the info column the anchor is inset
           by that column (340 px) and the gap (16 px), so Weiter does not move between steps. The blocked reason is
           not in the pill: it sits right above it, capped so a long one stays inside the form. -->
      <div
        class="flex h-0 justify-end"
        :class="!$slots.info && 'md:mr-[356px]'"
      >
        <div class="fixed bottom-4 layer-sticky flex w-fit flex-col items-end gap-2">
          <span
            v-if="reason"
            :id="blockedId"
            class="max-w-80 text-right text-small font-bold text-pretty text-error-fg"
          >{{ reason }}</span>
          <div
            data-testid="stepper-footer"
            class="ml-auto flex w-fit items-center gap-2 rounded-pill border-(length:--cp-bw) border-line bg-surface pt-1.5 pl-1.5 pr-2 pb-2 shadow-card"
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
            <AppButton
              type="submit"
              size="lg"
              :aria-disabled="nextBlocked !== null || busy ? 'true' : undefined"
              :aria-describedby="reason ? blockedId : undefined"
            >
              {{ nextLabel }}
              <AppIcon
                :icon="ChevronRight"
                :size="18"
              />
            </AppButton>
          </div>
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
