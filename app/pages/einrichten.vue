<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { safeRedirect } from '~/utils/auth-guard'
import { DISPLAY_NAME_MAX, type SavedProfile } from '~~/shared/auth'

// Profile setup (screen 03), once after the first sign-in: the Display name, prefilled from the
// provider. The avatar is the provider image in the MVP; upload arrives with T2b.

const route = useRoute()
const { t } = useI18n()
useHead({ title: () => `${t('onboarding.title')} | ${t('app.name')}` })
const user = useAuthUser()

// Counted in characters, as the server does: maxlength would count an emoji as two.
const characters = (value: string) => [...value]
const displayName = ref(characters(user.value?.name ?? '').slice(0, DISPLAY_NAME_MAX).join(''))
watch(displayName, (value) => {
  if (characters(value).length > DISPLAY_NAME_MAX) displayName.value = characters(value).slice(0, DISPLAY_NAME_MAX).join('')
})
const missing = computed(() => displayName.value.trim() === '')
const saving = ref(false)
const saveFailed = ref(false)
const input = useTemplateRef('input')

async function save() {
  if (missing.value) {
    input.value?.focus()
    return
  }
  if (saving.value) return
  saving.value = true
  saveFailed.value = false
  try {
    const response = await $fetch<SavedProfile>('/api/profile/setup', { method: 'POST', body: { displayName: displayName.value } })
    user.value = response.user
    await navigateTo(safeRedirect(route.query.redirect), { replace: true })
  }
  catch {
    saveFailed.value = true
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <AppShell
    kind="bare"
    flush
  >
    <div class="flex flex-1 justify-center md:items-center md:p-8">
      <form
        class="flex w-full max-w-[520px] flex-col gap-[18px] px-[18px] py-5 md:outline-memphis md:rounded-xl md:bg-surface md:p-[26px] md:shadow-card"
        novalidate
        @submit.prevent="save"
      >
        <div class="flex items-start gap-3">
          <div class="flex flex-1 flex-col gap-1">
            <span class="text-small font-bold text-ink-2">{{ t('onboarding.kicker') }}</span>
            <h1 class="m-0 text-[34px] leading-none">
              {{ t('onboarding.title') }}
            </h1>
          </div>
          <div
            class="w-16 flex-none"
            aria-hidden="true"
          >
            <Compibert variant="head" />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <b class="text-[14px]">{{ t('profile.avatar') }}</b>
          <div class="flex items-center gap-3.5">
            <UserAvatar
              :name="displayName || '?'"
              :image="user?.image"
              :size="64"
            />
            <span class="text-small text-ink-2">{{ t('onboarding.avatarHint') }}</span>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label
            for="display-name"
            class="text-[14px] font-bold"
          >{{ t('profile.displayName') }}</label>
          <input
            id="display-name"
            ref="input"
            v-model="displayName"
            type="text"
            autocomplete="nickname"
            :aria-invalid="missing"
            aria-describedby="display-name-help"
            class="h-control-lg rounded-md bg-surface px-3.5 text-[17px] text-ink"
            :class="missing ? 'border-3 border-error-fg' : 'border-(length:--cp-bw) border-line'"
          >
          <div class="flex gap-3 text-small">
            <span
              id="display-name-help"
              class="flex-1"
              :class="missing ? 'font-bold text-error-fg' : 'text-ink-2'"
              :aria-live="missing ? 'polite' : undefined"
            >{{ missing ? t('onboarding.nameMissing') : t('onboarding.nameHint') }}</span>
            <span
              class="font-mono text-ink-2"
              aria-hidden="true"
            >{{ t('common.counter', { n: characters(displayName).length, max: DISPLAY_NAME_MAX }) }}</span>
          </div>
        </div>

        <p
          v-if="saveFailed"
          role="alert"
          class="m-0 text-[14px] font-bold text-error-fg"
        >
          {{ t('onboarding.saveFailed') }}
        </p>

        <AppButton
          type="submit"
          size="lg"
          class="w-full"
          :aria-disabled="missing || saving"
          :aria-describedby="missing ? 'display-name-help' : undefined"
        >
          {{ t('onboarding.go') }}
          <AppIcon :icon="ChevronRight" />
        </AppButton>
      </form>
    </div>
  </AppShell>
</template>
