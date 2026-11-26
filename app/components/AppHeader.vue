<script setup lang="ts">
import { Volume2, VolumeX } from '@lucide/vue'
import type { EventContext } from '~/utils/event-page'

// Logo (Compibert head), then the hub nav (on the Event page from md up, with the Event under its current tab, #426) or, on a phone, the event title area, then the Appearance button (signed in, from md up, #617), the sound toggle and
// the avatar menu when signed in. The `actions` slot is the page's own buttons (the Event page's Einladen, #166).
// Full-width pages (sign-in, setup) stretch the header edge to edge, so the logo sits at the left edge.
// `accessory` is the head's party hat on the Event page (#38); the hub and the other pages pass none.
// `event` is the Event the nav's current tab names (kind `event` only).
// `data-tour-edge` (#460) marks sticky chrome the Tour never scrolls: the header's bottom edge is the top of the usable area.
// On the Event page the head is the still `Compibert` until the page gives it something to do (#673: the own Emote, a reveal with a Veto, a lost
// connection, `useHeaderReaction`); then the rig (`CompibertRig`, same box and viewBox, so nothing jumps) takes its place for good. The header loads
// GSAP itself before it mounts the rig, so a chunk that fails to load never replaces the still head by the rig's still pose; every other page provides
// no reaction and keeps the still head with no code of its own.
const props = defineProps<{ kind: 'hub' | 'event' | 'bare', flush?: boolean, accessory?: 'partyhat', event?: EventContext }>()

const { t } = useI18n()
const sound = useSound()
const user = useAuthUser()

const look = useHeaderReaction()
const rigShown = ref(false)
/** A reaction the rig must not play: one that is over when the chunk arrives, or one a remount for the hat would play again. */
const stale = shallowRef<Reaction | null>(null)
const startReaction = computed(() => {
  const reaction = look?.reaction.value ?? null
  return reaction === stale.value ? null : reaction
})
let arrivedAt = 0
let waking = false

async function wake() {
  if (waking || rigShown.value) return
  waking = true
  try {
    await loadGsap()
  }
  catch {
    return // the still head stays; the next reaction, or a change of base, tries again (`loadGsap` forgot the failure)
  }
  finally {
    waking = false
  }
  const reaction = look?.reaction.value
  if (reaction && Date.now() - arrivedAt >= reactionSeconds(reaction) * 1000) stale.value = reaction
  rigShown.value = true
}

watch([() => look?.reaction.value, () => look?.base.value], ([reaction, base], [before]) => {
  const arrived = !!reaction && reaction !== before
  if (arrived) arrivedAt = Date.now()
  if (!rigShown.value && (arrived || base === 'confused')) void wake()
})
// A new hat is a new rig (`:key`): the reaction in flight is lost, not played again from its start.
watch(() => props.accessory, () => (stale.value = look?.reaction.value ?? null))
</script>

<template>
  <header
    data-tour-edge="header"
    class="sticky top-0 layer-header flex-none border-b-(length:--cp-bw) border-line bg-surface"
  >
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
          <CompibertRig
            v-if="look && rigShown"
            :key="accessory ?? 'none'"
            variant="head"
            :state="look.base.value"
            :reaction="startReaction"
            :accessory="accessory"
          />
          <Compibert
            v-else
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

      <AppearanceMenu />
      <IconButton
        data-tour="sound"
        :icon="sound.enabled.value ? Volume2 : VolumeX"
        :label="t('common.sound')"
        :pressed="sound.enabled.value"
        @click="sound.toggle"
      />
      <UserMenu />
    </div>
  </header>
</template>
