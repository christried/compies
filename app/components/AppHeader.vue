<script setup lang="ts">
import { Volume2, VolumeX } from '@lucide/vue'

// Logo (Compibert head), then the hub nav or the session title area, then sound toggle.
// The avatar menu lands with sign-in, the Einladen button with the invite sheet.
defineProps<{ kind: 'hub' | 'session' | 'bare' }>()

const { t } = useI18n()
const sound = useSound()
</script>

<template>
  <header class="sticky top-0 layer-sticky flex-none border-b-(length:--cp-bw) border-line bg-surface">
    <div class="mx-auto flex h-14 max-w-shell items-center gap-3 px-3.5 md:h-header">
      <NuxtLink
        to="/"
        :aria-label="t('app.name')"
        class="flex items-center gap-2 text-ink no-underline"
      >
        <span class="w-[30px] md:w-[34px]">
          <Compibert variant="head" />
        </span>
        <span
          class="font-display text-[22px] leading-none uppercase"
          :class="kind === 'session' && 'max-md:hidden'"
          aria-hidden="true"
        >{{ t('app.name') }}</span>
      </NuxtLink>

      <template v-if="kind === 'hub'">
        <HubNav
          layout="header"
          class="max-md:hidden"
        />
        <span class="flex-1" />
      </template>

      <template v-else-if="kind === 'session'">
        <span class="h-7 w-0.5 bg-line-soft max-md:hidden" />
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5">
          <slot name="title" />
        </div>
      </template>

      <span
        v-else
        class="flex-1"
      />

      <IconButton
        :icon="sound.enabled.value ? Volume2 : VolumeX"
        :label="t('common.sound')"
        :pressed="sound.enabled.value"
        @click="sound.toggle"
      />
    </div>
  </header>
</template>
