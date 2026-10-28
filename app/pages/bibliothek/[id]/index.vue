<script setup lang="ts">
import { ChevronLeft, Clock, Gamepad2, Lock, Pencil, Swords, Users } from '@lucide/vue'
import { apiFailure } from '~/utils/api-error'
import { canSeeLibrary, type GameView } from '~~/shared/game'

// One game of the library (screen 23, `?s=detail`, #141, #142): the clip preview from the start second for the
// set length, the facts (player count, Formats, clip length) and who created it. The creator and the Platform
// admin get „Bearbeiten“; everyone else gets the reason instead of a dead button. A game that does not exist
// looks like any missing page; so does the page for Users who may not see the library.
const { t } = useI18n()
const route = useRoute()
const user = useAuthUser()
const viewer = computed(() => canSeeLibrary(user.value))
const id = computed(() => String(route.params.id))

const { data: game, status, error, refresh } = useFetch<GameView>(() => `/api/games/${id.value}`, {
  key: `game-${id.value}`,
  immediate: viewer.value,
})
const missing = computed(() => apiFailure(error.value).status === 404)
useHead({ title: () => game.value?.name ?? t('nav.library') })

// Month and year in Berlin time, like the rest of the app (ADR 0003).
const month = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })
const createdMonth = computed(() => (game.value ? month.format(new Date(game.value.createdAt)) : ''))

// The player count as a fact: „2 bis 10“, „ab 2“, „bis 10“, or „2 Spieler“ for one count (#142).
const players = computed(() => {
  const { playersMin: min, playersMax: max } = game.value ?? { playersMin: null, playersMax: null }
  if (min === null && max === null) return null
  if (min === max) return t('library.players', { n: min })
  if (max === null) return t('library.playersFrom', { min })
  if (min === null) return t('library.playersUpTo', { max })
  return t('library.playersBetween', { min, max })
})
const formats = computed(() => {
  const list = game.value?.formats ?? []
  if (list.length === 0) return null
  return list.length > 1 ? t('library.formatBoth') : t(`library.format.${list[0]}`)
})
</script>

<template>
  <AppShell
    v-if="!viewer || missing"
    kind="hub"
  >
    <ConstructionPage area="generic" />
  </AppShell>

  <AppShell
    v-else
    kind="hub"
  >
    <div class="mx-auto flex w-full max-w-[1040px] flex-col gap-[14px]">
      <NuxtLink
        to="/bibliothek"
        class="inline-flex items-center gap-1 self-start text-small font-bold text-ink-2 no-underline"
      >
        <AppIcon
          :icon="ChevronLeft"
          :size="14"
        />
        {{ t('nav.library') }}
      </NuxtLink>

      <FullScreenState
        v-if="error"
        kind="generic"
      >
        <template #actions>
          <AppButton
            size="lg"
            @click="refresh()"
          >
            {{ t('errorPage.generic.retry') }}
          </AppButton>
        </template>
      </FullScreenState>

      <div
        v-else-if="game"
        class="grid grid-cols-1 items-start gap-[18px] md:grid-cols-2"
      >
        <ClipPreview
          v-if="game.youtubeId"
          :video-id="game.youtubeId"
          :start="game.clipStart"
          :length="game.clipLength"
        />
        <img
          v-else-if="game.imageUrl"
          :src="game.imageUrl"
          alt=""
          class="aspect-video w-full rounded-[16px] border-(length:--cp-bw) border-line object-cover shadow-card"
        >
        <div
          v-else
          data-cover="placeholder"
          class="grid aspect-video place-items-center rounded-[16px] border-(length:--cp-bw) border-line shadow-card"
          style="background-image: repeating-linear-gradient(135deg, var(--cp-paper-2) 0 14px, var(--cp-surface) 14px 28px)"
        >
          <AppIcon
            :icon="Gamepad2"
            :size="48"
            class="text-ink-3"
          />
        </div>

        <div class="flex min-w-0 flex-col gap-3">
          <h1 class="m-0 font-display text-[32px] leading-none text-balance md:text-[44px]">
            {{ game.name }}
          </h1>
          <ul
            v-if="players || formats || game.youtubeId"
            class="m-0 flex list-none flex-wrap gap-2 p-0"
          >
            <li
              v-if="players"
              class="inline-flex h-8 items-center gap-1.5 rounded-pill border-2 border-line bg-surface px-3 text-[13px] font-bold"
            >
              <AppIcon
                :icon="Users"
                :size="14"
              />
              {{ players }}
            </li>
            <li
              v-if="formats"
              class="inline-flex h-8 items-center gap-1.5 rounded-pill border-2 border-line bg-surface px-3 text-[13px] font-bold"
            >
              <AppIcon
                :icon="Swords"
                :size="14"
              />
              {{ formats }}
            </li>
            <li
              v-if="game.youtubeId"
              class="inline-flex h-8 items-center gap-1.5 rounded-pill border-2 border-line bg-surface px-3 text-[13px] font-bold"
            >
              <AppIcon
                :icon="Clock"
                :size="14"
              />
              {{ t('library.clipFact', { n: game.clipLength }) }}
            </li>
          </ul>
          <p class="m-0 text-[13px] text-ink-2">
            {{ t('library.createdBy', { name: game.createdBy.name, month: createdMonth }) }}
          </p>

          <AppButton
            v-if="game.canEdit"
            :to="`/bibliothek/${game.id}/bearbeiten`"
            variant="secondary"
            class="self-start"
          >
            <template #icon>
              <AppIcon
                :icon="Pencil"
                :size="16"
              />
            </template>
            {{ t('library.edit') }}
          </AppButton>
          <p
            v-else
            class="m-0 inline-flex items-center gap-1.5 text-[13px] text-ink-2"
          >
            <AppIcon
              :icon="Lock"
              :size="14"
            />
            {{ t('library.editOnlyOwner', { name: game.createdBy.name }) }}
          </p>
        </div>
      </div>

      <div
        v-else-if="status === 'pending'"
        aria-busy="true"
        :aria-label="t('library.loading')"
        class="grid grid-cols-1 gap-[18px] md:grid-cols-2"
      >
        <SkeletonCard />
      </div>
    </div>
  </AppShell>
</template>
