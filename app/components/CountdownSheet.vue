<script setup lang="ts">
import { countdownRejection, countdownSeconds } from '~~/shared/countdown'
import type { CountdownView } from '~~/shared/event'

// The Host sets the Countdown (#236, spec #218 § Countdown): the minutes (0 to 99) and seconds (0 to 59) it runs for, 5 s to 99:59.
// The dock's „Countdown“ opens it. While one runs the sheet says so and does not let the Host set another (the server refuses it
// too). Out of range it says so under the fields and sends nothing. The page's dialogs send the length and close the sheet once the
// server took it (EventHostDialogs).
const props = defineProps<{
  open: boolean
  /** True while the request runs. */
  busy: boolean
  /** The Event's Countdown, or null while it has none. */
  countdown: CountdownView | null
  /** The server's clock in epoch ms: whether the Countdown runs is decided against it. */
  serverNow: () => number
}>()

const emit = defineEmits<{ close: [], set: [seconds: number] }>()

const { t } = useI18n()
const minutes = ref('1')
const seconds = ref('0')

// A sheet that opens again starts from one minute.
watch(() => props.open, (open) => {
  if (open) {
    minutes.value = '1'
    seconds.value = '0'
  }
})

/** The length the fields hold in seconds, or null while they hold none that is allowed. */
const length = computed(() => countdownSeconds(minutes.value, seconds.value))

/** Whether a Countdown runs now (countdownRejection `set`, against the server's clock). Read at each render, as the sheet is. */
const running = () => props.countdown !== null && countdownRejection('set', props.countdown, props.serverNow()) === 'countdown_running'

function submit() {
  const total = length.value
  if (total === null || running()) return
  emit('set', total)
}
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('countdown.sheetTitle')"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-2.5">
        <TextField
          v-model="minutes"
          :label="t('countdown.minutes')"
          inputmode="numeric"
          autocomplete="off"
        />
        <TextField
          v-model="seconds"
          :label="t('countdown.seconds')"
          inputmode="numeric"
          autocomplete="off"
        />
      </div>
      <p
        v-if="length === null"
        class="m-0 text-[14px] font-bold text-error-fg"
      >
        {{ t('countdown.range') }}
      </p>
      <p
        v-if="running()"
        class="m-0 text-[14px] text-ink-2"
      >
        {{ t('countdown.running') }}
      </p>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <AppButton
          :disabled="busy || running()"
          @click="submit"
        >
          {{ t('countdown.set') }}
        </AppButton>
      </div>
    </template>
  </AppSheet>
</template>
