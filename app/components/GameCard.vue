<script setup lang="ts">
import { Gamepad2, Users } from '@lucide/vue'
import type { RouteLocationRaw } from 'vue-router'
import { describeGame } from '~/utils/describe-game'
import { gameCover } from '~/utils/game-cover'
import type { GameView, PoolGameFace } from '~~/shared/game'
import { priceLine } from '~/utils/price'
import { colorTags } from '~~/shared/tag-colors'

// A game as a card or a row (02-components § GameCard, #141). The cover is the uploaded image, else the
// clip's YouTube thumbnail, else a neutral placeholder. It is decorative: the name is the text. With `to`
// the name is the link and stretches over the whole card (so `#actions` can hold buttons of their own);
// without it the card is a plain element, not a button. #146 and #148 reuse it; a game that came as its face only (a Member's
// pool game, #224) has no player count and no Suitabilities to show, so the card shows neither. `layout="responsive"` (#173) is a row
// below md and a card from md up, decided in CSS, so the game browser needs no `matchMedia`. A library game shows its first
// three Tags and „+N“ (#335), each in the colour the game's whole Tag order gives it (#427, as on its page) and its Price line under the meta line (#337, #338: a pool and a Round game carry the Price too); only a wheel slice carries neither. They are
// spans, not a list: the tests count the cards as `li`. The picker's rows are these cards too, so they show the Price as well.
// The `tile` layout (#435) is the cover and the name only, on the Event page: no players, Suitabilities, Tags or Price, and no link. With `opens` (#443) the
// name is a button that emits `open` (the Host's tile opens the game dialog) and stretches over the tile like the link does; a tile without it stays plain.
const props = withDefaults(defineProps<{
  game: PoolGameFace & Partial<Pick<GameView, 'playersMin' | 'playersMax' | 'suitabilities' | 'tags' | 'price'>>
  layout?: 'card' | 'row' | 'responsive' | 'tile'
  to?: RouteLocationRaw
  /** The name is a button that asks for the game's dialog (#443). Without it, or with `to`, nothing changes. */
  opens?: boolean
}>(), { layout: 'card', to: undefined, opens: false })

const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()
const NuxtLink = resolveComponent('NuxtLink')
const now = new Date()
const priceText = computed(() => (props.game.price ? priceLine(props.game.price, now, t) : null))
// The meta lines (players, Suitabilities, Price, Tags) are not part of a tile (#435).
const showMeta = computed(() => props.layout !== 'tile')

const cover = computed(() => gameCover(props.game))
/** What the name is: the link, else the button that opens the dialog (#443), else a plain element. */
const asButton = computed(() => props.opens && !props.to)
// The compact player count and the Suitabilities („Passt zu“, #171: „Teams, 1 gegen 1“).
const description = computed(() => describeGame({
  playersMin: props.game.playersMin ?? null,
  playersMax: props.game.playersMax ?? null,
  suitabilities: props.game.suitabilities ?? [],
}, t))
const players = computed(() => description.value.playersCompact)
const suitabilities = computed(() => description.value.suitabilities)
const TAGS_SHOWN = 3
const shownTags = computed(() => colorTags(props.game.tags ?? []).slice(0, TAGS_SHOWN))
const moreTags = computed(() => Math.max(0, (props.game.tags ?? []).length - TAGS_SHOWN))

// One class set per layout; Tailwind needs the strings whole. The responsive set is the row's, undone from md up.
// The body grows, so the actions sit on the card's bottom edge in a stretched grid row (#351).
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
    body: 'flex-auto px-3 pt-2.5 pb-3',
    name: 'line-clamp-2',
    actions: 'px-3 pb-3',
  },
  tile: {
    box: 'flex-col overflow-hidden rounded-[14px]',
    cover: 'aspect-[16/10] w-full border-b-2',
    body: 'px-3 pt-2.5 pb-3',
    name: 'line-clamp-2 break-words',
    actions: '',
  },
  responsive: {
    box: 'min-h-15 items-center gap-3 rounded-[12px] py-1.5 pr-2.5 pl-1.5 md:min-h-0 md:flex-col md:items-stretch md:gap-0 md:overflow-hidden md:rounded-[14px] md:p-0',
    cover: 'size-[46px] rounded-[9px] border-2 md:aspect-[16/10] md:size-auto md:w-full md:rounded-none md:border-0 md:border-b-2',
    body: 'flex-1 md:flex-auto md:px-3 md:pt-2.5 md:pb-3',
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
        :is="to ? NuxtLink : asButton ? 'button' : 'b'"
        :to="to"
        :type="asButton ? 'button' : undefined"
        :aria-haspopup="asButton ? 'dialog' : undefined"
        class="leading-tight font-bold text-ink no-underline"
        :class="[
          to || asButton ? 'focus-visible:focus-ring after:absolute after:inset-0 after:block after:content-[\'\']' : '',
          asButton ? 'text-left' : '',
          look.name,
          'text-[15px]',
        ]"
        @click="asButton ? emit('open') : undefined"
      >
        {{ game.name }}
      </component>
      <div
        v-if="showMeta && (players || suitabilities)"
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
      <span
        v-if="showMeta && priceText"
        class="text-[12px] font-bold text-ink-2"
        :class="layout === 'card' ? '' : layout === 'row' ? 'truncate' : 'truncate md:whitespace-normal'"
      >{{ priceText }}</span>
      <div
        v-if="showMeta && shownTags.length > 0"
        role="group"
        :aria-label="t('library.tags')"
        class="flex gap-1"
        :class="layout === 'card' ? 'flex-wrap' : layout === 'row' ? 'flex-nowrap overflow-hidden' : 'flex-nowrap overflow-hidden md:flex-wrap'"
      >
        <TagChip
          v-for="tag in shownTags"
          :key="tag.key"
          :color="tag.color"
          class="max-w-[9rem] truncate px-2 text-[11px] leading-5"
        >
          {{ tag.label }}
        </TagChip>
        <span
          v-if="moreTags > 0"
          :title="t('library.moreTagsLabel', { n: moreTags }, moreTags)"
          :aria-label="t('library.moreTagsLabel', { n: moreTags }, moreTags)"
          class="flex-none rounded-pill px-1 text-[11px] leading-5 font-bold text-ink-2"
        >{{ t('library.moreTags', { n: moreTags }) }}</span>
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
