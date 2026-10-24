<script setup lang="ts">
import { RELEASES } from '~/utils/changelog'

// „v1.2.0“ chip to Neuigkeiten (09 § VersionLabel). The version is the newest Release in CHANGELOG.md; the
// changelog guard test keeps package.json at the same version. The 44 px hit area comes from `::before`.
defineProps<{
  /** The newest Release is not seen on this device yet (user menu only): a dot before the version. */
  unseen?: boolean
}>()

const { t } = useI18n()
const version = RELEASES[0]?.version
</script>

<template>
  <NuxtLink
    v-if="version"
    to="/neuigkeiten"
    :aria-label="t(unseen ? 'news.versionUnseen' : 'news.version', { v: version })"
    class="relative inline-flex h-7 items-center gap-1.5 rounded-pill border-2 border-line bg-surface pr-2.5 font-mono text-[12px] leading-none font-bold text-ink no-underline transition-colors dur-fast before:absolute before:-inset-x-1 before:-inset-y-[9px] before:content-[''] hover:bg-primary hover:text-on-primary focus-visible:bg-primary focus-visible:text-on-primary"
    :class="unseen ? 'pl-2' : 'pl-2.5'"
  >
    <span
      v-if="unseen"
      aria-hidden="true"
      class="size-[9px] rounded-pill border-[1.5px] border-line bg-primary"
    />
    v{{ version }}
  </NuxtLink>
</template>
