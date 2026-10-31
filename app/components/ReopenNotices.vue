<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'
import { formatSetDay, formatSlotTime } from '~/utils/berlin-time'
import type { EventView } from '~~/shared/event'

// The notice of every Date that was withdrawn, by a Reopen or with a removed Session (#14, #65), and how a Member closes
// one (useReopenNotices). The Event page puts them right under the Head in every state (#166).
const props = defineProps<{ view: Pick<EventView, 'sessions' | 'removedSessions'> }>()

const { t } = useI18n()

/** The withdrawn Date as the notice shows it, in Berlin time. */
function whenOf(iso: string) {
  const instant = new Date(iso)
  return t('mvp.set.dateTime', { date: formatSetDay(instant), time: formatSlotTime(instant) })
}

const noticeSessions = computed(() => [...props.view.sessions, ...props.view.removedSessions])
const { notices, close } = useReopenNotices(noticeSessions)
</script>

<template>
  <NoticeBanner
    v-for="session in notices"
    :key="session.id"
    tone="warning"
    :icon="CircleAlert"
    closable
    @close="close(session)"
  >
    {{ t('mvp.reopen.notice', { when: whenOf(session.previousStartsAt) }) }}
  </NoticeBanner>
</template>
