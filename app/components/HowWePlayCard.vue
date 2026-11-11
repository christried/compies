<script setup lang="ts">
import { EyeOff, Lock, Pencil } from '@lucide/vue'
import { GAME_GRID } from '~/utils/game-grid'
import { summaryRows } from '~/utils/settings-summary'
import type { HostGameFacts, PoolGame, PoolGameFace } from '~~/shared/game'
import { hasWheel, lockedWhenRunning, type EventSettings } from '~~/shared/settings'

// „So wird gespielt“ on the Event page (#148, #166, 11-event-seite § HowWePlayCard): Format, Spiele, Auswahl (with the Vetos
// of a Lucky Wheel) and Punkte of the Event's settings for every Member, and the Game pool below them. `pool` is what the server
// decided this viewer may see (canSeePoolGames): the games, or null: nothing about the pool, not even how many (#222, #225).
// This component shows what it is given and never asks for more. The Host gets the games with the Pool preview off or under
// a Hidden wheel too, with a note that nobody else sees them. A Member's games come as the face (picture, name, players, Suitabilities, Price, #444); the Host's come
// whole. Both show as tiles of picture and name (#435) that open the game dialog: the Host's with its Tags and Notes from `hostGames` (#443), a Member's without them (#444). The pool shows
// what the game carries, so no second check of who looks. The Host can edit the settings for
// as long as the Event allows (`editTo` is the settings page, null when they cannot). From the first Session on, the rows
// of the settings that stay fixed (LOCKED_WHEN_RUNNING) carry a lock, for Members too. Until the first Session starts a Member's Vetos
// row reads „Anzahl erst zum Start“: the server keeps the number from them and says so with `vetoHidden` (#453).
const props = withDefaults(defineProps<{
  settings: EventSettings | null
  /** The Veto allowance is kept from this viewer until the first Session starts (#453): the Vetos row says so instead of a number. */
  vetoHidden?: boolean
  pool: (PoolGame | PoolGameFace)[] | null
  isHost: boolean
  /** The settings page, while the Host can still change the settings; null otherwise. */
  editTo?: string | null
  /** The first Session has started: the rows of LOCKED_WHEN_RUNNING settings carry a lock. */
  locked?: boolean
  /** The Host's name, for the Member who waits for the Event to be set up. */
  hostName?: string
  /** The Tags and Notes of the games, for the Host's game dialog (#443); null for every other Member. */
  hostGames?: Record<string, HostGameFacts> | null
}>(), { vetoHidden: false, editTo: null, locked: false, hostName: '', hostGames: null })

const { t } = useI18n()
const headingId = useId()

// The rows are the ones „Fertig“ shows (summaryRows, #225); a row is fixed once the Event runs when any of its settings is.
const rows = computed(() => (props.settings === null
  ? []
  : summaryRows(props.settings, t, { vetoHidden: props.vetoHidden }).map(row => ({ ...row, locked: props.locked && lockedWhenRunning(row.settings) }))))
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

      <template v-if="pool">
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

        <!-- `min-w-0` (#279): a long game name in a pool bounds its `truncate`, instead of widening the page on a phone. -->
        <div class="flex min-w-0 flex-col gap-3">
          <div class="flex min-w-0 flex-col gap-2">
            <h3 class="m-0 text-[14px] font-extrabold text-ink-2">
              {{ t('howWePlay.mainPool') }}
            </h3>
            <!-- The tiles side by side (#435): GAME_GRID wraps as many as the container fits. -->
            <ul
              v-if="pool.length > 0"
              class="m-0 list-none p-0"
              :class="GAME_GRID"
            >
              <li
                v-for="game in pool"
                :key="game.id"
              >
                <GameTile
                  :game="game"
                  :audience="isHost ? 'host' : 'member'"
                  :facts="hostGames?.[game.id] ?? null"
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
