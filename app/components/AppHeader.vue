<script setup lang="ts">
import { Volume2, VolumeX } from '@lucide/vue'
import type { EventContext } from '~/utils/event-page'

// Logo (Compibert head), then the hub nav (on the Event page from md up, with the Event under its current tab, #426) or, on a phone, the event title area, then sound toggle and
// the avatar menu when signed in. The `actions` slot is the page's own buttons (the Event page's Einladen, #166).
// Full-width pages (sign-in, setup) stretch the header edge to edge, so the logo sits at the left edge.
// `accessory` is the head's party hat on the Event page (#38); the hub and the other pages pass none.
// `event` is the Event the nav's current tab names (kind `event` only).
defineProps<{ kind: 'hub' | 'event' | 'bare', flush?: boolean, accessory?: 'partyhat', event?: EventContext }>()

const { t } = useI18n()
const sound = useSound()
const user = useAuthUser()
</script>

<template>
  <header class="sticky top-0 layer-header flex-none border-b-(length:--cp-bw) border-line bg-surface">
    <div
      class="flex h-14 flex-nowrap items-center gap-3 px-3.5 md:h-header"
      :class="flush ? 'w-full' : 'mx-auto max-w-shell'"
    >
      <NuxtLink
        to="/"
        :aria-label="t('app.name')"
        class="flex items-center gap-2 text-ink no-underline"
        :class="kind === 'event' && 'flex-none'"
      >
        <span class="w-[30px] md:w-[34px]">
          <Compibert
            variant="head"
            :accessory="accessory"
          />
        </span>
        <span
          class="font-display text-[22px] leading-none uppercase"
          :class="kind === 'event' && 'max-[63.99rem]:hidden'"
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
        <!-- From md up the Event is under the nav's Events tab (the nav shows where the hub's does), so the divider and the title area are gone; a phone has the title and no nav. -->
        <HubNav
          layout="header"
          :viewer="user"
          :context="event"
          class="max-md:hidden"
        />
        <span class="min-w-[8px] flex-1 max-md:hidden" />
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 md:hidden">
          <slot name="title" />
        </div>
      </template>

      <span
        v-else
        class="flex-1"
      />

      <slot name="actions" />

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
