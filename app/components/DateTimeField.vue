<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import { parseDate } from '@internationalized/date'
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Clock } from '@lucide/vue'
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHead,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarHeader,
  CalendarHeading,
  CalendarNext,
  CalendarPrev,
  CalendarRoot,
  ListboxContent,
  ListboxItem,
  ListboxRoot,
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
} from 'reka-ui'
import type { Ref } from 'vue'
import { joinBerlinLocal, splitBerlinLocal } from '~~/shared/time'

// A Berlin date and time in two own fields (ADR 0010, 02-components § DateTimeField). The value is
// `YYYY-MM-DDTHH:mm` in Europe/Berlin, or empty until both parts are set and valid (ADR 0003).
const props = withDefaults(defineProps<{
  modelValue: string
  /** Accessible name of the group, e.g. the numbered Slot label of the create form. */
  label: string
  error?: string
}>(), { error: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()
const id = useId()
const errorId = `${id}-error`

// Steps of the time list: every 15 minutes, 00:00 to 23:45.
const TIME_STEPS = Array.from({ length: 96 }, (_, step) => formatTime(Math.floor(step / 4), (step % 4) * 15))

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatTime(hours: number, minutes: number) {
  return `${pad(hours)}:${pad(minutes)}`
}

/** `30102090` for `2090-10-30`: the digits the date field keeps. */
function isoToDigits(iso: string) {
  if (!iso) return ''
  const [year = '', month = '', day = ''] = iso.split('-')
  return `${day}${month}${year}`
}

/** The typed digits of a date as far as they go: `30.10.2090`. */
function formatDateDigits(digits: string) {
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('.')
}

/** `YYYY-MM-DD` once all eight digits form a real day, otherwise ''. */
function parseDateDigits(digits: string) {
  if (digits.length !== 8) return ''
  const day = Number(digits.slice(0, 2))
  const month = Number(digits.slice(2, 4))
  const year = Number(digits.slice(4, 8))
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) return ''
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`
}

/** The typed digits of a time as they show: `13`, then `13:0` and `13:00`. A colon after two digits, no reflow. */
function formatTimeDigits(digits: string) {
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

/** `HH:mm` for four digits (HH MM), or '' while incomplete or impossible. */
function parseTimeDigits(digits: string) {
  if (digits.length !== 4) return ''
  const hours = Number(digits.slice(0, 2))
  const minutes = Number(digits.slice(2))
  if (!(hours <= 23 && minutes <= 59)) return ''
  return formatTime(hours, minutes)
}

// Each part keeps its typed digits; its text and its value are derived from them.
const initial = splitBerlinLocal(props.modelValue)
const dateDigits = ref(isoToDigits(initial.date))
const timeDigits = ref(initial.time.replace(':', ''))
const dateText = computed(() => formatDateDigits(dateDigits.value))
const dateValue = computed(() => parseDateDigits(dateDigits.value))
const timeText = computed(() => formatTimeDigits(timeDigits.value))
const timeValue = computed(() => parseTimeDigits(timeDigits.value))
// Invalid once it cannot be completed: an impossible hour (25), or four digits that are no time (2460).
const timeInvalid = computed(() => (timeDigits.value.length === 2 && Number(timeDigits.value) > 23) || (timeDigits.value.length === 4 && !timeValue.value))

function combined() {
  return dateValue.value && timeValue.value ? joinBerlinLocal(dateValue.value, timeValue.value) : ''
}

function onPart() {
  emit('update:modelValue', combined())
}

function onDateInput(event: Event) {
  const input = event.target as HTMLInputElement
  dateDigits.value = input.value.replace(/\D/g, '').slice(0, 8)
  input.value = dateText.value
  onPart()
}

function onTimeInput(event: Event) {
  const input = event.target as HTMLInputElement
  timeDigits.value = input.value.replace(/\D/g, '').slice(0, 4)
  input.value = timeText.value
  onPart()
}

// Leaving the time (blur or Enter) completes it: 9 is 09:00, 15 is 15:00, 153 is 15:30, 930 is 09:30.
// An impossible hour such as 25 stays as typed and invalid.
function commitTime() {
  const digits = timeDigits.value
  if (digits.length === 1 || digits.length === 2) {
    if (Number(digits) > 23) return
    timeDigits.value = `${pad(Number(digits))}00`
  }
  else if (digits.length === 3) {
    timeDigits.value = Number(digits.slice(0, 2)) <= 23 ? `${digits}0` : `0${digits}`
  }
  else {
    return
  }
  onPart()
}

// A value from outside (a reset, or the Slot list changing) replaces what the inputs show.
watch(() => props.modelValue, (value) => {
  if (value === combined()) return
  const parts = splitBerlinLocal(value)
  dateDigits.value = isoToDigits(parts.date)
  timeDigits.value = parts.time.replace(':', '')
})

// The earliest selectable day is today in Berlin, in every date field: the field owns it, so no caller
// has to pass it (ADR 0003, spec #41).
const berlinToday = parseDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date()))
const calendarValue = computed(() => (dateValue.value ? parseDate(dateValue.value) : undefined))
const calendarPlaceholder = computed(() => calendarValue.value ?? berlinToday)

function selectDate(value: DateValue | undefined) {
  if (!value) return
  dateDigits.value = isoToDigits(value.toString())
  dateOpen.value = false
  onPart()
}

function selectTime(value: unknown) {
  if (typeof value !== 'string') return
  timeDigits.value = value.replace(':', '')
  timeOpen.value = false
  onPart()
}

/**
 * The popover of one field (ADR 0010). A click opens it and keeps the focus in the input, so typing goes on;
 * ArrowDown moves the focus into it; Escape or a pick closes it with the focus back in the input; a press or a
 * focus outside it closes it, except inside its own field. Escape stops at the field while the popover is open,
 * so an enclosing dialog stays open (spec #41).
 */
function fieldPopover(open: Ref<boolean>, field: Ref<HTMLElement | null>, input: Ref<HTMLInputElement | null>, panel: Ref<HTMLElement | null>, targets: string[]) {
  let byKey = false
  let dismissed = false

  // The first of the targets that is in the panel takes the focus: the selected item, else the first one.
  function focusPanel() {
    for (const target of targets) {
      const element = panel.value?.querySelector<HTMLElement>(target)
      if (element) {
        element.focus()
        return
      }
    }
  }

  return {
    show(keyboard: boolean) {
      byKey = keyboard
      dismissed = false
      if (open.value && keyboard) focusPanel()
      else open.value = true
    },
    openAutoFocus(event: Event) {
      event.preventDefault()
      if (byKey) focusPanel()
      else input.value?.focus()
    },
    closeAutoFocus(event: Event) {
      event.preventDefault()
      if (!dismissed) input.value?.focus()
    },
    outside(event: Event) {
      if (field.value?.contains(event.target as Node)) event.preventDefault()
      else dismissed = true
    },
    escape(event: KeyboardEvent) {
      if (!open.value) return
      event.stopPropagation()
      open.value = false
    },
  }
}

const dateField = ref<HTMLElement | null>(null)
const dateInput = ref<HTMLInputElement | null>(null)
const datePanel = ref<HTMLElement | null>(null)
const dateOpen = ref(false)
const date = fieldPopover(dateOpen, dateField, dateInput, datePanel, ['[data-selected]', '[tabindex="0"]'])

const timeField = ref<HTMLElement | null>(null)
const timeInput = ref<HTMLInputElement | null>(null)
const timePanel = ref<HTMLElement | null>(null)
const timeOpen = ref(false)
const time = fieldPopover(timeOpen, timeField, timeInput, timePanel, ['[data-state="checked"]', '[role="option"]'])

// The list opens scrolled to the typed time (or the next step), or to 19:00 when the field is empty.
const timeScroll = ref<HTMLElement | null>(null)
watch(timeOpen, async (open) => {
  if (!open) return
  await nextTick()
  const list = timeScroll.value
  if (!list) return
  const [hours = 19, minutes = 0] = (timeValue.value || '19:00').split(':').map(Number)
  const item = list.querySelectorAll<HTMLElement>('[role="option"]')[Math.floor((hours * 60 + minutes) / 15)]
  if (item) list.scrollTop = item.offsetTop - list.clientHeight / 2 + item.offsetHeight / 2
})

function fieldClass(hasError: boolean | undefined) {
  return hasError ? 'border-3 border-error-fg' : 'border-(length:--cp-bw) border-line'
}
</script>

<template>
  <div
    role="group"
    :aria-label="label"
    :aria-describedby="error ? errorId : undefined"
    class="flex flex-col gap-1.5"
  >
    <div class="flex gap-2">
      <PopoverRoot v-model:open="dateOpen">
        <PopoverAnchor as-child>
          <div
            ref="dateField"
            class="relative min-w-0 flex-1"
            @click="date.show(false)"
            @keydown.esc="date.escape"
          >
            <label
              :for="`${id}-date`"
              class="sr-only"
            >{{ t('mvp.create.dateInput') }}</label>
            <input
              :id="`${id}-date`"
              ref="dateInput"
              :value="dateText"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              :placeholder="t('mvp.dateTime.datePlaceholder')"
              :aria-invalid="error ? 'true' : undefined"
              class="hit-44 h-12 min-h-11 w-full rounded-md bg-surface py-0 pr-12 pl-3 text-[17px] font-semibold text-ink"
              :class="fieldClass(!!error)"
              @input="onDateInput"
              @keydown.down.prevent="date.show(true)"
            >
            <button
              type="button"
              class="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center rounded-md text-ink-2"
              :aria-label="t('mvp.dateTime.calendarOpen')"
              :aria-expanded="dateOpen"
              @mousedown.prevent
              @click.stop="date.show($event.detail === 0)"
            >
              <AppIcon
                :icon="CalendarDays"
                :size="20"
              />
            </button>
          </div>
        </PopoverAnchor>
        <PopoverPortal>
          <PopoverContent
            align="start"
            :side-offset="6"
            class="layer-popover outline-memphis max-w-[calc(100vw-2rem)] rounded-lg bg-surface p-1.5 shadow-card"
            @open-auto-focus="date.openAutoFocus"
            @close-auto-focus="date.closeAutoFocus"
            @pointer-down-outside="date.outside"
            @focus-outside="date.outside"
          >
            <div ref="datePanel">
              <CalendarRoot
                v-slot="{ grid, weekDays }"
                :model-value="calendarValue"
                :placeholder="calendarPlaceholder"
                :min-value="berlinToday"
                :week-starts-on="1"
                locale="de-DE"
                @update:model-value="selectDate"
              >
                <CalendarHeader class="flex items-center justify-between">
                  <CalendarPrev
                    class="grid size-11 place-items-center rounded-md text-ink"
                    :aria-label="t('mvp.dateTime.prevMonth')"
                  >
                    <AppIcon
                      :icon="ChevronLeft"
                      :size="18"
                    />
                  </CalendarPrev>
                  <CalendarHeading class="font-bold text-ink" />
                  <CalendarNext
                    class="grid size-11 place-items-center rounded-md text-ink"
                    :aria-label="t('mvp.dateTime.nextMonth')"
                  >
                    <AppIcon
                      :icon="ChevronRight"
                      :size="18"
                    />
                  </CalendarNext>
                </CalendarHeader>
                <div
                  v-for="month in grid"
                  :key="month.value.toString()"
                  class="mt-2"
                >
                  <CalendarGrid class="w-full border-separate border-spacing-0">
                    <CalendarGridHead>
                      <CalendarGridRow>
                        <CalendarHeadCell
                          v-for="day in weekDays"
                          :key="day"
                          class="h-11 w-11 p-0 text-center align-middle text-small font-bold text-ink-2"
                        >
                          {{ day }}
                        </CalendarHeadCell>
                      </CalendarGridRow>
                    </CalendarGridHead>
                    <CalendarGridBody>
                      <CalendarGridRow
                        v-for="(week, index) in month.rows"
                        :key="index"
                      >
                        <CalendarCell
                          v-for="day in week"
                          :key="day.toString()"
                          :date="day"
                          class="p-0"
                        >
                          <CalendarCellTrigger
                            :day="day"
                            :month="month.value"
                            class="grid size-11 place-items-center rounded-md text-ink data-[outside-view]:text-ink-3 data-[disabled]:text-ink-3 data-[disabled]:line-through data-[selected]:bg-ink data-[selected]:text-paper data-[today]:font-bold"
                          />
                        </CalendarCell>
                      </CalendarGridRow>
                    </CalendarGridBody>
                  </CalendarGrid>
                </div>
              </CalendarRoot>
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>

      <PopoverRoot v-model:open="timeOpen">
        <PopoverAnchor as-child>
          <div
            ref="timeField"
            class="relative w-36 flex-none"
            @click="time.show(false)"
            @keydown.esc="time.escape"
          >
            <label
              :for="`${id}-time`"
              class="sr-only"
            >{{ t('mvp.create.timeInput') }}</label>
            <input
              :id="`${id}-time`"
              ref="timeInput"
              :value="timeText"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              :placeholder="t('mvp.dateTime.timePlaceholder')"
              :aria-invalid="error || timeInvalid ? 'true' : undefined"
              class="hit-44 h-12 min-h-11 w-full rounded-md bg-surface py-0 pr-12 pl-3 font-num text-[17px] text-ink"
              :class="fieldClass(!!error || timeInvalid)"
              @input="onTimeInput"
              @blur="commitTime"
              @keydown.enter="commitTime"
              @keydown.down.prevent="time.show(true)"
            >
            <button
              type="button"
              class="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center rounded-md text-ink-2"
              :aria-label="t('mvp.dateTime.timeOpen')"
              :aria-expanded="timeOpen"
              @mousedown.prevent
              @click.stop="time.show($event.detail === 0)"
            >
              <AppIcon
                :icon="Clock"
                :size="18"
              />
            </button>
          </div>
        </PopoverAnchor>
        <PopoverPortal>
          <PopoverContent
            align="end"
            :side-offset="6"
            class="layer-popover outline-memphis w-36 rounded-lg bg-surface p-1.5 shadow-card"
            @open-auto-focus="time.openAutoFocus"
            @close-auto-focus="time.closeAutoFocus"
            @pointer-down-outside="time.outside"
            @focus-outside="time.outside"
          >
            <div ref="timePanel">
              <ListboxRoot
                :model-value="timeValue || undefined"
                @update:model-value="selectTime"
              >
                <ListboxContent>
                  <div
                    ref="timeScroll"
                    class="relative max-h-72 overflow-y-auto p-1.5"
                  >
                    <ListboxItem
                      v-for="step in TIME_STEPS"
                      :key="step"
                      :value="step"
                      :data-time="step"
                      class="flex h-11 cursor-pointer items-center rounded-md px-3 font-num text-[17px] text-ink data-[highlighted]:bg-surface-2 data-[state=checked]:font-bold"
                    >
                      {{ step }}
                    </ListboxItem>
                  </div>
                </ListboxContent>
              </ListboxRoot>
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </div>
    <span
      v-if="error"
      :id="errorId"
      class="flex items-center gap-1.5 text-small font-bold text-error-fg"
    >
      <AppIcon
        :icon="CircleAlert"
        :size="14"
      />
      {{ error }}
    </span>
  </div>
</template>
