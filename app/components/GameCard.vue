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
// without it the card is a plain element, not a button. #146 and #148 reuse it; a game with no player count and no Suitabilities shows neither. `layout="responsive"` (#173) is a row
// below 600 px and a card from 600 px up (sm, #707), decided in CSS, so the game browser needs no `matchMedia`. A library game shows its first
// three Tags and „+N“ (#335), each in the colour the game's whole Tag order gives it (#427, as on its page) and its Price line under the meta line (#337, #338: a pool and a Round game carry the Price too); only a wheel slice carries neither. „+N“ is a button above the link, and its popover lists every Tag (#614). They are
// spans, not a list: the tests count the cards as `li`. The picker's rows are these cards too, so they show the Price as well. With `inEvents` (#733) a neutral pill „in 2 Events“
// sits between the Price line and the Tags; it is a count, no Tag, so it is not a `TagChip`, and no control, so it adds no tab stop. With `archived` (#726) the same pill reads „Archiviert“ right under the name, tile included.
// The `tile` layout (#435) is the cover and the name only, on the Event page: no players, Suitabilities, Tags or Price, and no link. With `opens` (#443) the
// name is a button that emits `open` (a tile opens the game dialog, #443, #444) and stretches over the tile like the link does; a tile without it stays plain.
const props = withDefaults(defineProps<{
  game: PoolGameFace & Partial<Pick<GameView, 'playersMin' | 'playersMax' | 'suitabilities' | 'tags' | 'price'>>
  layout?: 'card' | 'row' | 'responsive' | 'tile'
  to?: RouteLocationRaw
  /** The name is a button that asks for the game's dialog (#443). Without it, or with `to`, nothing changes. */
  opens?: boolean
  /** In how many of the Host's live Events the game sits in the pool (#733): „in 2 Events“ in a pill of its own; 0 draws nothing. */
  inEvents?: number
  /** The Host's pool shows the game as Archived (#726): a pill „Archiviert“ under the name, in every layout. Not read off `game`: the library's cards are GameViews that carry the flag too. */
  archived?: boolean
}>(), { layout: 'card', to: undefined, opens: false, inEvents: 0, archived: false })

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
/** Whether the card itself can be clicked: only then it lifts on hover, so a lift always means a click (#608). It presses only for the
 *  click of its name (`data-lift-owner` below), not for a control inside it (#658): `lift` leaves the card still while one of those is pressed. */
const clickable = computed(() => Boolean(props.to) || props.opens)
// The compact player count and the Suitabilities („Passt zu“, #171: „Teams, 1v1“).
const description = computed(() => describeGame({
  playersMin: props.game.playersMin ?? null,
  playersMax: props.game.playersMax ?? null,
  suitabilities: props.game.suitabilities ?? [],
}, t))
const players = computed(() => description.value.playersCompact)
const suitabilities = computed(() => description.value.suitabilities)
const TAGS_SHOWN = 3
const allTags = computed(() => colorTags(props.game.tags ?? []))
const shownTags = computed(() => allTags.value.slice(0, TAGS_SHOWN))
const moreTags = computed(() => Math.max(0, (props.game.tags ?? []).length - TAGS_SHOWN))
// „+N“ opens the popover of every Tag by the shared behaviour (#614, #616). It is a sibling of the link, so using it never follows the link.
const more = useTemplateRef<HTMLElement>('more')
const moreEl = computed(() => more.value ?? null)
const { open, triggerAttrs, popoverAttrs } = useRevealPopover(moreEl)

// The neutral pill of „in 2 Events“ (#733) and „Archiviert“ (#726): text only, no fill swap.
const PILL = 'w-fit max-w-full truncate rounded-pill border-2 border-line bg-paper-2 px-2 text-[11px] leading-5 font-bold text-ink-2'

// One class set per layout; Tailwind needs the strings whole. The responsive set is the row's, undone from 600 px up (sm).
// The body grows, so the actions sit on the card's bottom edge in a stretched grid row (#351).
const LAYOUT = {
  row: {
    box: 'min-h-15 items-center gap-3 rounded-[12px] py-1.5 pr-2.5 pl-1.5',
    cover: 'size-[46px] rounded-[9px] border-2',
    body: 'flex-1',
    name: 'truncate',
    actions: '',
    tags: 'flex-nowrap',
  },
  card: {
    box: 'flex-col overflow-hidden rounded-[14px]',
    cover: 'aspect-[16/10] w-full border-b-2',
    body: 'flex-auto px-3 pt-2.5 pb-3',
    name: 'line-clamp-2 min-h-[2lh]',
    actions: 'px-3 pb-3',
    // The Tags sit on the card's bottom edge, one line, so every card of a row shares their top edge (#614).
    tags: 'mt-auto flex-nowrap',
  },
  // The tile fills its grid cell: the grid stretches each cell to its row's tallest tile, so a tile with the pill and one without share the height (#824).
  tile: {
    box: 'h-full flex-col overflow-hidden rounded-[14px]',
    cover: 'aspect-[16/10] w-full border-b-2',
    body: 'px-3 pt-2.5 pb-3',
    name: 'line-clamp-2 break-words min-h-[2lh]',
    actions: '',
    tags: '',
  },
  responsive: {
    box: 'min-h-15 items-center gap-3 rounded-[12px] py-1.5 pr-2.5 pl-1.5 sm:min-h-0 sm:flex-col sm:items-stretch sm:gap-0 sm:overflow-hidden sm:rounded-[14px] sm:p-0',
    cover: 'size-[46px] rounded-[9px] border-2 sm:aspect-[16/10] sm:size-auto sm:w-full sm:rounded-none sm:border-0 sm:border-b-2',
    body: 'flex-1 sm:flex-auto sm:px-3 sm:pt-2.5 sm:pb-3',
    name: 'truncate sm:line-clamp-2 sm:min-h-[2lh] sm:whitespace-normal',
    actions: 'sm:px-3 sm:pb-3',
    tags: 'flex-nowrap sm:mt-auto',
  },
}
const look = computed(() => LAYOUT[props.layout])
</script>

<template>
  <div
    class="relative flex min-w-0 border-(length:--cp-bw) border-line bg-surface shadow-sm"
    :class="[look.box, { lift: clickable }]"
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
        :data-lift-owner="to || asButton ? '' : undefined"
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
      <!-- Outside `showMeta`: the tile shows it too (#726). A sibling of the name, so the tile's button keeps the game's name as its label. -->
      <span
        v-if="archived"
        :class="PILL"
      >{{ t('library.archivedMark') }}</span>
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
        data-price
        :title="priceText"
        class="text-[12px] font-bold text-ink-2"
        :class="layout === 'card' ? 'line-clamp-2 min-h-[2lh]' : layout === 'row' ? 'truncate' : 'truncate sm:line-clamp-2 sm:min-h-[2lh] sm:whitespace-normal'"
      >{{ priceText }}</span>
      <span
        v-if="showMeta && inEvents > 0"
        :class="PILL"
      >{{ t('library.inEvents', { n: inEvents }, inEvents) }}</span>
      <div
        v-if="showMeta && shownTags.length > 0"
        role="group"
        :aria-label="t('library.tags')"
        class="flex gap-1"
        :class="look.tags"
      >
        <TagChip
          v-for="tag in shownTags"
          :key="tag.key"
          :color="tag.color"
          class="max-w-[9rem] truncate px-2 text-[11px] leading-5"
        >
          {{ tag.label }}
        </TagChip>
        <button
          v-if="moreTags > 0"
          ref="more"
          type="button"
          class="hit-44 inline-flex h-6 flex-none items-center rounded-pill border-2 border-transparent px-1.5 text-[12px] leading-5 font-bold text-ink-2 focus-visible:focus-ring"
          :aria-label="t('library.moreTagsLabel', { n: moreTags }, moreTags)"
          v-bind="triggerAttrs"
        >
          {{ t('library.moreTags', { n: moreTags }) }}
        </button>
      </div>
      <RevealPopover
        v-if="showMeta && moreTags > 0"
        :open="open"
        :anchor="moreEl"
        v-bind="popoverAttrs"
      >
        <div
          role="group"
          :aria-label="t('library.tags')"
          class="flex flex-wrap gap-1"
        >
          <TagChip
            v-for="tag in allTags"
            :key="tag.key"
            :color="tag.color"
            class="px-2 text-[11px] leading-5"
          >
            {{ tag.label }}
          </TagChip>
        </div>
      </RevealPopover>
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
