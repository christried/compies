<script setup lang="ts">
import { CalendarClock, Download, Link as LinkIcon } from '@lucide/vue'
import { formatDateTile, formatSetDay, formatSlotTime } from '~/utils/berlin-time'

// The set Date (02-components § DateSetCard, screen M3 set / sethost). It replaces the Slot cards and the
// matrix for everyone: calendar tile, the full date, and the .ics download. The Host also gets a host
// row under the text. Reschedule (#14 "Verschieben") is emitted here; Reopen and other host actions go
// into the `host-actions` slot, next to "Verschieben" and "Einladen".
const props = defineProps<{
  /** The Date as a UTC ISO instant. */
  startsAt: string
  isHost: boolean
  /** The Members-only .ics endpoint. */
  icsUrl: string
}>()

const emit = defineEmits<{ reschedule: [], invite: [] }>()

const { t } = useI18n()
const instant = computed(() => new Date(props.startsAt))
const tile = computed(() => formatDateTile(instant.value))
const headline = computed(() => t('mvp.set.dateTime', { date: formatSetDay(instant.value), time: formatSlotTime(instant.value) }))
</script>

<template>
  <section class="flex flex-col gap-5 rounded-[20px] border-(length:--cp-bw) border-line bg-surface p-5.5 text-ink shadow-card md:flex-row md:items-center md:p-[22px]">
    <div
      class="grid size-[130px] flex-none place-items-center self-start rounded-[20px] border-(length:--cp-bw) border-line bg-primary text-center text-on-primary shadow-btn"
      aria-hidden="true"
    >
      <span class="flex flex-col items-center gap-1.5 leading-none">
        <span class="text-[14px] font-extrabold uppercase">{{ tile.weekday }}, {{ tile.month }}</span>
        <span class="font-num text-[56px]">{{ tile.day }}</span>
        <span class="font-num text-[18px]">{{ tile.time }}</span>
      </span>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-2.5">
      <time
        :datetime="startsAt"
        class="font-display text-[30px] leading-none"
      >
        {{ headline }}
      </time>
      <p class="m-0 text-pretty text-ink-2">
        {{ t('mvp.poll.setText') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <a
          :href="icsUrl"
          download
          class="outline-memphis hit-44 inline-flex h-12 items-center gap-2 rounded-pill border-(length:--cp-bw) border-line bg-primary px-4.5 font-extrabold whitespace-nowrap text-on-primary no-underline shadow-btn transition-[translate,box-shadow] dur-instant ease-snap hover:-translate-y-0.5 hover:shadow-card active:translate-1 active:shadow-none reduced:hover:translate-y-0 reduced:hover:tint motion-reduce:hover:translate-y-0 motion-reduce:hover:tint"
        >
          <AppIcon
            :icon="Download"
            :size="18"
          />
          {{ t('mvp.set.ics') }}
        </a>
        <template v-if="isHost">
          <AppButton
            variant="secondary"
            @click="emit('reschedule')"
          >
            <AppIcon
              :icon="CalendarClock"
              :size="18"
            />
            {{ t('poll.reschedule') }}
          </AppButton>
          <AppButton
            variant="secondary"
            @click="emit('invite')"
          >
            <AppIcon
              :icon="LinkIcon"
              :size="18"
            />
            {{ t('common.invite') }}
          </AppButton>
          <slot name="host-actions" />
        </template>
      </div>
    </div>
  </section>
</template>
