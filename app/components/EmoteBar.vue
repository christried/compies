<script setup lang="ts">
import { EMOTE_PICTURE } from '~/utils/emote-art'
import { emoteRing } from '~/utils/motion'
import { EMOTE_COOLDOWN_MS, EMOTE_IDS, type EmoteId } from '~~/shared/emote'

// The four Emote buttons on the Game board (#668, spec #719 § C, 02-components § EmoteBar). A tap sends the Emote and starts the wait; for `EMOTE_COOLDOWN_MS`, the number
// the room's rule uses, every button is `aria-disabled` (still focusable) and described by „Kurz warten“, the tapped one carries a draining ring and the other three are
// dimmed. The wait is a timer; the ring's animation is decoration and the state does not depend on it. Where the room is not open the page's `send` does nothing and the
// wait runs all the same: it is the tap's, the room's rule is the rule. Below md there is no button until #768 adds its own, so the toolbar hides there.
const emit = defineEmits<{ send: [emote: EmoteId] }>()

const { t } = useI18n()
const root = useTemplateRef<HTMLElement>('root')
const waitId = useId()
const tapped = ref<EmoteId | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

async function tap(emote: EmoteId) {
  if (tapped.value !== null) return
  tapped.value = emote
  emit('send', emote)
  timer = setTimeout(() => void (tapped.value = null), EMOTE_COOLDOWN_MS)
  await nextTick()
  const ring = root.value?.querySelector('circle')
  if (ring) emoteRing(ring)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div
    ref="root"
    role="toolbar"
    :aria-label="t('emote.label')"
    class="inline-flex items-center gap-1.5 rounded-pill border-(length:--cp-bw) border-line bg-surface p-1.5 shadow-card max-md:hidden"
  >
    <button
      v-for="id in EMOTE_IDS"
      :key="id"
      type="button"
      class="outline-memphis hit-44 relative grid size-11 place-items-center rounded-pill bg-surface shadow-btn lift aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-none aria-disabled:cursor-not-allowed"
      :class="tapped !== null && tapped !== id ? 'opacity-60' : undefined"
      :aria-label="t('emote.send', { name: t(`emote.${id}`) })"
      :aria-disabled="tapped !== null ? 'true' : undefined"
      :aria-describedby="tapped !== null ? waitId : undefined"
      @click="tap(id)"
    >
      <img
        :src="EMOTE_PICTURE[id]"
        alt=""
        width="32"
        height="32"
        draggable="false"
      >
      <svg
        v-if="tapped === id"
        viewBox="0 0 60 60"
        aria-hidden="true"
        class="pointer-events-none absolute inset-[-3px] -rotate-90 text-primary"
      >
        <circle
          cx="30"
          cy="30"
          r="28"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          pathLength="1"
          stroke-dasharray="1"
        />
      </svg>
    </button>
    <span
      v-if="tapped !== null"
      :id="waitId"
      class="sr-only"
    >{{ t('emote.wait') }}</span>
  </div>
</template>
