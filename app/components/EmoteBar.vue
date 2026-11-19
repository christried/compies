<script setup lang="ts">
import { Smile } from '@lucide/vue'
import { EMOTE_PICTURE } from '~/utils/emote-art'
import { emoteRing } from '~/utils/motion'
import { EMOTE_IDS, EMOTE_PAGE_WAIT_MS, type EmoteId } from '~~/shared/emote'
import { MD_QUERY, useMediaQuery } from '~/composables/useMediaQuery'

// The four Emote buttons on the Game board (#668, spec #719 § C, 02-components § EmoteBar). A tap sends the Emote and starts the wait; for `EMOTE_PAGE_WAIT_MS`
// (the room's `EMOTE_COOLDOWN_MS` and a margin, so a tap at the end of the ring is never early for the room, #848), every button is `aria-disabled` (still focusable) and described by „Kurz warten“, the tapped one carries a draining ring and the other three are
// dimmed. The wait is a timer; the ring's animation is decoration and the state does not depend on it. Where the room is not open the page's `send` does nothing and the
// wait runs all the same: it is the tap's, the room's rule is the rule.
// Below md the row gives way to one button (#768) at the same place, which opens a sheet with the four; a pick sends and closes it, and the wait shows on the button too.
const emit = defineEmits<{ send: [emote: EmoteId] }>()

const { t } = useI18n()
const root = useTemplateRef<HTMLElement>('root')
const waitId = useId()
const tapped = ref<EmoteId | null>(null)
const sheetOpen = ref(false)
const wide = useMediaQuery(MD_QUERY)
let timer: ReturnType<typeof setTimeout> | undefined

async function tap(emote: EmoteId) {
  if (tapped.value !== null) return
  tapped.value = emote
  emit('send', emote)
  timer = setTimeout(() => void (tapped.value = null), EMOTE_PAGE_WAIT_MS)
  await nextTick()
  // Both the row's and the phone button's ring (#768); the Smile's own circle is not a ring.
  root.value?.querySelectorAll('circle[stroke-dasharray]').forEach(ring => emoteRing(ring))
}

function openSheet() {
  if (tapped.value !== null) return
  sheetOpen.value = true
}

function pick(emote: EmoteId) {
  void tap(emote)
  sheetOpen.value = false
}

// The window grows to md with the sheet open: the sheet closes, the row is there (#768).
watch(wide, (isWide) => {
  if (isWide) sheetOpen.value = false
})

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div ref="root">
    <div
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
    </div>

    <button
      type="button"
      class="outline-memphis hit-44 relative grid size-12 place-items-center rounded-pill border-(length:--cp-bw) border-line bg-surface shadow-btn lift aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-none aria-disabled:cursor-not-allowed md:hidden"
      :aria-label="t('emote.label')"
      aria-haspopup="dialog"
      :aria-expanded="sheetOpen"
      :aria-disabled="tapped !== null ? 'true' : undefined"
      :aria-describedby="tapped !== null ? waitId : undefined"
      @click="openSheet"
    >
      <AppIcon
        :icon="Smile"
        :size="24"
      />
      <svg
        v-if="tapped !== null"
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

    <AppSheet
      :open="sheetOpen"
      :title="t('emote.label')"
      @close="sheetOpen = false"
    >
      <div
        role="group"
        :aria-label="t('emote.label')"
        class="grid grid-cols-4 gap-3"
      >
        <button
          v-for="id in EMOTE_IDS"
          :key="id"
          type="button"
          class="outline-memphis hit-44 grid size-[72px] place-items-center rounded-pill border-(length:--cp-bw) border-line bg-surface shadow-btn lift"
          :aria-label="t('emote.send', { name: t(`emote.${id}`) })"
          @click="pick(id)"
        >
          <img
            :src="EMOTE_PICTURE[id]"
            alt=""
            width="56"
            height="56"
            draggable="false"
          >
        </button>
      </div>
    </AppSheet>
  </div>
</template>
