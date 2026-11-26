<script setup lang="ts">
import { filterAdminUsers, type AdminUser, type SavedHostPermission } from '~~/shared/admin'
import { apiErrorKey } from '~/utils/api-error'

// The section „Nutzer“ of the Admin page (#682, spec #938): the search field over the Display name, the rows, the count of Deleted Users below the list and the
// confirmation before the Host permission is taken. Granting is one click; taking asks first and says how many of the User's Events that have not finished stay
// theirs (`openEvents`). A write is `PUT /api/admin/users/:id/host`; `changed` asks the page to read the list again, after a failed write too, so the switch shows what the
// server has. A failed write says so in a toast. Nothing is published (ADR 0013).
const props = defineProps<{ users: AdminUser[], deletedUsers: number }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const { toast } = useToast()

const query = ref('')
const shown = computed(() => filterAdminUsers(props.users, query.value))
const term = computed(() => query.value.trim())

/** The Users whose write is on its way: pressing their switch again waits for it. */
const saving = ref(new Set<string>())
/** The User the confirmation is about, while it is open. */
const revoking = ref<AdminUser | null>(null)

async function save(user: AdminUser, canHost: boolean) {
  if (saving.value.has(user.id)) return
  saving.value = new Set(saving.value).add(user.id)
  try {
    await $fetch<SavedHostPermission>(`/api/admin/users/${user.id}/host`, { method: 'PUT', body: { canHost } })
  }
  catch (failure) {
    toast({ tone: 'error', text: t(apiErrorKey(failure)) })
  }
  finally {
    saving.value = new Set([...saving.value].filter(id => id !== user.id))
    emit('changed')
  }
}

function toggle(user: AdminUser, canHost: boolean) {
  if (canHost) void save(user, true)
  else revoking.value = user
}

async function confirmRevoke() {
  const user = revoking.value
  revoking.value = null
  if (user) await save(user, false)
}

const revokeName = computed(() => revoking.value?.displayName ?? t('admin.revoke.unnamed'))
</script>

<template>
  <section
    aria-labelledby="admin-users-title"
    class="flex flex-col gap-4"
  >
    <h2
      id="admin-users-title"
      class="m-0 font-display text-[26px] leading-none font-normal"
    >
      {{ t('admin.users') }}
    </h2>

    <div class="flex flex-wrap items-center gap-2.5">
      <SearchField
        v-model="query"
        class="max-w-[420px]"
        :label="t('admin.searchUsers')"
        :placeholder="t('admin.searchUsers')"
      />
    </div>

    <EmptyState
      v-if="shown.length === 0"
      :title="t('admin.noMatch', { q: term })"
      :text="t('admin.noMatchText')"
      mood="confused"
    />

    <ul
      v-else
      :aria-label="t('admin.users')"
      class="m-0 flex list-none flex-col overflow-hidden rounded-[14px] border-(length:--cp-bw) border-line bg-surface p-0"
    >
      <AdminUserRow
        v-for="user in shown"
        :key="user.id"
        :user="user"
        @toggle="toggle(user, $event)"
      />
    </ul>

    <p
      v-if="deletedUsers > 0"
      class="m-0 text-[13px] text-ink-2"
    >
      {{ t('admin.deletedUsers', { n: deletedUsers }, deletedUsers) }}
    </p>

    <ConfirmModal
      :open="revoking !== null"
      :title="t('admin.revoke.title', { name: revokeName })"
      :confirm-label="t('admin.revoke.confirm')"
      @confirm="confirmRevoke"
      @cancel="revoking = null"
    >
      <p class="m-0">
        {{ t('admin.revoke.text') }}
      </p>
      <p
        v-if="revoking && revoking.openEvents > 0"
        class="mt-2 mb-0"
      >
        {{ t('admin.revoke.stays', { n: revoking.openEvents }, revoking.openEvents) }}
      </p>
    </ConfirmModal>
  </section>
</template>
