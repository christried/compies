<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { apiErrorKey } from '~/utils/api-error'
import {
  CLIP_LENGTH_DEFAULT, CLIP_LENGTH_MAX, CLIP_LENGTH_MIN, GAME_NAME_MAX, clipTime, parseClipTime, type GameView,
} from '~~/shared/game'
import { characterCount } from '~~/shared/text'
import { parseYouTubeId } from '~~/shared/youtube'

// Create a game (screen 24, `?s=edit`, #141): name, YouTube link, start and length, with a live preview that
// plays the clip as a Session will. An empty link is fine (a game without a clip); a link that is no
// YouTube link, or that the player cannot play, is „YouTube-Link kaputt“ and blocks saving. The server is the
// final judge. No page chrome, so a sheet can hold it (#146); the two columns follow the width of the
// form itself, not the viewport.
const props = defineProps<{
  /** Prefill (#142 adds the edit mode). */
  game?: GameView
}>()

const emit = defineEmits<{ saved: [game: GameView] }>()

const { t } = useI18n()
const { toast } = useToast()

/** The cropped WebP waiting to be uploaded after the game is saved (#143). */
const image = ref<Blob | null>(null)
const uploadingImage = ref(false)

const name = ref(props.game?.name ?? '')
const link = ref(props.game?.youtubeId ? `https://youtu.be/${props.game.youtubeId}` : '')
const startText = ref(clipTime(props.game?.clipStart ?? 0))
const lengthText = ref(String(props.game?.clipLength ?? CLIP_LENGTH_DEFAULT))
const attempted = ref(false)
const saving = ref(false)
const failure = ref<string | null>(null)
/** What the player reported about the current link. */
const duration = ref<number | null>(null)
const playerFailed = ref(false)

const trimmedName = computed(() => name.value.trim())
const nameTooLong = computed(() => characterCount(trimmedName.value) > GAME_NAME_MAX)
const nameError = computed(() => {
  if (attempted.value && trimmedName.value === '') return t('gameEdit.nameRequired')
  if (nameTooLong.value) return t('error.nameTooLong', { max: GAME_NAME_MAX })
  return undefined
})

const hasLink = computed(() => link.value.trim() !== '')
const youtubeId = computed(() => (hasLink.value ? parseYouTubeId(link.value) : null))
const linkError = computed(() => {
  if (hasLink.value && !youtubeId.value) return t('gameEdit.badLink')
  if (playerFailed.value) return t('gameEdit.linkBroken')
  return undefined
})
const linkHelp = computed(() => (duration.value && !linkError.value
  ? t('gameEdit.linkFound', { duration: clipTime(duration.value) })
  : t('gameEdit.youtubeHelp')))

// A new link starts over: what the player said about the last one no longer counts.
watch(link, () => {
  duration.value = null
  playerFailed.value = false
})

const start = computed(() => parseClipTime(startText.value))
const startError = computed(() => (start.value === null ? t('gameEdit.startInvalid') : undefined))
const length = computed(() => {
  const text = lengthText.value.trim()
  const seconds = /^\d{1,3}$/.test(text) ? Number(text) : NaN
  return seconds >= CLIP_LENGTH_MIN && seconds <= CLIP_LENGTH_MAX ? seconds : null
})
const lengthError = computed(() => (length.value === null ? t('gameEdit.lengthInvalid') : undefined))

/** Why the CTA is blocked, or null when the form can be sent. */
const blocker = computed<string | null>(() => {
  if (trimmedName.value === '') return t('gameEdit.nameRequired')
  if (nameTooLong.value) return t('error.nameTooLong', { max: GAME_NAME_MAX })
  if (linkError.value) return t('gameEdit.linkRequired')
  return startError.value ?? lengthError.value ?? null
})

/**
 * Sends the cropped image once the game exists (#143). A failed upload does not undo the game: it is saved, the
 * Host sees why the image is missing and can add it later.
 */
async function uploadImage(game: GameView): Promise<GameView> {
  if (!image.value) return game
  uploadingImage.value = true
  try {
    return await $fetch<GameView>(`/api/games/${game.id}/image`, {
      method: 'PUT',
      headers: { 'content-type': 'image/webp' },
      body: image.value,
    })
  }
  catch (error) {
    toast({ tone: 'error', text: t('gameEdit.imageUploadFailed', { reason: t(apiErrorKey(error)) }) })
    return game
  }
  finally {
    uploadingImage.value = false
  }
}

async function submit() {
  attempted.value = true
  if (blocker.value || saving.value || start.value === null || length.value === null) return
  saving.value = true
  failure.value = null
  try {
    const game = await $fetch<GameView>('/api/games', {
      method: 'POST',
      body: { name: trimmedName.value, youtubeUrl: link.value.trim(), clipStart: start.value, clipLength: length.value },
    })
    emit('saved', await uploadImage(game))
  }
  catch (error) {
    failure.value = t(apiErrorKey(error))
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <form
    novalidate
    class="@container"
    @submit.prevent="submit"
  >
    <div class="grid grid-cols-1 items-start gap-[18px] @[640px]:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-3.5">
        <TextField
          v-model="name"
          :label="t('gameEdit.name')"
          :error="nameError"
          :maxlength="GAME_NAME_MAX"
        />
        <GameImageField
          v-model="image"
          :image-url="game?.imageUrl"
          :uploading="uploadingImage"
        />
        <TextField
          v-model="link"
          :label="t('gameEdit.youtube')"
          :help="linkHelp"
          :error="linkError"
          type="url"
          inputmode="url"
          autocomplete="off"
        />
        <div class="grid grid-cols-2 gap-2.5">
          <TextField
            v-model="startText"
            :label="t('gameEdit.start')"
            :help="t('gameEdit.startHelp')"
            :error="startError"
            autocomplete="off"
          />
          <TextField
            v-model="lengthText"
            :label="t('gameEdit.length')"
            :help="t('gameEdit.lengthHelp')"
            :error="lengthError"
            inputmode="numeric"
            autocomplete="off"
          />
        </div>
      </div>

      <div class="flex min-w-0 flex-col gap-2.5">
        <h2 class="m-0 text-[16px] font-extrabold">
          {{ t('gameEdit.previewTitle') }}
        </h2>
        <ClipPreview
          v-if="youtubeId && !playerFailed"
          :video-id="youtubeId"
          :start="start ?? 0"
          :length="length ?? CLIP_LENGTH_DEFAULT"
          @duration="seconds => (duration = seconds)"
          @error="playerFailed = true"
        />
        <div
          v-else
          class="grid aspect-video place-items-center rounded-[14px] border-(length:--cp-bw) border-line p-3 shadow-card"
          style="background-image: repeating-linear-gradient(135deg, var(--cp-paper-2) 0 14px, var(--cp-surface) 14px 28px)"
        >
          <span class="rounded-[8px] border-2 border-line bg-surface px-2.5 py-1.5 text-center font-mono text-[12px] font-bold">
            {{ hasLink ? t('gameEdit.noPreview') : t('gameEdit.noClip') }}
          </span>
        </div>

        <p
          v-if="failure"
          role="alert"
          class="m-0 font-bold text-error-fg"
        >
          {{ failure }}
        </p>

        <div class="mt-1.5 flex flex-wrap items-center gap-3">
          <AppButton
            type="submit"
            size="lg"
            :aria-disabled="blocker !== null || saving"
            :aria-describedby="blocker ? 'game-blocker' : undefined"
          >
            {{ saving ? t('gameEdit.saving') : t('library.create') }}
            <AppIcon
              :icon="ChevronRight"
              :size="18"
            />
          </AppButton>
          <span
            v-if="blocker"
            id="game-blocker"
            class="text-small font-bold text-ink-2"
          >{{ blocker }}</span>
        </div>
      </div>
    </div>
  </form>
</template>
