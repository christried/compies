<script setup lang="ts">
import { filterAdminEvents, type AdminEvent } from '~~/shared/admin'

// The section „Events“ of the Admin page (#876, spec #938): the search field over the Event's name, then a row per Event, Deleted Events included, in the server's order
// (newest first by creation). No chips, no paging, no action on a row. An empty search shows the app's empty state, as „Nutzer“ does; so does a platform with no Event.
const props = defineProps<{ events: AdminEvent[] }>()

const { t } = useI18n()

const query = ref('')
const shown = computed(() => filterAdminEvents(props.events, query.value))
const term = computed(() => query.value.trim())
</script>

<template>
  <section
    aria-labelledby="admin-events-title"
    class="flex flex-col gap-4"
  >
    <h2
      id="admin-events-title"
      class="m-0 font-display text-[26px] leading-none font-normal"
    >
      {{ t('admin.events') }}
    </h2>

    <div class="flex flex-wrap items-center gap-2.5">
      <SearchField
        v-model="query"
        class="max-w-[420px]"
        :label="t('admin.searchEvents')"
        :placeholder="t('admin.searchEvents')"
      />
    </div>

    <EmptyState
      v-if="shown.length === 0 && term === ''"
      :title="t('admin.noEvents')"
    />

    <EmptyState
      v-else-if="shown.length === 0"
      :title="t('admin.noEventMatch', { q: term })"
      :text="t('admin.noMatchText')"
      mood="confused"
    />

    <ul
      v-else
      :aria-label="t('admin.events')"
      class="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2"
    >
      <AdminEventRow
        v-for="(entry, index) in shown"
        :key="index"
        :event="entry"
      />
    </ul>
  </section>
</template>
