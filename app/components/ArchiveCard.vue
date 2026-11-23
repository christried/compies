<script setup lang="ts">
import { Crown, Medal, Trophy } from '@lucide/vue'
import { teamName } from '~/utils/board'
import { teamSurfaceStyle, teamVar } from '~/utils/team-style'
import { teamsText } from '~/utils/settings-summary'
import type { ArchiveEntry } from '~~/shared/archive'
import { eventPath } from '~~/shared/links'
import { berlinDay } from '~~/shared/time'

// One finished Event in the Archive (#882, spec #683; artboard „App Ende & Archiv“): the Winner strip or, until the Award ceremony has run, the
// sentence that holds it back (#883), the name, the day it was finished with its games and people, and the viewer's own part in one row of
// pills (rank, Tribüne, Host) and the Format. The whole card is one link to the Event's page, which is the detail (ArchiveDetail is not built).
// Its name is the Event's name alone (`aria-labelledby`), so the other lines do not read as part of it.
// A closed entry carries no `winners` and no `rank` (the server leaves the keys out), so there is nothing here to hide: the strip draws from
// `winners` and the rank pill from `rank`, and the card derives no result of its own.

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
    <div
      v-if="entry.winners?.length"
      class="flex flex-col gap-1.5"
    >
      <div
        v-for="winner in entry.winners"
        :key="winner.position"
        data-part="winner"
        :data-team="winner.position"
        class="flex items-center gap-2.5 rounded-[12px] border-[2.5px] border-line px-2.5 py-2"
        :style="teamSurfaceStyle(winner.position)"
      >
        <TeamMark
          :team="winner.position"
          :size="28"
        />
        <span
          :title="teamName(winner, t)"
          class="min-w-0 truncate rounded-[8px] px-2 py-px font-display text-[17px]"
          :style="{ backgroundColor: teamVar(winner.position), color: teamVar(winner.position, 'ink') }"
        >{{ teamName(winner, t) }}</span>
        <AppIcon
          :icon="Trophy"
          :size="18"
          data-part="trophy"
          class="ml-auto"
        />
      </div>
    </div>
    <p
      v-else-if="!entry.resultOpen"
      data-part="pending"
      class="m-0 rounded-[12px] border-2 border-line-soft bg-paper-2 px-2.5 py-2 text-[13px] text-ink-2"
    >
      {{ t('ceremony.pending.member') }}
    </p>

    <div class="flex min-w-0 flex-col gap-0.5">
      <b
        :id="nameId"
        class="text-[16px] leading-[1.3] font-bold text-pretty [overflow-wrap:anywhere]"
      >{{ entry.name }}</b>
      <span class="text-[12px] text-ink-2">{{ meta }}</span>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span
        v-if="entry.seated && typeof entry.rank === 'number'"
        :class="[PILL, 'bg-primary text-on-primary']"
      >
        <AppIcon
          :icon="Medal"
          :size="12"
        />
        {{ t('archiveList.place', { n: entry.rank }) }}
      </span>
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
