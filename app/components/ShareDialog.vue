<script setup lang="ts">
import { Download, Share2 } from '@lucide/vue'
import { shareFileName, shareImageCopy } from '~/utils/share-image'
import type { EventView } from '~~/shared/event'
import { shareImageModel, type ShareFormat } from '~~/shared/share-image'

// „Bild teilen“ (#313, spec #308, 02-components § ShareDialog): the Share image of a finished Event as the sheet's preview, in the format the
// Member picks, with its download and, where the browser can share files, „Teilen“. The preview is the route's real PNG (useShareImage); the
// alt text is the model's, the same function the server draws from. No link and no clipboard: the picture goes where the Member sends it.
const props = defineProps<{
  open: boolean
  view: EventView
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const { toast } = useToast()
const statusId = useId()

const format = ref<ShareFormat>('wide')
const options = computed<{ value: ShareFormat, label: string }[]>(() => [
  { value: 'wide', label: t('share.landscape') },
  { value: 'square', label: t('share.square') },
])
const image = useShareImage(() => props.view.event.slug, format, toRef(props, 'open'))

const ready = computed(() => image.status.value === 'ready' && image.url.value !== null)
const fileName = computed(() => shareFileName(props.view.event.slug, format.value))
const alt = computed(() => shareImageModel(props.view, format.value, shareImageCopy(t))?.alt ?? '')
/** The preview keeps the picture's shape before it loads, so nothing jumps. */
const aspect = computed(() => (format.value === 'wide' ? '1200 / 630' : '1 / 1'))

// Web Share with a file: asked after mount, so the server renders no button the browser then removes.
const canShare = ref(false)
onMounted(() => {
  canShare.value = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'x.png', { type: 'image/png' })] })
})

/** The download: NuxtLink refuses a blob address as an href, so a link made for the click does it. */
function save() {
  const link = document.createElement('a')
  link.href = image.url.value!
  link.download = fileName.value
  link.click()
}

/** Hands the already loaded file to the share sheet inside the click: iOS Safari refuses a share that waits on a fetch. */
async function share() {
  const blob = image.blob.value
  if (!blob) return
  try {
    await navigator.share({ files: [new File([blob], fileName.value, { type: 'image/png' })] })
  }
  catch (error) {
    // Dismissing the share sheet is not a failure.
    if (error instanceof DOMException && error.name === 'AbortError') return
    toast({ tone: 'error', text: t('share.shareFailed') })
  }
}
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('share.title')"
    @close="emit('close')"
  >
    <SegmentedControl
      v-model="format"
      :options="options"
      :label="t('share.format')"
    />

    <div
      class="relative w-full overflow-hidden rounded-xl border-(length:--cp-bw) border-line bg-paper-2"
      :style="{ aspectRatio: aspect }"
      :aria-busy="image.status.value === 'loading'"
    >
      <img
        v-if="ready"
        :src="image.url.value!"
        :alt="alt"
        class="block size-full"
      >
      <div
        v-else-if="image.status.value === 'error'"
        class="absolute inset-0 grid place-items-center p-3"
      >
        <NoticeBanner tone="critical">
          {{ t('share.error') }}
          <template #action>
            <AppButton
              variant="secondary"
              @click="image.retry"
            >
              {{ t('common.retry') }}
            </AppButton>
          </template>
        </NoticeBanner>
      </div>
      <p
        v-else
        class="absolute inset-0 m-0 grid animate-pulse place-items-center text-small font-bold text-ink-2"
      >
        {{ t('share.loading') }}
      </p>
    </div>

    <div class="flex flex-wrap gap-2.5">
      <!-- Disabled with its reason (the preview's status), until the picture is there. -->
      <AppButton
        size="card"
        :aria-disabled="ready ? undefined : 'true'"
        :aria-describedby="ready ? undefined : statusId"
        @click="ready && save()"
      >
        <AppIcon
          :icon="Download"
          :size="18"
        />
        {{ t('share.download') }}
      </AppButton>
      <AppButton
        v-if="canShare"
        variant="secondary"
        size="card"
        :aria-disabled="ready ? undefined : 'true'"
        :aria-describedby="ready ? undefined : statusId"
        @click="ready && share()"
      >
        <AppIcon
          :icon="Share2"
          :size="18"
        />
        {{ t('share.native') }}
      </AppButton>
    </div>
    <p
      :id="statusId"
      class="sr-only"
    >
      {{ image.status.value === 'error' ? t('share.error') : t('share.loading') }}
    </p>
  </AppSheet>
</template>
