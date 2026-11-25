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
const { busy, converting, uploading, failure, pick, send } = useProfileImageUpload()
// The removal of the own picture (#911): the link shows only while an upload is there (`hasOwnImage`).
const { removing, failed: removeFailed, remove } = useProfileImageRemove(busy)
const status = computed(() => {
  if (converting.value) return t('profile.imageConverting')
  return busy.value ? t('profile.imageUploading') : null
})

// The crop of the picked file (#910): `picture` is the file with its decoded size and opens the crop in place of the picture row; `blob` is the WebP of
// the crop as it rests, which „Speichern“ sends. Nothing is sent before „Speichern“.
const picture = shallowRef<{ file: File, width: number, height: number } | null>(null)
const blob = shallowRef<Blob | null>(null)
const savingImage = ref(false)
const crop = useTemplateRef('crop')
const uploadButton = useTemplateRef('uploadButton')
const cropTitleId = useId()
const cropBusy = computed(() => savingImage.value || uploading.value)

async function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  // A second pick cannot start while a crop is open.
  if (!file || picture.value) {
    target.value = ''
    return
  }
  const made = await pick(file)
  // The same file chosen again must fire `change` again.
  target.value = ''
  if (!made) return
  picture.value = { file, width: made.width, height: made.height }
  blob.value = made.blob
}

function closeCrop() {
  picture.value = null
  blob.value = null
}

async function saveImage() {
  if (cropBusy.value) return
  savingImage.value = true
  try {
    // The blob sent is the one the crop last made: „Speichern“ never sends the WebP of an older crop.
    await crop.value?.settle()
    const ok = blob.value ? await send(blob.value) : false
    if (!ok) return
    closeCrop()
    await nextTick()
    ;(uploadButton.value?.$el as HTMLElement | undefined)?.focus()
  }
  finally {
    savingImage.value = false
  }
}

function cancelImage() {
  if (cropBusy.value) return
  closeCrop()
  failure.value = null
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

    <div
      v-if="!picture"
      class="flex items-center gap-4"
    >
      <!-- The initial follows the saved name, not the typing. -->
      <UserAvatar
        :name="saved"
        :image="user?.image"
        :size="80"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <b class="text-[14px]">{{ t('profile.avatar') }}</b>
        <span class="text-small text-ink-2">{{ t(user?.hasOwnImage ? 'profile.avatarHelpOwn' : 'profile.avatarHelp') }}</span>
        <AppButton
          ref="uploadButton"
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
        <button
          v-if="user?.hasOwnImage"
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 self-start px-1 text-[13px] font-bold text-ink underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line"
          :aria-disabled="busy || removing || undefined"
          @click="remove"
        >
          {{ t('profile.removeImage') }}
        </button>
        <span
          v-if="status"
          role="status"
          class="text-small font-bold text-ink-2"
        >{{ status }}</span>
      </div>
    </div>
    <!-- The crop replaces the picture row while a file is cropped (#910). The group is named so the crop's „Speichern“ is told from the name form's. -->
    <div
      v-else
      role="group"
      :aria-labelledby="cropTitleId"
      class="flex flex-col gap-3"
    >
      <b
        :id="cropTitleId"
        class="text-[14px]"
      >{{ t('profile.avatar') }}</b>
      <ProfileImageCrop
        ref="crop"
        v-model="blob"
        :picture="picture"
        :locked="cropBusy"
      />
      <span
        v-if="cropBusy"
        role="status"
        class="text-small font-bold text-ink-2"
      >{{ t('profile.imageUploading') }}</span>
      <div class="flex flex-wrap gap-3">
        <AppButton
          variant="secondary"
          type="button"
          :aria-disabled="cropBusy || undefined"
          @click="saveImage"
        >
          {{ t('common.save') }}
        </AppButton>
        <AppButton
          variant="secondary"
          type="button"
          :aria-disabled="cropBusy || undefined"
          @click="cancelImage"
        >
          {{ t('common.cancel') }}
        </AppButton>
      </div>
    </div>
    <NoticeBanner
      v-if="failure"
      tone="critical"
    >
      {{ failure === 'convert' ? t('profile.imageConvertFailed') : t('profile.imageUploadFailed') }}
    </NoticeBanner>
    <NoticeBanner
      v-if="removeFailed"
      tone="critical"
    >
      {{ t('profile.imageRemoveFailed') }}
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
