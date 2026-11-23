<script setup lang="ts">
import { archiveChip, filterArchive, type ArchiveChip, type ArchiveView } from '~~/shared/archive'
import { ARCHIVE_KEY } from '~/utils/event-data'
import { CHIP_BUTTON, CHIP_OFF, CHIP_ON } from '~/utils/chip-look'

// The Archive (#882, spec #683): every finished Event the User is a Member of, newest Finish first, as the server sends it. Each card opens the
// Event's own page. The list shows six skeleton cards in the Archive shape while it loads (three on phones, #884), an empty state for a User with no finished Event, and a generic
// error with a retry. It refetches on window focus and when the tab becomes visible again (ADR 0001), not on a timer, and the room is not involved.
// Three chips and a search narrow the list in the browser (#885); they live in the address like the game browser's filters (`useArchiveFilters`), so back from a card keeps them.

const { t } = useI18n()
// The list stays in the page's cache after the page is left (a custom `getCachedData` switches Nuxt's purge on unmount off), so the way back from a
// card shows the list it had and refreshes it behind (#984, #885: „back from an Event to the filtered list“, no skeleton). A first load has none and shows the
// skeleton. The cache is dropped where the list stops being the viewer's: a deleted Event (EventHostDialogs) and a sign-out (useSignOut, signOutOn401).
const nuxtApp = useNuxtApp()
const hydrating = nuxtApp.isHydrating
const { data, status, error, refresh } = useFetch<ArchiveView>('/api/archive', {
  key: ARCHIVE_KEY,
  getCachedData: (key, app, ctx) => (ctx.cause === 'initial' ? app.payload.data[key] : undefined),
})
if (data.value && !hydrating) onMounted(() => void refresh())

const pending = computed(() => status.value === 'pending')
const events = computed(() => data.value?.events ?? [])
const empty = computed(() => !error.value && !!data.value && events.value.length === 0)
// While the first list loads, the field and the chips „Alle“ and „Gewonnen“ hold their places, inert, so the cards do not jump when it arrives (#984).
const loading = computed(() => pending.value && !data.value)
const controls = computed(() => loading.value || (!!data.value && !error.value && events.value.length > 0))

const filters = useArchiveFilters()
// „Als Host“ for a User who hosts none reads as „Alle“ (an old address, a refetch), and the chip is not offered then.
const chip = computed(() => loading.value ? 'all' : archiveChip(filters.value.chip, events.value))
const hosts = computed(() => events.value.some(entry => entry.isHost))
const shown = computed(() => filterArchive(events.value, filters.value))
const search = computed(() => filters.value.q.trim())

const CHIPS = computed<{ chip: ArchiveChip, label: string }[]>(() => [
  { chip: 'all', label: t('archiveList.all') },
  { chip: 'won', label: t('archiveList.won') },
  ...(hosts.value ? [{ chip: 'host' as const, label: t('archiveList.asHost') }] : []),
])

// „Alle zeigen“ keeps the search and leaves the page's DOM (the state it sat in is gone), so the focus goes to the „Alle“ chip, not to the page.
const chipButtons = useTemplateRef<HTMLButtonElement[]>('chips')
async function showAll() {
  filters.value = { ...filters.value, chip: 'all' }
  await nextTick()
  chipButtons.value?.find(button => button.dataset.chip === 'all')?.focus()
}

useRefreshOnReturn(refresh)
</script>

<template>
  <AppShell kind="hub">
    <div class="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <header class="flex items-end gap-3">
        <h1 class="m-0 text-[32px] leading-none md:text-[44px]">
          {{ t('archiveList.title') }}
        </h1>
        <span
          v-if="!error && events.length > 0"
          class="text-[13px] text-ink-2"
        >{{ t('archiveList.count', { n: shown.length }, shown.length) }}</span>
      </header>

      <div
        v-if="controls"
        class="flex flex-wrap items-center gap-2.5"
      >
        <SearchField
          :model-value="loading ? '' : filters.q"
          :disabled="loading"
          :label="t('archiveList.search')"
          :placeholder="t('archiveList.search')"
          @update:model-value="filters = { ...filters, q: $event }"
        />
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="item in CHIPS"
            :key="item.chip"
            ref="chips"
            type="button"
            :data-chip="item.chip"
            :disabled="loading"
            :aria-pressed="chip === item.chip ? 'true' : 'false'"
            :class="[CHIP_BUTTON, chip === item.chip ? CHIP_ON : CHIP_OFF]"
            @click="filters = { ...filters, chip: item.chip }"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

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
        v-else-if="pending && !data"
        class="flex flex-col gap-3"
      >
        <div
          aria-busy="true"
          class="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2 min-[1024px]:grid-cols-3"
        >
          <SkeletonCard
            v-for="n in 6"
            :key="n"
            shape="archive"
            :class="{ 'max-[599px]:hidden': n > 3 }"
          />
        </div>
        <p
          role="status"
          class="m-0 text-center text-[13px] font-bold text-ink-2"
        >
          {{ t('archiveList.loading') }}
        </p>
      </div>

      <EmptyState
        v-else-if="empty"
        :title="t('archiveList.emptyTitle')"
        :text="t('archiveList.emptyText')"
      />

      <EmptyState
        v-else-if="data && shown.length === 0"
        :title="search ? t('archiveList.noMatch', { q: search }) : t('archiveList.noWin')"
        :text="search ? t('archiveList.noMatchText') : undefined"
      >
        <template
          v-if="chip !== 'all'"
          #action
        >
          <AppButton
            variant="secondary"
            @click="showAll"
          >
            {{ t('archiveList.showAll') }}
          </AppButton>
        </template>
      </EmptyState>

      <ul
        v-else-if="data"
        class="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[600px]:grid-cols-2 min-[1024px]:grid-cols-3"
      >
        <li
          v-for="entry in shown"
          :key="entry.slug"
          class="min-w-0"
        >
          <ArchiveCard :entry="entry" />
        </li>
      </ul>
    </div>
  </AppShell>
</template>
