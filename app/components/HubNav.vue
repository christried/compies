<script setup lang="ts">
import { Archive, Gamepad2, House, Shield, User } from '@lucide/vue'
import type { Component } from 'vue'
import { canSeeLibrary } from '~~/shared/game'
import { canSeeAdmin, HUB_SITES, type Viewer } from '~/utils/construction'
import { phaseWord, type EventContext } from '~/utils/event-page'

// Main navigation: the header nav on desktop, the bottom tab bar (TabBar) below md.
// On the Event page (#426) the header nav stays, with Events current; `context` hangs the Event's name and Phase under that tab.
const props = withDefaults(defineProps<{
  layout: 'header' | 'tabs'
  /** Who sees the hidden areas (Bibliothek, Admin); null when signed out. The rules live in construction.ts (Admin) and shared/game.ts (Bibliothek). */
  viewer?: Viewer
  /** The Event the page shows: a second line under the current Events tab of the header layout. */
  context?: EventContext
}>(), { viewer: null, context: undefined })

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

// An Event's address (/e/<slug>…) belongs to Events: the first segment `e` is no item's key.
const current = computed(() => {
  const first = route.path.split('/').filter(Boolean)[0]
  const area = first === 'e' ? 'events' : first
  return items.value.find(item => item.key === area)?.key ?? (first ? undefined : 'events')
})
const soon = (key: string) => (HUB_SITES as readonly string[]).includes(key)

// The context hangs on the current Events tab of the header, and nowhere else (15-header-eventseite § HubNav).
const withContext = (key: string) => props.layout === 'header' && !!props.context && key === 'events' && key === current.value
const description = computed(() => (props.context ? t('nav.eventContext', { name: props.context.name, phase: phaseWord(props.context.phase, props.context.label, t) }) : ''))
const descId = useId()

// The context tab shrinks with the nav, down to a floor: the first line or the pill, whichever is wider, plus the tab's padding. The name
// counts nothing there, and CSS alone cannot say that and still size the tab to a short name (`min-width: auto` counts the whole name), so the floor is measured.
// Before the first measurement (the server render, a browser without ResizeObserver) the tab has none.
const rowOne = shallowRef<HTMLElement | null>(null)
const pillBox = shallowRef<HTMLElement | null>(null)
const setRowOne = (el: unknown) => (rowOne.value = el instanceof HTMLElement ? el : null)
const setPillBox = (el: unknown) => (pillBox.value = el instanceof HTMLElement ? el : null)
const floor = ref<number>()
let observer: ResizeObserver | undefined

function measure() {
  const link = rowOne.value?.parentElement
  if (!link || !pillBox.value) return
  const { paddingLeft, paddingRight } = getComputedStyle(link)
  floor.value = Math.ceil(Math.max(rowOne.value!.offsetWidth, pillBox.value.offsetWidth) + parseFloat(paddingLeft) + parseFloat(paddingRight))
}

watch([rowOne, pillBox], ([first, pill]) => {
  observer?.disconnect()
  if (!first || !pill) {
    floor.value = undefined
    return
  }
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(measure)
  observer.observe(first)
  observer.observe(pill)
  measure()
}, { flush: 'post' })
onBeforeUnmount(() => observer?.disconnect())

// Row 2 arrives with Events (04-motion: dur-base, ease-out, from 4 px below; no leave), and a change of name or Phase cross-fades (dur-fast).
// Under reduced motion everything appears at once.
const OFF = 'motion-reduce:transition-none reduced:transition-none'
const ENTER = `transition-[opacity,translate] dur-base ease-out ${OFF}`
const FADE = `transition-opacity dur-fast ease-out ${OFF}`
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
    class="ml-3.5 flex min-w-0 gap-0.5"
  >
    <template
      v-for="item in items"
      :key="item.key"
    >
      <NuxtLink
        :to="item.to"
        :aria-current="item.key === current ? 'page' : undefined"
        :aria-description="soon(item.key) ? t('mvp.zone.navMarker') : undefined"
        :aria-describedby="withContext(item.key) ? descId : undefined"
        :style="withContext(item.key) && floor ? { minWidth: `${floor}px` } : undefined"
        class="relative flex h-[61px] border-b-3 px-[11px] text-[14px] no-underline hover:tint"
        :class="[
          item.key === current ? 'border-hot font-extrabold text-ink' : 'border-transparent font-semibold text-ink-2',
          withContext(item.key) ? 'max-w-[200px] flex-col items-start justify-center gap-[3px] min-[64rem]:max-w-[280px] min-[90rem]:max-w-[340px]' : 'flex-none items-center gap-1.5',
        ]"
      >
        <template v-if="withContext(item.key) && context">
          <span
            :ref="setRowOne"
            class="flex items-center gap-1.5 leading-4 whitespace-nowrap"
          >
            <AppIcon
              :icon="item.icon"
              :size="16"
              offset="var(--cp-hot)"
            />
            {{ item.label }}
          </span>
          <Transition
            appear
            :enter-active-class="ENTER"
            enter-from-class="opacity-0 translate-y-1"
          >
            <span
              class="flex max-w-full min-w-0 items-center gap-1.5"
              aria-hidden="true"
            >
              <Transition
                mode="out-in"
                :enter-active-class="FADE"
                :leave-active-class="FADE"
                enter-from-class="opacity-0"
                leave-to-class="opacity-0"
              >
                <span
                  :key="context.name"
                  :title="context.name"
                  class="min-w-0 truncate text-[12px] leading-4 font-semibold text-ink-2"
                >{{ context.name }}</span>
              </Transition>
              <span
                :ref="setPillBox"
                class="flex flex-none"
              >
                <Transition
                  mode="out-in"
                  :enter-active-class="FADE"
                  :leave-active-class="FADE"
                  enter-from-class="opacity-0"
                  leave-to-class="opacity-0"
                >
                  <PhasePill
                    :key="`${context.phase}|${context.label}`"
                    :phase="context.phase"
                    :label="context.label"
                    size="sm"
                  />
                </Transition>
              </span>
            </span>
          </Transition>
        </template>
        <template v-else>
          <AppIcon
            :icon="item.icon"
            :size="16"
            :offset="item.key === current ? 'var(--cp-hot)' : undefined"
          />
          {{ item.label }}
          <NavSoonMarker v-if="soon(item.key)" />
        </template>
      </NuxtLink>
      <span
        v-if="withContext(item.key)"
        :id="descId"
        class="sr-only"
      >{{ description }}</span>
    </template>
  </nav>
</template>
