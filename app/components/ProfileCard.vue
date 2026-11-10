<script setup lang="ts">
import { DISPLAY_NAME_MAX, parseDisplayName, shownName, type SavedProfile } from '~~/shared/auth'

// The card „Profil“ on the Profil page (screen 25, #399): the provider picture with its hint, and renaming
// through the route profile setup uses. A rename publishes nothing; others read the new name at their next
// load (ADR 0013).

const { t } = useI18n()
const { toast } = useToast()
const user = useAuthUser()
// The guard lets only a User with a Display name in, so shownName is their Display name here.
const saved = computed(() => (user.value ? shownName(user.value) : ''))
const displayName = ref(saved.value)
const missing = computed(() => displayName.value.trim() === '')
const parsed = computed(() => parseDisplayName(displayName.value))
// Active only for a valid name that differs from the saved one after trimming (#399).
const canSave = computed(() => parsed.value !== null && parsed.value !== saved.value)
const saving = ref(false)
const saveFailed = ref(false)
const field = useTemplateRef('field')

async function save() {
  if (missing.value) {
    field.value?.focus()
    return
  }
  if (!canSave.value || saving.value) return
  saving.value = true
  saveFailed.value = false
  try {
    const response = await $fetch<SavedProfile>('/api/profile/setup', { method: 'POST', body: { displayName: displayName.value } })
    user.value = response.user
    // The trimmed name as stored.
    displayName.value = shownName(response.user)
    toast({ tone: 'success', text: t('profile.saved') })
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
  <section
    aria-labelledby="profile-card-title"
    class="outline-memphis flex flex-col gap-4 rounded-xl bg-surface p-[18px] shadow-card"
  >
    <h2
      id="profile-card-title"
      class="m-0 text-[20px]"
    >
      {{ t('profile.title') }}
    </h2>

    <div class="flex items-center gap-4">
      <!-- The initial follows the saved name, not the typing. -->
      <UserAvatar
        :name="saved"
        :image="user?.image"
        :size="80"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <b class="text-[14px]">{{ t('profile.avatar') }}</b>
        <span class="text-small text-ink-2">{{ t('profile.avatarHelp') }}</span>
      </div>
    </div>

    <form
      novalidate
      class="flex flex-col gap-3"
      @submit.prevent="save"
    >
      <TextField
        id="display-name"
        ref="field"
        v-model="displayName"
        :label="t('profile.displayName')"
        :help="missing ? t('profile.displayNameEmpty') : t('profile.displayNameHelp')"
        :invalid="missing"
        :maxlength="DISPLAY_NAME_MAX"
        cut-at-max
        autocomplete="nickname"
      />

      <NoticeBanner
        v-if="saveFailed"
        tone="critical"
      >
        {{ t('profile.saveFailed') }}
      </NoticeBanner>

      <AppButton
        type="submit"
        size="lg"
        class="self-start"
        :aria-disabled="!canSave || saving"
        :aria-describedby="missing ? 'display-name-help' : undefined"
      >
        {{ t('common.save') }}
      </AppButton>
    </form>
  </section>
</template>
