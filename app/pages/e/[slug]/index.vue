<script setup lang="ts">
import { isInviteLinkPath } from '~/utils/auth-guard'

// `/e/…` carries two links (ADR 0006): the Invite link `/e/<slug>-<token>` goes to InviteEntry (#10), the Event
// link `/e/<slug>` to the Event page.
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const invite = computed(() => isInviteLinkPath(route.path))
</script>

<template>
  <InviteEntry
    v-if="invite"
    :invite="slug"
  />
  <EventPage
    v-else
    :slug="slug"
  />
</template>
