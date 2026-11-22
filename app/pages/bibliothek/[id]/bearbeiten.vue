<script setup lang="ts">
import type { GameView } from '~~/shared/game'

// Edit one game of the library (screen 24, `?s=editing`, #142). The library holds only the viewer's own games (#724),
// so every game the route answers gets the form. A game that does not exist, or a page for Users
// who may not see the library, looks like any missing page. After saving, the game's detail opens.
const { t } = useI18n()
const route = useRoute()
const { toast } = useToast()
const id = computed(() => String(route.params.id))

const { viewer, game, status, error, refresh, missing } = useLibraryGame(id)
useHead({ title: () => game.value?.name ?? t('library.edit') })

async function onSaved(saved: GameView) {
  toast({ tone: 'success', text: t('library.saveDone') })
  await Promise.all([refreshGameLibrary(), refreshNuxtData(libraryGameKey(id.value))])
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
      <BackLink
        to="/bibliothek"
        :label="t('nav.library')"
      />

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
          <h1 class="m-0 font-display text-[34px] leading-none md:text-[44px]">
            {{ game.name }}
          </h1>
        </div>

        <GameForm
          :key="game.id"
          :game="game"
          offer-existing
          @use-existing="existing => navigateTo(`/bibliothek/${existing.id}/bearbeiten`)"
          @saved="onSaved"
        />
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
