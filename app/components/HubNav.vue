<script setup lang="ts">
import { Archive, Gamepad2, House, Shield, User } from '@lucide/vue'
import type { Component } from 'vue'
import { canSeeLibrary } from '~~/shared/game'
import { canSeeAdmin, HUB_SITES, type Viewer } from '~/utils/construction'

// Main navigation: the header nav on desktop, the bottom tab bar (TabBar) below md.
const props = withDefaults(defineProps<{
  layout: 'header' | 'tabs'
  /** Who sees the hidden areas (Bibliothek, Admin); null when signed out. The rules live in construction.ts (Admin) and shared/game.ts (Bibliothek). */
  viewer?: Viewer
}>(), { viewer: null })

const { t } = useI18n()
const route = useRoute()

interface NavItem { key: string, to: string, label: string, icon: Component }

const items = computed<NavItem[]>(() => [
  { key: 'events', to: '/', label: t('nav.events'), icon: House },
  { key: 'archiv', to: '/archiv', label: t('nav.archive'), icon: Archive },
  ...(canSeeLibrary(props.viewer) ? [{ key: 'bibliothek', to: '/bibliothek', label: t('nav.library'), icon: Gamepad2 }] : []),
  { key: 'profil', to: '/profil', label: t('nav.profile'), icon: User },
  ...(canSeeAdmin(props.viewer) ? [{ key: 'admin', to: '/admin', label: t('nav.admin'), icon: Shield }] : []),
])

const current = computed(() => {
  const first = route.path.split('/').filter(Boolean)[0]
  return items.value.find(item => item.key === first)?.key ?? (first ? undefined : 'events')
})
const soon = (key: string) => (HUB_SITES as readonly string[]).includes(key)
</script>

<template>
  <TabBar
    v-if="layout === 'tabs'"
    :label="t('nav.main')"
    :items="items.map(item => ({ ...item, current: item.key === current, description: soon(item.key) ? t('mvp.zone.navMarker') : undefined }))"
  >
    <template #marker="{ item }">
      <NavSoonMarker
        v-if="soon(item.key)"
        class="absolute top-2 left-1/2 ml-1.5"
      />
    </template>
  </TabBar>

  <nav
    v-else
    :aria-label="t('nav.main')"
    class="ml-3.5 flex gap-0.5"
  >
    <NuxtLink
      v-for="item in items"
      :key="item.key"
      :to="item.to"
      :aria-current="item.key === current ? 'page' : undefined"
      :aria-description="soon(item.key) ? t('mvp.zone.navMarker') : undefined"
      class="relative flex h-[61px] items-center gap-1.5 border-b-3 px-[11px] text-[14px] no-underline hover:tint"
      :class="item.key === current ? 'border-hot font-extrabold text-ink' : 'border-transparent font-semibold text-ink-2'"
    >
      <AppIcon
        :icon="item.icon"
        :size="16"
        :offset="item.key === current ? 'var(--cp-hot)' : undefined"
      />
      {{ item.label }}
      <NavSoonMarker v-if="soon(item.key)" />
    </NuxtLink>
  </nav>
</template>
