<script setup lang="ts">
import type { AdminView } from '~~/shared/admin'
import { canSeeAdmin } from '~/utils/construction'
import { ADMIN_KEY } from '~/utils/event-data'

// The Admin page (#682, spec #938, screen 26 „Plattform-Admin“): the Platform admin's page, in the hub shell. It reads once on load and again when the Platform
// admin returns to the tab, as Home does (ADR 0001), so a User who just signed in shows up without a reload and the page polls nothing. The sections are components:
// „Nutzer“ (`AdminUsers`). For everyone else the address shows the generic Construction page, as before the page existed, and asks the server for nothing: the
// page's existence is not revealed (spec #938, story 2), and the read answers like a missing route to them anyway.
const { t } = useI18n()
const user = useAuthUser()
const viewer = computed(() => canSeeAdmin(user.value))
useHead({ title: () => (viewer.value ? t('admin.title') : undefined) })
const { data, status, error, refresh } = useFetch<AdminView>('/api/admin', { key: ADMIN_KEY, immediate: viewer.value })

const loading = computed(() => status.value === 'pending' && !data.value)

useRefreshOnReturn(() => viewer.value && refresh())
</script>

<template>
  <AppShell
    v-if="!viewer"
    kind="hub"
  >
    <ConstructionPage area="generic" />
  </AppShell>

  <AppShell
    v-else
    kind="hub"
  >
    <div class="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <h1 class="m-0 text-[32px] leading-none md:text-[44px]">
        {{ t('admin.title') }}
      </h1>

      <FullScreenState
        v-if="error && !data"
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
        v-else-if="loading"
        aria-busy="true"
        class="flex flex-col gap-3"
      >
        <SkeletonCard shape="archive" />
        <SkeletonCard shape="archive" />
      </div>

      <AdminUsers
        v-else-if="data"
        :users="data.users"
        :deleted-users="data.deletedUsers"
        @changed="refresh()"
      />
    </div>
  </AppShell>
</template>
