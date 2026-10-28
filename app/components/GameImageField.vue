<script setup lang="ts">
import { Upload } from '@lucide/vue'
import { toCardWebp } from '~/utils/image-resize'

// The image of a game in its form (#143, screen 24): a 16:10 tile and „Bild wählen“. The picked file is
// cropped and shrunk to a WebP in the browser right away, so the tile shows what the card will show; the
// form uploads the blob (v-model) once the game is saved. `imageUrl` is the image the game already has.
const props = defineProps<{
  /** The cropped WebP waiting for the upload. */
  modelValue: Blob | null
  imageUrl?: string | null
  /** The form is sending the image. */
  uploading?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: Blob | null] }>()

const { t } = useI18n()
const input = useTemplateRef<HTMLInputElement>('input')
const converting = ref(false)
const failure = ref<string | null>(null)
const labelId = useId()

// The tile shows the picked blob through an object URL, which is released when it changes.
const pickedUrl = ref<string | null>(null)
watch(() => props.modelValue, (blob) => {
  if (pickedUrl.value) URL.revokeObjectURL(pickedUrl.value)
  pickedUrl.value = blob ? URL.createObjectURL(blob) : null
}, { immediate: true })
onBeforeUnmount(() => {
  if (pickedUrl.value) URL.revokeObjectURL(pickedUrl.value)
})
const shown = computed(() => pickedUrl.value ?? props.imageUrl ?? null)
const busy = computed(() => converting.value || Boolean(props.uploading))
const status = computed(() => {
  if (props.uploading) return t('gameEdit.imageUploading')
  return converting.value ? t('gameEdit.imageConverting') : null
})

async function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  converting.value = true
  failure.value = null
  try {
    emit('update:modelValue', await toCardWebp(file))
  }
  catch {
    failure.value = t('gameEdit.imageConvertFailed')
  }
  finally {
    converting.value = false
    // The same file chosen again must fire `change` again.
    target.value = ''
  }
}
</script>

<template>
  <div
    role="group"
    :aria-labelledby="labelId"
    class="flex flex-col gap-1.5"
  >
    <b
      :id="labelId"
      class="text-[14px]"
    >{{ t('gameEdit.image') }}</b>
    <div class="flex items-center gap-3">
      <span
        class="grid aspect-[16/10] w-[120px] flex-none place-items-center overflow-hidden rounded-[10px] border-[2.5px] bg-paper-2"
        :class="shown ? 'border-line' : 'border-dashed border-line font-mono text-[10px] text-ink-2'"
      >
        <img
          v-if="shown"
          :src="shown"
          :alt="t('gameEdit.imagePreviewAlt')"
          class="size-full object-cover"
        >
        <template v-else>{{ t('gameEdit.imageRatio') }}</template>
      </span>
      <div class="flex min-w-0 flex-col items-start gap-1.5">
        <AppButton
          variant="secondary"
          :aria-disabled="busy || undefined"
          @click="busy || input?.click()"
        >
          <template #icon>
            <AppIcon
              :icon="Upload"
              :size="14"
            />
          </template>
          {{ shown ? t('gameEdit.imageChange') : t('gameEdit.imageChoose') }}
        </AppButton>
        <span
          v-if="status"
          role="status"
          class="text-small font-bold text-ink-2"
        >{{ status }}</span>
        <span
          v-else-if="!failure"
          class="text-small text-ink-2"
        >{{ t('gameEdit.imageHelp') }}</span>
      </div>
    </div>
    <NoticeBanner
      v-if="failure"
      tone="critical"
    >
      {{ failure }}
    </NoticeBanner>
    <input
      ref="input"
      type="file"
      accept="image/*"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    >
  </div>
</template>
