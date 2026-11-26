<script setup lang="ts">
import { Download } from '@lucide/vue'

// Home's „Compies als App installieren“ (#676, spec #927 § The install hint; screen 29 „App Systemzustände“, states „Hinweis“ and „Installiert“). Its own
// build, not a NoticeBanner. Whether it shows, and which state, is `useInstallHint`; this component draws it. No entrance animation (02-components: „Motion: —“):
// it appears after mount and pushes the list down once.
//
// The seam for the iOS sheet (#929): `shown` widens to `via === 'sheet'`, the sheet component comes in, and `install()` of `useInstallHint` fills its
// 'sheet' branch.
const props = defineProps<{ hasPlayed: boolean }>()

const { t } = useI18n()
const { hint, install, later } = useInstallHint(() => props.hasPlayed)
// The icon follows the staging build (`brand.iconDir`, stage.ts): Home shows the icon the phone would install.
const icon = `${useRuntimeConfig().public.iconDir}/icon-192.png`
const titleId = useId()

// Only the Android prompt for now; the iPhone and iPad sheet is #929.
const shown = computed(() => hint.value.kind === 'done' || (hint.value.kind === 'banner' && hint.value.via === 'prompt'))
// The browser's dialog is open: the banner stays and the button waits, a second tap does nothing.
const busy = ref(false)

async function onInstall() {
  if (busy.value) return
  busy.value = true
  try {
    await install()
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="shown">
    <div
      v-if="hint.kind === 'done'"
      role="status"
      class="flex items-center gap-3.5 rounded-[16px] border-(length:--cp-bw) border-line bg-primary px-4 py-3.5 text-on-primary"
    >
      <LazyCompibertRig
        variant="head"
        :size="56"
        state="cheer"
        :hops-for="1.15"
      />
      <span class="font-bold text-pretty">{{ t('pwa.done', { where: 'Home-Bildschirm' }) }}</span>
    </div>

    <section
      v-else
      :aria-labelledby="titleId"
      class="flex flex-wrap items-center gap-3.5 rounded-[16px] border-(length:--cp-bw) border-line bg-surface px-4 py-3.5 shadow-card"
    >
      <img
        :src="icon"
        alt=""
        width="56"
        height="56"
        class="flex-none rounded-[14px] border-[2.5px] border-line"
      >
      <div class="flex min-w-[200px] flex-1 flex-col leading-[1.35]">
        <b
          :id="titleId"
          class="text-[16px]"
        >{{ t('pwa.title') }}</b>
        <span class="text-[13px] text-pretty text-ink-2">{{ t('pwa.text') }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex h-11 items-center px-3 text-[14px] font-bold text-ink"
          @click="later()"
        >
          {{ t('pwa.later') }}
        </button>
        <AppButton
          :aria-busy="busy"
          @click="onInstall()"
        >
          <template #icon>
            <AppIcon
              :icon="Download"
              :size="16"
            />
          </template>
          {{ t('pwa.install') }}
        </AppButton>
      </div>
    </section>
  </div>
</template>
