<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { shownName } from '~~/shared/auth'
import type { HomeView } from '~~/shared/event'

// Home (screen M1, #12): every Event the User is a Member of, in the order the server sends (open
// polls to vote on, other open polls, Dates upcoming first). Users with the Host permission get „Neue Terminumfrage“.
// The list shows two skeleton cards while it loads, one friendly empty state for new Users (Hosts
// included, #1 story 21) and a generic error with a retry. It refetches on window focus and when the
// tab becomes visible again (ADR 0001), not on a timer.

const { t } = useI18n()
const user = useAuthUser()
const { data, status, error, refresh } = useFetch<HomeView>('/api/e', { key: 'home-events' })

const pending = computed(() => status.value === 'pending')
const events = computed(() => data.value?.events ?? [])
const empty = computed(() => !error.value && !!data.value && events.value.length === 0)

const greetingName = computed(() => (user.value ? shownName(user.value) : ''))
const title = computed(() => t(empty.value ? 'mvp.home.titleEmpty' : 'mvp.home.title'))

useRefreshOnReturn(refresh)
</script>

<template>
  <AppShell kind="hub">
    <div class="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <header class="flex flex-wrap items-end gap-4">
        <div class="flex min-w-[200px] flex-1 flex-col gap-1">
          <span class="text-[13px] font-bold text-ink-2">
            {{ t('mvp.home.hello', { name: greetingName }) }}
          </span>
          <h1 class="m-0 text-[32px] leading-none md:text-[44px]">
            {{ title }}
          </h1>
        </div>
        <AppButton
          v-if="user?.canHost"
          to="/neu"
          size="lg"
          class="aura"
        >
          <template #icon>
            <AppIcon :icon="Plus" />
          </template>
          {{ t('mvp.home.newPoll') }}
        </AppButton>
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

      <section
        v-else-if="pending && !data"
        aria-busy="true"
      >
        <div class="grid grid-cols-1 gap-3.5 min-[600px]:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>

      <EmptyState
        v-else-if="empty"
        :title="t('mvp.home.emptyTitle')"
        :text="t('mvp.home.emptyText')"
      />

      <section
        v-else-if="data"
        class="flex flex-col gap-3"
      >
        <h2 class="m-0 font-display text-[26px] leading-[1.05] font-normal max-sm:text-[22px]">
          {{ t('mvp.home.events') }}
        </h2>
        <ul class="m-0 grid list-none grid-cols-1 gap-3.5 p-0 min-[600px]:grid-cols-2">
          <li
            v-for="event in events"
            :key="event.slug"
            class="min-w-0"
          >
            <HomeEventCard :event="event" />
          </li>
        </ul>
      </section>

      <BaustelleZone
        :title="t('mvp.zone.homeTitle')"
        :text="t('mvp.zone.homeText')"
        compact
      />
    </div>
  </AppShell>
</template>
