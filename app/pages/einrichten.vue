<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { safeRedirect } from '~/utils/auth-guard'
import { DISPLAY_NAME_MAX, type SavedProfile } from '~~/shared/auth'
import { cutToCharacters } from '~~/shared/text'

// Profile setup (screen 03), once after the first sign-in: the Display name, prefilled from the
// provider. The avatar is the provider image in the MVP; upload arrives with T2b.

const route = useRoute()
const { t } = useI18n()
useHead({ title: () => t('onboarding.title') })
const user = useAuthUser()

const displayName = ref(cutToCharacters(user.value?.name ?? '', DISPLAY_NAME_MAX))
const missing = computed(() => displayName.value.trim() === '')
const saving = ref(false)
const saveFailed = ref(false)
const field = useTemplateRef('field')

async function save() {
  if (missing.value) {
    field.value?.focus()
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

        <TextField
          id="display-name"
          ref="field"
          v-model="displayName"
          :label="t('profile.displayName')"
          :help="missing ? t('onboarding.nameMissing') : t('onboarding.nameHint')"
          :invalid="missing"
          :maxlength="DISPLAY_NAME_MAX"
          cut-at-max
          autocomplete="nickname"
        />

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
