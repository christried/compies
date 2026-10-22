<script setup lang="ts">
import { LogOut } from '@lucide/vue'
import { constructionSite } from '~/utils/construction'

// MVP route guard: every path without a page of its own lands here (see utils/construction.ts).
const route = useRoute()
const site = computed(() => constructionSite(route.path))

const { t } = useI18n()
const signOut = useSignOut()
</script>

<template>
  <AppShell :kind="site.shell">
    <ConstructionPage :area="site.area">
      <!-- „Abmelden“ is the only working action on Profil in the MVP. -->
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
