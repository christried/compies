<script setup lang="ts">
import { Crown } from '@lucide/vue'
import { teamsText } from '~/utils/settings-summary'
import type { ArchiveEntry } from '~~/shared/archive'
import { eventPath } from '~~/shared/links'
import { berlinDay } from '~~/shared/time'

// One finished Event in the Archive (#882, spec #683; artboard „App Ende & Archiv“): the name, the day it was finished with its games and
// people, and the viewer's own part in one row of pills (Host, Tribüne) and the Format. The whole card is one link to the Event's page, which is the detail
// (ArchiveDetail is not built). Its name is the Event's name alone (`aria-labelledby`), so the other lines do not read as part of it.
// Left free for #883: the card's first child (the Winner strip) and the start of the pill row (the viewer's rank, „Tribüne“ in its place).

const props = defineProps<{ entry: ArchiveEntry }>()

const { t } = useI18n()
const nameId = useId()

const meta = computed(() => {
  const games = t('archiveList.games', { n: props.entry.gameCount }, props.entry.gameCount)
  const people = t('archiveList.people', { n: props.entry.memberCount }, props.entry.memberCount)
  return props.entry.finishedAt
    ? t('archiveList.meta', { date: berlinDay(new Date(props.entry.finishedAt), true), games, people })
    : t('archiveList.metaNoDate', { games, people })
})

const PILL = 'inline-flex h-6 items-center gap-1 rounded-pill border-2 border-line px-2 text-[11px] font-extrabold'
</script>

<template>
  <NuxtLink
    :to="eventPath(entry.slug)"
    :aria-labelledby="nameId"
    class="flex h-full min-w-0 flex-col gap-2.5 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-3.5 text-ink no-underline shadow-sm lift focus-visible:focus-ring"
  >
    <div class="flex min-w-0 flex-col gap-0.5">
      <b
        :id="nameId"
        class="text-[16px] leading-[1.3] font-bold text-pretty [overflow-wrap:anywhere]"
      >{{ entry.name }}</b>
      <span class="text-[12px] text-ink-2">{{ meta }}</span>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span
        v-if="!entry.seated"
        :class="PILL"
      >{{ t('board.stands') }}</span>
      <span
        v-if="entry.isHost"
        :class="PILL"
      >
        <AppIcon
          :icon="Crown"
          :size="12"
        />
        {{ t('common.host') }}
      </span>
      <span
        v-if="entry.format"
        class="text-[12px] text-ink-2"
      >{{ teamsText(entry.format, t) }}</span>
    </div>
  </NuxtLink>
</template>
