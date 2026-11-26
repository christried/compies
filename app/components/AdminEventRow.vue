<script setup lang="ts">
import type { AdminEvent } from '~~/shared/admin'
import { berlinDay } from '~~/shared/time'

// One Event of the Admin page's list (#876, spec #938), in the look of the Archive card (`ArchiveCard`, #882): the name, the Host, the Phase pill, the two counts and the
// dates. A Deleted Event carries „Gelöscht“ with its date. The row is a link only where the entry has an address (the Platform admin is a Member and the Event is not
// deleted); every other row is plain text, with no action (ADR 0006: the page opens no Event the Platform admin could not open before). The link's name is the Event's name
// alone (`aria-labelledby`), as on the Archive card.
const props = defineProps<{ event: AdminEvent }>()

const { t } = useI18n()
const nameId = useId()

const host = computed(() => t('admin.eventHost', { name: props.event.hostName ?? t('admin.notSetUp') }))
const counts = computed(() => `${t('admin.eventMembers', { n: props.event.memberCount }, props.event.memberCount)}, ${t('admin.eventSessions', { n: props.event.sessionCount }, props.event.sessionCount)}`)
const day = (iso: string) => berlinDay(new Date(iso), true)
const dates = computed(() => [
  t('admin.eventCreated', { date: day(props.event.createdAt) }),
  ...(props.event.finishedAt ? [t('admin.eventFinished', { date: day(props.event.finishedAt) })] : []),
].join(', '))

const link = resolveComponent('NuxtLink')
const target = computed(() => props.event.path
  ? { is: link, attrs: { 'to': props.event.path, 'aria-labelledby': nameId, 'class': 'lift focus-visible:focus-ring' } }
  : { is: 'div', attrs: {} })
</script>

<template>
  <li class="m-0 min-w-0 list-none p-0">
    <component
      :is="target.is"
      v-bind="target.attrs"
      class="flex h-full min-w-0 flex-col gap-2.5 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-3.5 text-ink no-underline shadow-sm"
    >
      <div class="flex min-w-0 flex-col gap-0.5">
        <b
          :id="nameId"
          class="text-[16px] leading-[1.3] font-bold text-pretty [overflow-wrap:anywhere]"
        >{{ event.name }}</b>
        <span class="text-[12px] text-ink-2 [overflow-wrap:anywhere]">{{ host }}</span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <PhasePill
          :phase="event.phase"
          size="sm"
        />
        <span
          v-if="event.deletedAt"
          class="inline-flex h-6 items-center rounded-pill border-2 border-line bg-ink px-2 text-[11px] font-extrabold text-paper"
        >{{ t('admin.eventDeleted', { date: day(event.deletedAt) }) }}</span>
        <span class="text-[12px] text-ink-2">{{ counts }}</span>
      </div>

      <span class="text-[12px] text-ink-2">{{ dates }}</span>
    </component>
  </li>
</template>
