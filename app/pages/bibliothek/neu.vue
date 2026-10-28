<script setup lang="ts">
import { canSeeLibrary, type GameView } from '~~/shared/game'

// Create a game (screen 24, `?s=edit`, #141). Only Users with the Host permission and the Platform admin get the
// form; everyone else sees the Construction page, like for any missing route.
const { t } = useI18n()
useHead({ title: () => t('gameEdit.title') })
const user = useAuthUser()
const { toast } = useToast()

async function onSaved(game: GameView) {
  toast({ tone: 'success', text: t('library.saved', { name: game.name }) })
  await refreshGameLibrary()
  await navigateTo(`/bibliothek/${game.id}`)
}
</script>

<template>
  <AppShell
    v-if="!canSeeLibrary(user)"
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
      <div class="flex flex-col gap-0.5">
        <span class="text-small font-bold text-ink-2">{{ t('gameEdit.kicker') }}</span>
        <h1 class="m-0 font-display text-[34px] leading-none md:text-[44px]">
          {{ t('gameEdit.title') }}
        </h1>
      </div>
      <GameForm @saved="onSaved" />
    </div>
  </AppShell>
</template>
