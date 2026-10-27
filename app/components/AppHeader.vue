<script setup lang="ts">
import { Volume2, VolumeX } from '@lucide/vue'

// Logo (Compibert head), then the hub nav or the event title area, then sound toggle and
// the avatar menu when signed in. The Einladen button lands with the invite sheet.
// Full-width pages (sign-in, setup) stretch the header edge to edge, so the logo sits at the left edge.
defineProps<{ kind: 'hub' | 'event' | 'bare', flush?: boolean }>()

const { t } = useI18n()
const sound = useSound()
const user = useAuthUser()
</script>

<template>
  <header class="sticky top-0 layer-header flex-none border-b-(length:--cp-bw) border-line bg-surface">
    <div
      class="flex h-14 items-center gap-3 px-3.5 md:h-header"
      :class="flush ? 'w-full' : 'mx-auto max-w-shell'"
    >
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
          :class="kind === 'event' && 'max-md:hidden'"
          aria-hidden="true"
        >{{ t('app.name') }}</span>
      </NuxtLink>

      <template v-if="kind === 'hub'">
        <HubNav
          layout="header"
          :viewer="user"
          class="max-md:hidden"
        />
        <span class="flex-1" />
      </template>

      <template v-else-if="kind === 'event'">
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
      <UserMenu />
    </div>
  </header>
</template>
