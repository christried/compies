<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { canSeeLibrary } from '~~/shared/game'

// The Game library (screen 23, `?s=lib`, #141, #142): every game, as cards from md up and as rows below. Only Users
// with the Host permission and the Platform admin see it; for everyone else the page looks like any missing one.
// The list, the search and the filters are the game browser's (#173); here its filters live in the address, so reload
// and back keep them.
const { t } = useI18n()
useHead({ title: () => t('nav.library') })
const user = useAuthUser()
const viewer = computed(() => canSeeLibrary(user.value))
const filters = useRouteFilters()
</script>

<template>
  <AppShell
    v-if="!viewer"
    kind="hub"
  >
    <ConstructionPage area="generic" />
  </AppShell>

  <AppShell
    v-else
    kind="hub"
  >
    <div class="mx-auto flex w-full max-w-[1040px] flex-col gap-4">
      <header class="flex flex-wrap items-end gap-3">
        <div class="flex min-w-[200px] flex-1 flex-col gap-0.5">
          <span class="text-small font-bold text-ink-2">{{ t('library.kicker') }}</span>
          <h1 class="m-0 font-display text-[32px] leading-none md:text-[44px]">
            {{ t('library.title') }}
          </h1>
        </div>
        <AppButton
          to="/bibliothek/neu"
          size="lg"
        >
          <template #icon>
            <AppIcon :icon="Plus" />
          </template>
          {{ t('library.create') }}
        </AppButton>
      </header>

      <GameBrowser
        v-model:filters="filters"
        :to="game => `/bibliothek/${game.id}`"
      >
        <template #empty-action>
          <AppButton
            to="/bibliothek/neu"
            size="lg"
          >
            <template #icon>
              <AppIcon :icon="Plus" />
            </template>
            {{ t('library.create') }}
          </AppButton>
        </template>
      </GameBrowser>
    </div>
  </AppShell>
</template>
