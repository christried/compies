<script setup lang="ts">
import { Archive, Gamepad2, House, Shield, User } from '@lucide/vue'
import type { Component } from 'vue'
import { canSeeLibrary } from '~~/shared/game'
import { canSeeAdmin, HUB_SITES, type Viewer } from '~/utils/construction'

// Main navigation: the header nav on desktop, the bottom tab bar below md.
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
  <nav
    :aria-label="t('nav.main')"
    :class="layout === 'header'
      ? 'ml-3.5 flex gap-0.5'
      : 'grid border-t-(length:--cp-bw) border-line bg-surface px-1 pb-[max(18px,env(safe-area-inset-bottom))]'"
    :style="layout === 'tabs' ? { gridTemplateColumns: `repeat(${items.length}, 1fr)` } : undefined"
  >
    <NuxtLink
      v-for="item in items"
      :key="item.key"
      :to="item.to"
      :aria-current="item.key === current ? 'page' : undefined"
      :aria-description="soon(item.key) ? t('mvp.zone.navMarker') : undefined"
      class="relative flex items-center no-underline"
      :class="[
        layout === 'header'
          ? 'h-[61px] gap-1.5 border-b-3 px-[11px] text-[14px]'
          : '-mt-0.5 h-[58px] flex-col justify-center gap-[3px] border-t-3 text-[11px]',
        item.key === current
          ? ['font-extrabold text-ink', layout === 'header' ? 'border-hot' : 'border-ink']
          : 'border-transparent font-semibold text-ink-2',
        'hover:tint',
      ]"
    >
      <AppIcon
        :icon="item.icon"
        :size="layout === 'header' ? 16 : 22"
        :offset="item.key === current ? 'var(--cp-hot)' : undefined"
      />
      {{ item.label }}
      <NavSoonMarker
        v-if="soon(item.key)"
        :class="layout === 'tabs' && 'absolute top-2 left-1/2 ml-1.5'"
      />
    </NuxtLink>
  </nav>
</template>
