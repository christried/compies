<script setup lang="ts">
import { ChevronLeft } from '@lucide/vue'
import { SIGN_IN_PATH } from '~/utils/auth-guard'

// Back link for pages a visitor can reach from inside the app (#32). With in-app history it goes
// back; on a direct visit it goes to sign-in (signed out) or Home (signed in).
const { t } = useI18n()
const router = useRouter()
const user = useAuthUser()
const fallback = computed(() => (user.value ? '/' : SIGN_IN_PATH))

// vue-router keeps the previous in-app path in the history state; it is null on a direct visit.
function onClick(event: MouseEvent, navigate: (event: MouseEvent) => void) {
  if (window.history.state?.back) {
    event.preventDefault()
    router.back()
    return
  }
  navigate(event)
}
</script>

<template>
  <NuxtLink
    v-slot="{ navigate }"
    :to="fallback"
    custom
  >
    <a
      :href="fallback"
      class="inline-flex items-center gap-1 self-start text-small font-bold text-ink-2 no-underline"
      @click="onClick($event, navigate)"
    >
      <AppIcon
        :icon="ChevronLeft"
        :size="14"
      />
      {{ t('common.back') }}
    </a>
  </NuxtLink>
</template>
