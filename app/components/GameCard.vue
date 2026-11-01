<script setup lang="ts">
import { Gamepad2, Users } from '@lucide/vue'
import type { RouteLocationRaw } from 'vue-router'
import { describeGame } from '~/utils/describe-game'
import type { GameView, PoolGameFace } from '~~/shared/game'
import { youTubeThumbnail } from '~~/shared/youtube'

// A game as a card or a row (02-components § GameCard, #141). The cover is the uploaded image, else the
// clip's YouTube thumbnail, else a neutral placeholder. It is decorative: the name is the text. With `to`
// the name is the link and stretches over the whole card (so `#actions` can hold buttons of their own);
// without it the card is a plain element, not a button. #146 and #148 reuse it; a game that came as its face only (a Member's
// pool game, #224) has no player count and no Suitabilities to show, so the card shows neither. `layout="responsive"` (#173) is a row
// below md and a card from md up, decided in CSS, so the game browser needs no `matchMedia`.
const props = withDefaults(defineProps<{
  game: PoolGameFace & Partial<Pick<GameView, 'playersMin' | 'playersMax' | 'suitabilities'>>
  layout?: 'card' | 'row' | 'responsive'
  to?: RouteLocationRaw
}>(), { layout: 'card', to: undefined })

const { t } = useI18n()
const NuxtLink = resolveComponent('NuxtLink')

const cover = computed(() => props.game.imageUrl ?? (props.game.youtubeId ? youTubeThumbnail(props.game.youtubeId) : null))
// The compact player count and the Suitabilities („Passt zu“, #171: „Teams, 1 gegen 1“).
const description = computed(() => describeGame({
  playersMin: props.game.playersMin ?? null,
  playersMax: props.game.playersMax ?? null,
  suitabilities: props.game.suitabilities ?? [],
}, t))
const players = computed(() => description.value.playersCompact)
const suitabilities = computed(() => description.value.suitabilities)

// One class set per layout; Tailwind needs the strings whole. The responsive set is the row's, undone from md up.
const LAYOUT = {
  row: {
    box: 'min-h-15 items-center gap-3 rounded-[12px] py-1.5 pr-2.5 pl-1.5',
    cover: 'size-[46px] rounded-[9px] border-2',
    body: 'flex-1',
    name: 'truncate',
    actions: '',
  },
  card: {
    box: 'flex-col overflow-hidden rounded-[14px]',
    cover: 'aspect-[16/10] w-full border-b-2',
    body: 'px-3 pt-2.5 pb-3',
    name: 'line-clamp-2',
    actions: 'px-3 pb-3',
  },
  responsive: {
    box: 'min-h-15 items-center gap-3 rounded-[12px] py-1.5 pr-2.5 pl-1.5 md:min-h-0 md:flex-col md:items-stretch md:gap-0 md:overflow-hidden md:rounded-[14px] md:p-0',
    cover: 'size-[46px] rounded-[9px] border-2 md:aspect-[16/10] md:size-auto md:w-full md:rounded-none md:border-0 md:border-b-2',
    body: 'flex-1 md:flex-none md:px-3 md:pt-2.5 md:pb-3',
    name: 'truncate md:line-clamp-2 md:whitespace-normal',
    actions: 'md:px-3 md:pb-3',
  },
}
const look = computed(() => LAYOUT[props.layout])
</script>

<template>
  <div
    class="relative flex min-w-0 border-(length:--cp-bw) border-line bg-surface shadow-sm"
    :class="look.box"
  >
    <div
      :data-cover="cover ? 'image' : 'placeholder'"
      class="relative grid flex-none place-items-center overflow-hidden border-line bg-paper-2"
      :class="look.cover"
      :style="cover ? undefined : { backgroundImage: 'repeating-linear-gradient(135deg, var(--cp-paper-2) 0 8px, var(--cp-surface) 8px 16px)' }"
    >
      <img
        v-if="cover"
        :src="cover"
        alt=""
        loading="lazy"
        class="absolute inset-0 size-full object-cover"
      >
      <AppIcon
        v-else
        :icon="Gamepad2"
        :size="layout === 'card' ? 32 : layout === 'row' ? 20 : 24"
        class="text-ink-3"
      />
    </div>

    <div
      class="flex min-w-0 flex-col gap-1"
      :class="look.body"
    >
      <component
        :is="to ? NuxtLink : 'b'"
        :to="to"
        class="leading-tight font-bold text-ink no-underline"
        :class="[
          to ? 'focus-visible:focus-ring after:absolute after:inset-0 after:block after:content-[\'\']' : '',
          look.name,
          'text-[15px]',
        ]"
      >
        {{ game.name }}
      </component>
      <div
        v-if="players || suitabilities"
        class="flex flex-wrap gap-x-2.5 text-[12px] text-ink-2"
      >
        <span
          v-if="players"
          class="inline-flex items-center gap-1"
        >
          <AppIcon
            :icon="Users"
            :size="13"
          />
          {{ players }}
        </span>
        <span v-if="suitabilities">{{ suitabilities }}</span>
      </div>
    </div>

    <div
      v-if="$slots.actions"
      class="relative flex flex-none items-center gap-2"
      :class="look.actions"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
