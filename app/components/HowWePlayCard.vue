<script setup lang="ts">
import { EyeOff, Lock, Pencil } from '@lucide/vue'
import { modeText, pointsText, teamsText } from '~/utils/settings-summary'
import type { EventPools } from '~~/shared/event'
import { hasWheel, type EventSettings } from '~~/shared/settings'

// „So wird gespielt“ on the Event page (#148, #166, 11-event-seite § HowWePlayCard): Format, Spiele, Auswahl and Punkte of
// the Event's settings for every Member, and the pools below them. `pools` is what the server decided this viewer may see
// (poolsVisibleTo): the games, or under a Hidden wheel only how many. This component shows what it is given and never asks
// for more. The Host gets the games under a Hidden wheel too, with a note that nobody else sees them. The Host can edit the
// settings until the first Session starts (`editTo` is the settings page, null when they cannot); afterwards they are fixed.
const props = withDefaults(defineProps<{
  settings: EventSettings | null
  pools: EventPools
  isHost: boolean
  /** The settings page, while the Host can still change the settings; null otherwise. */
  editTo?: string | null
  /** The first Session has started: the settings are fixed. */
  locked?: boolean
  /** The Host's name, for the Member who waits for the Event to be set up. */
  hostName?: string
}>(), { editTo: null, locked: false, hostName: '' })

const { t } = useI18n()
const headingId = useId()

const counts = computed(() => (props.pools.hidden
  ? { main: props.pools.mainCount, tiebreaker: props.pools.tiebreakerCount }
  : { main: props.pools.main.length, tiebreaker: props.pools.tiebreaker.length }))

/** „2 Spiele im Spielepool, 1 im Tiebreaker-Pool. …“: the plural follows the Game pool; the Tiebreaker pool is a bare number. */
const hiddenText = computed(() => t('howWePlay.counts', counts.value, counts.value.main))

const rows = computed(() => {
  const settings = props.settings
  if (settings === null) return []
  // Only the Lucky Wheel has vetoes (#145).
  const mode = hasWheel(settings.selectionMode) ? `${modeText(settings, t)}, ${t('howWePlay.vetoes', { n: settings.vetoAllowance ?? 0 }, settings.vetoAllowance ?? 0)}` : modeText(settings, t)
  return [
    { key: 'format', label: t('stepper.summary.format'), value: teamsText(settings, t) },
    { key: 'games', label: t('stepper.summary.gamesLabel'), value: t('stepper.summary.games', { n: settings.gameCount }, settings.gameCount) },
    { key: 'mode', label: t('howWePlay.mode'), value: mode },
    { key: 'points', label: t('stepper.summary.points'), value: pointsText(settings.pointsTable, t) },
  ]
})

const lists = computed(() => (props.pools.hidden
  ? []
  : [
      { key: 'main', title: t('howWePlay.mainPool'), games: props.pools.main },
      { key: 'tiebreaker', title: t('howWePlay.tiebreakerPool'), games: props.pools.tiebreaker },
    ]))
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
        class="outline-memphis -my-2 inline-flex h-11 flex-none items-center gap-1.5 px-1 text-[13px] font-bold text-ink underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line"
      >
        <AppIcon
          :icon="Pencil"
          :size="14"
        />
        {{ t('howWePlay.edit') }}
      </NuxtLink>
      <span
        v-else-if="locked && settings !== null"
        class="inline-flex flex-none items-center gap-1.5 text-[12px] font-bold text-ink-2"
      >
        <AppIcon
          :icon="Lock"
          :size="12"
        />
        {{ t('howWePlay.locked') }}
      </span>
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
          <dd class="m-0 font-bold text-pretty">
            {{ row.value }}
          </dd>
        </div>
      </dl>

      <p
        v-if="pools.hidden"
        class="m-0 text-[14px] text-ink-2"
      >
        {{ hiddenText }}
      </p>

      <template v-else>
        <NoticeBanner
          v-if="isHost && settings.hiddenWheel"
          tone="info"
          :icon="EyeOff"
          host-only
        >
          {{ t('howWePlay.hostOnly') }}
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
