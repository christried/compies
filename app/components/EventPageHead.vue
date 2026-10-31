<script setup lang="ts">
import { ArrowDown, Calendar } from '@lucide/vue'
import { formatSessionWhen, formatSlotTime } from '~/utils/berlin-time'
import type { EventPageState } from '~/utils/event-page'
import { jumpTo, pollHeadingId } from '~/utils/jump'

// The Head of the Event page (#166, 11-event-seite § EventPageHead): the kicker says where the Event stands, the one
// `<h1>` says what is on now, and while another Session still polls a link jumps to that poll. The copy follows the
// page state (eventPageState); the Event's name is in the header, not here.
const props = defineProps<{
  state: EventPageState
  isHost: boolean
}>()

const { t } = useI18n()

const copy = computed(() => {
  const { kind, total, next, running, lastEnded, pollNumber } = props.state
  const single = total === 1
  switch (kind) {
    case 'poll':
      return {
        kicker: single ? t('event.head.poll.kickerSingle') : t('event.head.poll.kicker', { n: pollNumber, total }),
        title: t('event.head.poll.title'),
      }
    case 'teams': {
      const date = formatSessionWhen(new Date(next!.startsAt))
      return {
        kicker: single ? t('event.head.teams.kickerSingle', { date }) : t('event.head.teams.kicker', { n: next!.number, date }),
        title: t('event.head.teams.title'),
      }
    }
    case 'running': {
      const time = formatSlotTime(new Date(running!.startedAt))
      return {
        kicker: single ? t('event.head.running.kickerSingle', { time }) : t('event.head.running.kicker', { n: running!.number, total, time }),
        title: single ? t('event.head.running.titleSingle') : t('event.head.running.title', { n: running!.number }),
      }
    }
    case 'between': {
      const ended = lastEnded?.number ?? null
      return {
        kicker: next
          ? t('event.head.between.kicker', { n: ended, m: next.number, date: formatSessionWhen(new Date(next.startsAt)) })
          : t('event.head.between.kickerPoll', { n: ended, m: pollNumber }),
        title: t('event.head.between.title'),
      }
    }
    case 'done':
      return {
        kicker: single ? t('event.head.done.kickerSingle') : t('event.head.done.kicker', { n: lastEnded?.number ?? total, total }),
        title: t('event.head.done.title'),
      }
    default:
      return {
        kicker: t('event.head.setup.kicker'),
        title: props.isHost ? t('event.head.setup.titleHost') : t('event.head.setup.title'),
      }
  }
})

/** The link to the poll of a Session that still waits for a Date, while the page is about something else (the poll state has the poll on top itself). */
const jump = computed(() => {
  const { kind, pollNumber } = props.state
  if (pollNumber === null || kind === 'poll' || kind === 'setup') return null
  return { label: t('event.head.jumpPoll', { n: pollNumber }), id: pollHeadingId(pollNumber) }
})
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <span class="text-[13px] font-bold text-pretty text-ink-2">{{ copy.kicker }}</span>
    <h1 class="m-0 font-display text-[34px] leading-none font-normal md:text-[44px]">
      {{ copy.title }}
    </h1>
    <a
      v-if="jump"
      :href="`#${jump.id}`"
      class="outline-memphis inline-flex min-h-11 items-center gap-1.5 self-start text-[14px] font-extrabold text-ink underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line"
      @click.prevent="jumpTo(jump.id)"
    >
      <AppIcon
        :icon="Calendar"
        :size="16"
      />
      {{ jump.label }}
      <AppIcon
        :icon="ArrowDown"
        :size="16"
      />
    </a>
  </div>
</template>
