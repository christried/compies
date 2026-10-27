<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import { formatSlotDay } from '~/utils/berlin-time'
import { calendarLinks } from '~~/shared/calendar-links'
import type { DatedSessionView, EventView } from '~~/shared/event'
import { eventPath } from '~~/shared/links'

// The sheet behind „In den Kalender“ (#81, 02-components § CalendarSheet). No website can tell which calendar a
// Member uses, so they pick it here: Google and Outlook open a new, pre-filled event in a new tab, and the calendar
// file is today's download. With one dated Session that is three buttons. With several, the file adds every Date at
// once, then each Session gets a row with Google and Outlook, since those take one event per link. Title and
// description are the calendar file's own copy (mvp.ics), with the number the server shows (#70).
const props = defineProps<{
  open: boolean
  view: EventView
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const rowId = useId()
const origin = useRequestURL().origin

const fileUrl = computed(() => `/api/e/${props.view.event.slug}/ics`)

/** One entry per dated Session, in Date order, with its Google and Outlook addresses. */
const entries = computed(() => {
  const event = props.view.event.name
  const description = t('mvp.ics.description', { url: `${origin}${eventPath(props.view.event.slug)}` })
  return props.view.sessions
    .filter((session): session is DatedSessionView => session.startsAt !== null)
    .map((session) => {
      const startsAt = new Date(session.startsAt)
      const title = session.number === null
        ? t('mvp.ics.summary', { event })
        : t('mvp.ics.sessionSummary', { event, n: session.number })
      return {
        id: session.id,
        label: t('mvp.calendar.session', { n: session.number ?? 1, day: formatSlotDay(startsAt) }),
        ...calendarLinks({ title, description, startsAt }),
      }
    })
})
</script>

<template>
  <AppSheet
    :open="open && entries.length > 0"
    :title="t('mvp.calendar.title')"
    @close="emit('close')"
  >
    <template v-if="entries.length === 1">
      <AppButton
        variant="secondary"
        size="card"
        :to="entries[0]!.google"
        target="_blank"
      >
        {{ t('mvp.calendar.google') }}
        <AppIcon
          :icon="ExternalLink"
          :size="16"
        />
      </AppButton>
      <AppButton
        variant="secondary"
        size="card"
        :to="entries[0]!.outlook"
        target="_blank"
      >
        {{ t('mvp.calendar.outlook') }}
        <AppIcon
          :icon="ExternalLink"
          :size="16"
        />
      </AppButton>
      <AppButton
        variant="secondary"
        size="card"
        :to="fileUrl"
        external
        download
      >
        {{ t('mvp.calendar.file') }}
      </AppButton>
    </template>

    <template v-else>
      <AppButton
        variant="secondary"
        size="card"
        :to="fileUrl"
        external
        download
      >
        {{ t('mvp.calendar.fileAll') }}
      </AppButton>
      <div
        v-for="entry in entries"
        :key="entry.id"
        role="group"
        :aria-labelledby="`${rowId}-${entry.id}`"
        class="flex flex-col gap-2 rounded-xl border-(length:--cp-bw) border-line bg-surface p-3"
      >
        <span
          :id="`${rowId}-${entry.id}`"
          class="text-body font-extrabold"
        >{{ entry.label }}</span>
        <div class="flex flex-wrap gap-2">
          <AppButton
            variant="secondary"
            size="card"
            class="flex-1"
            :to="entry.google"
            target="_blank"
          >
            {{ t('mvp.calendar.googleShort') }}
            <AppIcon
              :icon="ExternalLink"
              :size="16"
            />
          </AppButton>
          <AppButton
            variant="secondary"
            size="card"
            class="flex-1"
            :to="entry.outlook"
            target="_blank"
          >
            {{ t('mvp.calendar.outlook') }}
            <AppIcon
              :icon="ExternalLink"
              :size="16"
            />
          </AppButton>
        </div>
      </div>
    </template>
  </AppSheet>
</template>
