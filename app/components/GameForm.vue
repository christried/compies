<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { apiErrorKey } from '~/utils/api-error'
import {
  CLIP_LENGTH_DEFAULT, CLIP_LENGTH_MAX, GAME_NAME_MAX, SUITABILITIES, clipTime, gameNameProblem, parseClipLength, parseClipTime, parseGameInput, parsePlayerCount,
  type GameView, type Suitability,
} from '~~/shared/game'
import { parseYouTubeId } from '~~/shared/youtube'

// Create or edit a game (screen 24, `?s=edit`, #141, #142, #171): name, YouTube link, start and length, with a live
// preview that plays the clip as a Session will, and the recommended player count and „Passt zu“ (the
// Suitabilities). An empty link is fine (a game without a clip); a link that is no YouTube link, or that the
// player cannot play, is „YouTube-Link kaputt“ and blocks saving. With `game` the form edits that game (PATCH).
// The rules come from shared/game.ts, the same ones the server applies, so the form refuses what the server
// refuses (#171). No page chrome, so a sheet can hold it (#146); the two columns follow the width of the
// form itself, not the viewport.
const props = defineProps<{
  /** The game to edit (#142); without it the form creates one. */
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
const playersFromText = ref(props.game?.playersMin == null ? '' : String(props.game.playersMin))
const playersToText = ref(props.game?.playersMax == null ? '' : String(props.game.playersMax))
const suitabilities = ref<Suitability[]>([...(props.game?.suitabilities ?? [])])
const attempted = ref(false)
const saving = ref(false)
const failure = ref<string | null>(null)
/** What the player reported about the current link. */
const duration = ref<number | null>(null)
const playerFailed = ref(false)

// The name rule is the shared one (gameNameProblem); the form only words it.
const nameProblem = computed(() => gameNameProblem(name.value))
const nameError = computed(() => {
  if (attempted.value && nameProblem.value === 'empty') return t('gameEdit.nameRequired')
  if (nameProblem.value === 'too_long') return t('error.nameTooLong', { max: GAME_NAME_MAX })
  return undefined
})

const hasLink = computed(() => link.value.trim() !== '')
const youtubeId = computed(() => (hasLink.value ? parseYouTubeId(link.value) : null))
const linkError = computed(() => {
  if (hasLink.value && !youtubeId.value) return t('gameEdit.badLink')
  if (playerFailed.value) return t('gameEdit.linkBroken')
  return undefined
})
// Only the found-video note is help; the link has no hint of its own (#176). An error replaces the help.
const linkHelp = computed(() => (duration.value && !linkError.value
  ? t('gameEdit.linkFound', { duration: clipTime(duration.value) })
  : undefined))

// A new link starts over: what the player said about the last one no longer counts.
watch(link, () => {
  duration.value = null
  playerFailed.value = false
})

const start = computed(() => parseClipTime(startText.value))
const startError = computed(() => (start.value === null ? t('gameEdit.startInvalid') : undefined))
const length = computed(() => parseClipLength(lengthText.value))
const lengthError = computed(() => (length.value === null ? t('gameEdit.lengthInvalid') : undefined))

// The player count: both bounds optional; an empty field is open, anything that is no whole number from 1 to 99,
// or a minimum above the maximum, is invalid (#142). The server checks the same rule.
const fromInvalid = computed(() => playersFromText.value.trim() !== '' && parsePlayerCount(playersFromText.value) === null)
const toInvalid = computed(() => playersToText.value.trim() !== '' && parsePlayerCount(playersToText.value) === null)
const rangeInverted = computed(() => {
  const min = parsePlayerCount(playersFromText.value)
  const max = parsePlayerCount(playersToText.value)
  return min !== null && max !== null && min > max
})
const fromError = computed(() => (fromInvalid.value ? t('error.playersInvalid') : undefined))
const toError = computed(() => (toInvalid.value || rangeInverted.value ? t('error.playersInvalid') : undefined))

/** Why the CTA is blocked, in the words of the field that is wrong, or null when no field is. */
const blocker = computed<string | null>(() => {
  if (nameProblem.value === 'empty') return t('gameEdit.nameRequired')
  if (nameProblem.value === 'too_long') return t('error.nameTooLong', { max: GAME_NAME_MAX })
  if (linkError.value) return t('gameEdit.linkRequired')
  if (fromError.value || toError.value) return t('error.playersInvalid')
  return startError.value ?? lengthError.value ?? null
})

/** A player count field as the shared rules read it: its number, nothing, or the text itself when that is no count, so the rules refuse it too. */
function countOf(text: string): number | string | null {
  if (text.trim() === '') return null
  return parsePlayerCount(text) ?? text
}

/** The body the form sends, as the shared rules read it (#171). A field the User left invalid stays as its text, so the rules refuse it. */
const draft = computed(() => ({
  name: name.value.trim(),
  youtubeUrl: link.value.trim(),
  clipStart: start.value ?? startText.value,
  clipLength: length.value ?? lengthText.value,
  playersMin: countOf(playersFromText.value),
  playersMax: countOf(playersToText.value),
  suitabilities: SUITABILITIES.filter(suitability => suitabilities.value.includes(suitability)),
}))

/** The form is blocked exactly when a field says why, or the shared rules refuse the body, or the player reported the link broken (#171). */
const blocked = computed(() => blocker.value !== null || !parseGameInput(draft.value).ok)

function toggleSuitability(suitability: Suitability) {
  // Kept in SUITABILITIES order, like the server stores them.
  suitabilities.value = SUITABILITIES.filter(option => (option === suitability ? !suitabilities.value.includes(option) : suitabilities.value.includes(option)))
}

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
  if (blocked.value || saving.value) return
  saving.value = true
  failure.value = null
  const body = draft.value
  try {
    // An image picked while editing is uploaded too, once the game has been saved (#143).
    const game = props.game
      ? await $fetch<GameView>(`/api/games/${props.game.id}`, { method: 'PATCH', body })
      : await $fetch<GameView>('/api/games', { method: 'POST', body })
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
            :error="startError"
            autocomplete="off"
          />
          <TextField
            v-model="lengthText"
            :label="t('gameEdit.length')"
            :help="lengthError ? undefined : t('gameEdit.lengthMax', { max: CLIP_LENGTH_MAX })"
            :error="lengthError"
            inputmode="numeric"
            autocomplete="off"
          />
        </div>

        <fieldset class="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
          <legend class="mb-1.5 text-[14px] font-bold">
            {{ t('gameEdit.players') }}
          </legend>
          <div class="grid grid-cols-2 gap-2.5">
            <TextField
              v-model="playersFromText"
              :label="t('gameEdit.playersFrom')"
              :error="fromError"
              inputmode="numeric"
              autocomplete="off"
            />
            <TextField
              v-model="playersToText"
              :label="t('gameEdit.playersTo')"
              :error="toError"
              inputmode="numeric"
              autocomplete="off"
            />
          </div>
        </fieldset>

        <div class="flex flex-col gap-2">
          <span class="text-[14px] font-bold">{{ t('gameEdit.suitabilities') }}</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="suitability in SUITABILITIES"
              :key="suitability"
              type="button"
              :aria-pressed="suitabilities.includes(suitability) ? 'true' : 'false'"
              class="outline-memphis inline-flex h-11 items-center rounded-pill border-(length:--cp-bw) px-4 text-small font-bold transition-colors"
              :class="suitabilities.includes(suitability) ? 'border-line bg-ink text-paper' : 'border-line bg-surface text-ink hover:bg-paper-2'"
              @click="toggleSuitability(suitability)"
            >
              {{ t(`library.suitability.${suitability}`) }}
            </button>
          </div>
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

        <NoticeBanner
          v-if="failure"
          tone="critical"
        >
          {{ failure }}
        </NoticeBanner>

        <div class="mt-1.5 flex flex-wrap items-center gap-3">
          <AppButton
            type="submit"
            size="lg"
            :aria-disabled="blocked || saving"
            :aria-describedby="blocker ? 'game-blocker' : undefined"
          >
            {{ saving ? t('gameEdit.saving') : game ? t('gameEdit.saveChanges') : t('library.create') }}
            <AppIcon
              :icon="ChevronRight"
              :size="18"
            />
          </AppButton>
          <span
            v-if="blocker"
            id="game-blocker"
            class="text-small font-bold text-error-fg"
          >{{ blocker }}</span>
        </div>
      </div>
    </div>
  </form>
</template>
