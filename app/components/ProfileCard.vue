<script setup lang="ts">
import { Upload } from '@lucide/vue'
import { DISPLAY_NAME_MAX, shownName } from '~~/shared/auth'

// The card „Profil“ on the Profil page (screen 25, #399): the provider picture with its hint, and renaming
// through the route profile setup uses (the form is useDisplayNameForm's, as at setup). A rename publishes
// nothing; others read the new name at their next load (ADR 0013).

const { t } = useI18n()
const { toast } = useToast()
const user = useAuthUser()
// The guard lets only a User with a Display name in, so shownName is their Display name here.
const saved = computed(() => (user.value ? shownName(user.value) : ''))
const { displayName, missing, canSave, saving, saveFailed, save: saveName } = useDisplayNameForm({ initial: saved.value, saved })

// The upload of the picture (#678): „Hochladen“ opens the hidden file input, as the game form's cover field does.
const input = useTemplateRef<HTMLInputElement>('input')
const { busy, converting, failure, pick } = useProfileImageUpload()
const status = computed(() => {
  if (converting.value) return t('profile.imageConverting')
  return busy.value ? t('profile.imageUploading') : null
})

async function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  await pick(file)
  // The same file chosen again must fire `change` again.
  target.value = ''
}

const save = () => saveName(() => {
  // The trimmed name as stored.
  displayName.value = saved.value
  toast({ tone: 'success', text: t('profile.saved') })
})
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
        <AppButton
          variant="secondary"
          class="mt-1 self-start"
          :aria-disabled="busy || undefined"
          @click="busy || input?.click()"
        >
          <template #icon>
            <AppIcon
              :icon="Upload"
              :size="14"
            />
          </template>
          {{ t('profile.upload') }}
        </AppButton>
        <span
          v-if="status"
          role="status"
          class="text-small font-bold text-ink-2"
        >{{ status }}</span>
      </div>
    </div>
    <NoticeBanner
      v-if="failure"
      tone="critical"
    >
      {{ failure === 'convert' ? t('profile.imageConvertFailed') : t('profile.imageUploadFailed') }}
    </NoticeBanner>

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
        :error="missing ? t('profile.displayNameEmpty') : undefined"
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
      >
        {{ t('common.save') }}
      </AppButton>
    </form>

    <!-- After the form, so the form's text field stays the first input of the card. -->
    <input
      ref="input"
      type="file"
      accept="image/*"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    >
  </section>
</template>
