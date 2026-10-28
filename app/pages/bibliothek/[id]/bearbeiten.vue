<script setup lang="ts">
import { ChevronLeft, Lock } from '@lucide/vue'
import { apiFailure } from '~/utils/api-error'
import { canSeeLibrary, type GameView } from '~~/shared/game'

// Edit one game of the library (screen 24, `?s=editing`, #142). Only the creator and the Platform admin get the
// form; any other Host reads the reason the detail page gives. A game that does not exist, or a page for Users
// who may not see the library, looks like any missing page. After saving, the game's detail opens.
const { t } = useI18n()
const route = useRoute()
const user = useAuthUser()
const { toast } = useToast()
const viewer = computed(() => canSeeLibrary(user.value))
const id = computed(() => String(route.params.id))

const { data: game, status, error, refresh } = useFetch<GameView>(() => `/api/games/${id.value}`, {
  key: `game-${id.value}`,
  immediate: viewer.value,
})
const missing = computed(() => apiFailure(error.value).status === 404)
useHead({ title: () => game.value?.name ?? t('gameEdit.editKicker') })

async function onSaved(saved: GameView) {
  toast({ tone: 'success', text: t('library.saveDone') })
  await refreshNuxtData(['games', `game-${id.value}`])
  await navigateTo(`/bibliothek/${saved.id}`)
}
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
    no-tabs
  >
    <div class="mx-auto flex w-full max-w-[1040px] flex-col gap-[18px]">
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

      <template v-else-if="game">
        <div class="flex flex-col gap-0.5">
          <span class="text-small font-bold text-ink-2">{{ t('gameEdit.editKicker') }}</span>
          <h1 class="m-0 font-display text-[34px] leading-none md:text-[44px]">
            {{ game.name }}
          </h1>
        </div>

        <GameForm
          v-if="game.canEdit"
          :game="game"
          @saved="onSaved"
        />
        <p
          v-else
          class="m-0 inline-flex items-center gap-1.5 text-[15px] text-ink-2"
        >
          <AppIcon
            :icon="Lock"
            :size="16"
          />
          {{ t('library.editOnlyOwner', { name: game.createdBy.name }) }}
        </p>
      </template>

      <div
        v-else-if="status === 'pending'"
        aria-busy="true"
        :aria-label="t('library.loading')"
      >
        <SkeletonCard />
      </div>
    </div>
  </AppShell>
</template>
