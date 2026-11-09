<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { SIGN_IN_PATH } from '~/utils/auth-guard'

// Back link for pages a visitor can reach from inside the app (#32). With in-app history it goes
// back; on a direct visit it goes to sign-in (signed out) or Home (signed in). A page that knows where
// it belongs (N2) passes `to` and `label`: the link then always goes there, whichever way the visitor came.
// The look is the hand-off's jump link: 14 / 800 ink, underlined, 44 px tall (#353).
const props = defineProps<{ to?: string, label?: string }>()
const { t } = useI18n()
const router = useRouter()
const user = useAuthUser()
const fallback = computed(() => props.to ?? (user.value ? '/' : SIGN_IN_PATH))

// vue-router keeps the previous in-app path in the history state; it is null on a direct visit.
function onClick(event: MouseEvent, navigate: (event: MouseEvent) => void) {
  if (!props.to && window.history.state?.back) {
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
      class="inline-flex min-h-11 items-center gap-1.5 self-start text-[14px] font-extrabold text-ink underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line focus-visible:focus-ring"
      @click="onClick($event, navigate)"
    >
      <AppIcon
        :icon="ArrowLeft"
        :size="16"
      />
      {{ label ?? t('common.back') }}
    </a>
  </NuxtLink>
</template>
