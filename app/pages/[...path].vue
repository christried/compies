<script setup lang="ts">
import { LogOut } from '@lucide/vue'
import { constructionSite, viewerOf } from '~/utils/construction'
import type { HomeSession, HomeView } from '~~/shared/session'

// MVP route guard: every path without a page of its own lands here (see utils/construction.ts).
const route = useRoute()
const user = useAuthUser()
const site = computed(() => constructionSite(route.path, viewerOf(user.value)))

const { t } = useI18n()
const signOut = useSignOut()

// Shares the Home list (same key), so the CTA can point at the User's latest open poll (#12): the
// most recently created one, whatever its place in Home order. ISO strings sort as their times.
const { data: home } = useFetch<HomeView>('/api/s', { key: 'home-sessions' })
const latestPollSlug = computed(() => (home.value?.sessions ?? [])
  .filter(session => session.phase === 'poll')
  .reduce<HomeSession | null>((latest, session) => (!latest || session.createdAt > latest.createdAt ? session : latest), null)
  ?.slug ?? null)
</script>

<template>
  <AppShell :kind="site.shell">
    <ConstructionPage
      :area="site.area"
      :latest-poll-slug="latestPollSlug"
    >
      <!-- Signing out is the only working action on Profil in the MVP. -->
      <template
        v-if="site.area === 'profil'"
        #secondary
      >
        <AppButton
          variant="secondary"
          size="lg"
          @click="signOut"
        >
          <template #icon>
            <AppIcon :icon="LogOut" />
          </template>
          {{ t('mvp.site.profil.logout') }}
        </AppButton>
      </template>
    </ConstructionPage>
  </AppShell>
</template>
