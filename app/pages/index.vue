<script setup lang="ts">
import { Plus } from '@lucide/vue'
import type { HomeView } from '~~/shared/session'

// Home (screen M1, #12): every Session the User is a Member of, in the order the server sends (open
// polls to vote on, other open polls, Dates upcoming first). Hosts (canHost) get „Neue Terminumfrage“.
// The list shows two skeleton cards while it loads, an empty state for new Users and a generic error
// with a retry. It refetches on window focus (ADR 0001), not on a timer.

const { t } = useI18n()
const user = useAuthUser()
const { data, status, error, refresh } = useFetch<HomeView>('/api/s', { key: 'home-sessions' })

const pending = computed(() => status.value === 'pending')
const sessions = computed(() => data.value?.sessions ?? [])
const empty = computed(() => !error.value && !!data.value && sessions.value.length === 0)

const greetingName = computed(() => user.value?.displayName ?? user.value?.name ?? '')
const title = computed(() => t(empty.value ? 'mvp.home.titleEmpty' : 'mvp.home.title'))

if (import.meta.client) {
  const onFocus = () => refresh()
  window.addEventListener('focus', onFocus)
  onScopeDispose(() => window.removeEventListener('focus', onFocus))
}
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
        v-else-if="empty && user?.canHost"
        :title="t('empty.homeHost.title')"
        :text="t('empty.homeHost.text')"
      />
      <EmptyState
        v-else-if="empty"
        :title="t('mvp.home.emptyTitle')"
        :text="t('mvp.home.emptyText')"
      />

      <section
        v-else-if="data"
        class="flex flex-col gap-3"
      >
        <h2 class="m-0 text-[20px] leading-none font-bold">
          {{ t('mvp.home.sessions') }}
        </h2>
        <ul class="m-0 grid list-none grid-cols-1 gap-3.5 p-0 min-[600px]:grid-cols-2">
          <li
            v-for="session in sessions"
            :key="session.slug"
            class="min-w-0"
          >
            <HomeSessionCard :session="session" />
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
