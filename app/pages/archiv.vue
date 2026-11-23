<script setup lang="ts">
import type { ArchiveView } from '~~/shared/archive'
import { ARCHIVE_KEY } from '~/utils/event-data'

// The Archive (#882, spec #683): every finished Event the User is a Member of, newest Finish first, as the server sends it. Each card opens the
// Event's own page. The list shows six skeleton cards in the Archive shape while it loads (three on phones, #884), an empty state for a User with no finished Event, and a generic
// error with a retry. It refetches on window focus and when the tab becomes visible again (ADR 0001), not on a timer, and the room is not involved.

const { t } = useI18n()
const { data, status, error, refresh } = useFetch<ArchiveView>('/api/archive', { key: ARCHIVE_KEY })

const pending = computed(() => status.value === 'pending')
const events = computed(() => data.value?.events ?? [])
const empty = computed(() => !error.value && !!data.value && events.value.length === 0)

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
        >{{ t('archiveList.count', { n: events.length }, events.length) }}</span>
      </header>

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

      <ul
        v-else-if="data"
        class="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[600px]:grid-cols-2 min-[1024px]:grid-cols-3"
      >
        <li
          v-for="entry in events"
          :key="entry.slug"
          class="min-w-0"
        >
          <ArchiveCard :entry="entry" />
        </li>
      </ul>
    </div>
  </AppShell>
</template>
