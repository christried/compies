<script setup lang="ts">
import { EyeOff, Lock, Pencil } from '@lucide/vue'
import { summaryRows } from '~/utils/settings-summary'
import type { EventPools } from '~~/shared/event'
import { isFullPoolGame } from '~~/shared/game'
import { hasWheel, lockedWhenRunning, type EventSettings } from '~~/shared/settings'

// „So wird gespielt“ on the Event page (#148, #166, 11-event-seite § HowWePlayCard): Format, Spiele, Auswahl (with the Vetos
// of a Lucky Wheel) and Punkte of the Event's settings for every Member, and the pools below them. `pools` is what the server
// decided this viewer may see (canSeePoolGames): the games, or null: nothing about the pools, not even how many (#222, #225).
// This component shows what it is given and never asks for more. The Host gets the games with the Pool preview off or under
// a Hidden wheel too, with a note that nobody else sees them. A Member's games come as picture and name only; the
// Host's come whole, with the player count on the card and, under a game with notes (#224), a collapsed „Notizen“
// disclosure. Both show from what the game carries, so no second check of who looks. The Host can edit the settings for
// as long as the Event allows (`editTo` is the settings page, null when they cannot). From the first Session on, the rows
// of the settings that stay fixed (LOCKED_WHEN_RUNNING) carry a lock, for Members too.
const props = withDefaults(defineProps<{
  settings: EventSettings | null
  pools: EventPools | null
  isHost: boolean
  /** The settings page, while the Host can still change the settings; null otherwise. */
  editTo?: string | null
  /** The first Session has started: the rows of LOCKED_WHEN_RUNNING settings carry a lock. */
  locked?: boolean
  /** The Host's name, for the Member who waits for the Event to be set up. */
  hostName?: string
}>(), { editTo: null, locked: false, hostName: '' })

const { t } = useI18n()
const headingId = useId()

// The rows are the ones „Fertig“ shows (summaryRows, #225); a row is fixed once the Event runs when any of its settings is.
const rows = computed(() => (props.settings === null
  ? []
  : summaryRows(props.settings, t).map(row => ({ ...row, locked: props.locked && lockedWhenRunning(row.settings) }))))

const lists = computed(() => (props.pools
  ? [
      { key: 'main', title: t('howWePlay.mainPool'), games: props.pools.main },
      { key: 'tiebreaker', title: t('howWePlay.tiebreakerPool'), games: props.pools.tiebreaker },
    ]
  : []))
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="flex flex-col gap-3 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-4 text-ink"
  >
    <div class="flex min-h-7 items-center gap-2.5">
      <h2
        :id="headingId"
        class="m-0 flex-1 text-[18px] font-extrabold"
      >
        {{ t('howWePlay.title') }}
      </h2>
      <NuxtLink
        v-if="editTo"
        :to="editTo"
        class="-my-2 inline-flex h-11 flex-none items-center gap-1.5 px-1 text-[13px] font-bold text-ink underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line"
      >
        <AppIcon
          :icon="Pencil"
          :size="14"
        />
        {{ t('howWePlay.edit') }}
      </NuxtLink>
    </div>

    <p
      v-if="settings === null"
      class="m-0 rounded-[12px] border-2 border-dashed border-line-soft px-3.5 py-3 text-[14px] font-semibold text-pretty text-ink-2"
    >
      {{ isHost ? t('howWePlay.emptyHost') : t('howWePlay.emptyMember', { host: hostName }) }}
    </p>

    <template v-else>
      <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14px] leading-[1.35]">
        <div
          v-for="row in rows"
          :key="row.key"
          class="contents"
        >
          <dt class="font-bold text-ink-2">
            {{ row.label }}
          </dt>
          <dd class="m-0 flex items-start gap-1.5 font-bold text-pretty">
            <span class="min-w-0">{{ row.value }}</span>
            <span
              v-if="row.locked"
              :title="t('howWePlay.locked')"
              class="mt-0.5 inline-flex flex-none text-ink-2"
            >
              <AppIcon
                :icon="Lock"
                :size="14"
              />
              <span class="sr-only">{{ t('howWePlay.locked') }}</span>
            </span>
          </dd>
        </div>
      </dl>

      <template v-if="pools">
        <NoticeBanner
          v-if="isHost && settings.hiddenWheel"
          tone="info"
          :icon="EyeOff"
          host-only
        >
          {{ t('howWePlay.hostOnly') }}
        </NoticeBanner>
        <NoticeBanner
          v-else-if="isHost && !settings.poolPreview"
          tone="info"
          :icon="EyeOff"
          host-only
        >
          {{ t(hasWheel(settings.selectionMode) ? 'howWePlay.previewOffWheel' : 'howWePlay.previewOffPick') }}
        </NoticeBanner>

        <div class="flex flex-col gap-3">
          <div
            v-for="list in lists"
            :key="list.key"
            class="flex min-w-0 flex-col gap-2"
          >
            <h3 class="m-0 text-[14px] font-extrabold text-ink-2">
              {{ list.title }}
            </h3>
            <ul
              v-if="list.games.length > 0"
              class="m-0 flex list-none flex-col gap-2 p-0"
            >
              <li
                v-for="game in list.games"
                :key="game.id"
              >
                <GameCard
                  :game="game"
                  layout="row"
                />
                <GameNotesDisclosure
                  v-if="isFullPoolGame(game) && game.notes"
                  :notes="game.notes"
                />
              </li>
            </ul>
            <p
              v-else
              class="m-0 text-[14px] text-ink-2"
            >
              {{ t('howWePlay.emptyPool') }}
            </p>
          </div>
        </div>
      </template>
    </template>
  </section>
</template>
