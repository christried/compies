<script setup lang="ts">
import { Gamepad2, Users } from '@lucide/vue'
import type { RouteLocationRaw } from 'vue-router'
import { formatShortDayYear } from '~/utils/berlin-time'
import { describeGame } from '~/utils/describe-game'
import { gameCover } from '~/utils/game-cover'
import type { GameView, PoolGameFace } from '~~/shared/game'
import { priceLine } from '~/utils/price'
import { notesHasText, type NotesDoc } from '~~/shared/notes-doc'
import { colorTags } from '~~/shared/tag-colors'

// A game as a card or a row (02-components § GameCard, #141). The cover is the uploaded image, else the
// clip's YouTube thumbnail, else a neutral placeholder. It is decorative: the name is the text. With `to`
// the name is the link and stretches over the whole card (so `#actions` can hold buttons of their own);
// without it the card is a plain element, not a button. #146 and #148 reuse it; a game with no player count and no Suitabilities shows neither. `layout="responsive"` (#173) is a row
// below 600 px and a card from 600 px up (sm, #707), decided in CSS, so the game browser needs no `matchMedia`. A library game shows as many Tags as fit in two lines (one in a row) and „+N“ for the rest (#335, #711), each in the colour the game's whole Tag order gives it (#427, as on its page) and its Price line under the meta line (#337, #338: a pool and a Round game carry the Price too); only a wheel slice carries neither. „+N“ is a button above the link, and its popover lists every Tag (#614). They are
// spans, not a list: the tests count the cards as `li`. The picker's rows are these cards too, so they show the Price as well. With `inEvents` (#733) a neutral pill „in 2 Events“
// sits between the Price line and the Tags; it is a count, no Tag, so it is not a `TagChip`, and no control, so it adds no tab stop. With `lastPlayed` (#900) a second pill „zuletzt am 3. Nov. 2026“ sits beside it in the same wrapper (it wraps under it when they do not fit). With `archived` (#726) the same pill reads „Archiviert“ right under the name, tile included.
// The `tile` layout (#435) is the cover and the name only, on the Event page: no players, Suitabilities, Tags or Price, and no link. With `opens` (#443) the
// name is a button that emits `open` (a tile opens the game dialog, #443, #444) and stretches over the tile like the link does; a tile without it stays plain.
// With `notes` and `eventNotes` (#837, #859: the library page and the pickers) a game with a visible note has the Notes button on its cover: a sibling of the name, above it, so it never follows the link or presses the card (as „+N“).
// The card places it by its form: at the cover's top right in the card form and on the tile (#858), at the row's right in the row form (`notes` of LAYOUT). With `notesEditable` (the Event page's Host, #858) its footer „Bearbeiten“ is a button that emits `editNotes`.
const props = withDefaults(defineProps<{
  game: PoolGameFace & Partial<Pick<GameView, 'playersMin' | 'playersMax' | 'suitabilities' | 'tags' | 'price'>>
  layout?: 'card' | 'row' | 'responsive' | 'tile'
  to?: RouteLocationRaw
  /** The name is a button that asks for the game's dialog (#443). Without it, or with `to`, nothing changes. */
  opens?: boolean
  /** In how many of the Host's live Events the game sits in the pool (#733): „in 2 Events“ in a pill of its own; 0 draws nothing. */
  inEvents?: number
  /** The instant of the game's latest Result (#900): a second neutral pill „zuletzt am 3. Nov. 2026“ (the Berlin day); null draws nothing. */
  lastPlayed?: string | null
  /** The Host's pool shows the game as Archived (#726): a pill „Archiviert“ under the name, in every layout. Not read off `game`: the library's cards are GameViews that carry the flag too. */
  archived?: boolean
  /** The game's Game notes (#837): with a visible character the card draws the Notes button, on a tile too (#858). Null or absent: no button, and no wrapper for it. */
  notes?: NotesDoc | null
  /** The Host's Event notes of the game (#859, GLOSSARY: Event notes): with a visible character they count for the button too, and the popover shows them above the Game notes. */
  eventNotes?: NotesDoc | null
  /** Where the Notes popover's footer „Bearbeiten“ leads (#837): the game's form. Absent in the pickers (#859). */
  notesEditTo?: RouteLocationRaw
  /** Some card of the list has Tags (#711): a card without Tags keeps the room of two Tag lines, so every card of the grid is as high. Not in a row, not in the tile. */
  tagsRoom?: boolean
  /** The Notes popover's footer „Bearbeiten“ is a button that asks for the game's dialog in edit mode (#858: the Event page's tiles, for the Host); a caller gives this or `notesEditTo`. */
  notesEditable?: boolean
}>(), { layout: 'card', to: undefined, opens: false, inEvents: 0, lastPlayed: null, archived: false, notes: null, eventNotes: null, notesEditTo: undefined, tagsRoom: false, notesEditable: false })

const emit = defineEmits<{ open: [], editNotes: [] }>()

const { t } = useI18n()
const NuxtLink = resolveComponent('NuxtLink')
const now = new Date()
const priceText = computed(() => (props.game.price ? priceLine(props.game.price, now, t) : null))
const lastPlayedText = computed(() => (props.lastPlayed ? t('library.lastPlayed', { day: formatShortDayYear(new Date(props.lastPlayed)) }) : null))
// The meta lines (players, Suitabilities, Price, Tags) are not part of a tile (#435).
const showMeta = computed(() => props.layout !== 'tile')
// The Notes button (#837, #859, #858): in every layout, and only for a document with a visible character (the one rule, notesHasText), Game or Event notes alike.
const showNotes = computed(() => notesHasText(props.notes) || notesHasText(props.eventNotes))

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
const allTags = computed(() => colorTags(props.game.tags ?? []))
// The Tags fill two lines by their width (one line in a row), the rest sit behind „+N“ (#711). `useTagFit` measures; before it has, every chip is drawn, invisible.
const tagRow = useTemplateRef<HTMLElement>('tagRow')
const tagProbe = useTemplateRef<HTMLElement>('tagProbe')
const { shown, hidden: moreTags, rows: tagLines, cut } = useTagFit(tagRow, tagProbe, computed(() => allTags.value.map(tag => tag.key)))
const shownTags = computed(() => shown.value === null ? allTags.value : allTags.value.slice(0, shown.value))
// „+N“ opens the popover of every Tag by the shared behaviour (#614, #616). It is a sibling of the link, so using it never follows the link.
const more = useTemplateRef<HTMLElement>('more')
const moreEl = computed(() => more.value ?? null)
const { open, triggerAttrs, popoverAttrs } = useRevealPopover(moreEl)

// The „+N“ button's look, shared with the invisible probe that `useTagFit` measures it by (its widest label).
const MORE = 'inline-flex h-6 flex-none items-center rounded-pill border-2 border-transparent px-1.5 text-[12px] leading-5 font-bold text-ink-2'

// The neutral pill of „in 2 Events“ (#733) and „Archiviert“ (#726): text only, no fill swap.
const PILL = 'w-fit max-w-full truncate rounded-pill border-2 border-line bg-paper-2 px-2 text-[11px] leading-5 font-bold text-ink-2'

// One class set per layout; Tailwind needs the strings whole. The responsive set is the row's, undone from 600 px up (sm). `notes` is the Notes button's wrapper (#837): in the row's flow
// before the actions, or on the cover's corner, 4 px in (the card is `relative`, so an absolute child is placed from its padding box, the cover's edge).
// The body grows, so the actions sit on the card's bottom edge in a stretched grid row (#351).
const LAYOUT = {
  row: {
    box: 'min-h-15 items-center gap-3 rounded-[12px] py-1.5 pr-2.5 pl-1.5',
    cover: 'size-[46px] rounded-[9px] border-2',
    body: 'flex-1',
    name: 'truncate',
    actions: '',
    tags: 'h-6',
    tagRow: 'max-h-6 flex-nowrap',
    tagsRoom: '',
    notes: 'relative flex-none',
  },
  card: {
    box: 'flex-col overflow-hidden rounded-[14px]',
    cover: 'aspect-[16/10] w-full border-b-2',
    body: 'flex-auto px-3 pt-2.5 pb-3',
    name: 'line-clamp-2 min-h-[2lh]',
    actions: 'px-3 pb-3',
    // The Tags sit on the card's bottom edge in a block of two lines, fixed whatever they hold, so every card of a row shares their bottom edge and nothing moves when they are fitted (#614, #711).
    // 52 px: two chips of 24 px and the 4 px gap. A card with fewer lines has its spare room above them.
    tags: 'mt-auto h-[52px]',
    tagRow: 'max-h-[52px] flex-wrap content-start',
    tagsRoom: 'mt-auto h-[52px]',
    notes: 'absolute top-1 right-1',
  },
  // The tile fills its grid cell: the grid stretches each cell to its row's tallest tile, so a tile with the pill and one without share the height (#824).
  tile: {
    box: 'h-full flex-col overflow-hidden rounded-[14px]',
    cover: 'aspect-[16/10] w-full border-b-2',
    body: 'px-3 pt-2.5 pb-3',
    name: 'line-clamp-2 break-words min-h-[2lh]',
    actions: '',
    tags: '',
    tagRow: '',
    tagsRoom: '',
    notes: 'absolute top-1 right-1',
  },
  responsive: {
    box: 'min-h-15 items-center gap-3 rounded-[12px] py-1.5 pr-2.5 pl-1.5 sm:min-h-0 sm:flex-col sm:items-stretch sm:gap-0 sm:overflow-hidden sm:rounded-[14px] sm:p-0',
    cover: 'size-[46px] rounded-[9px] border-2 sm:aspect-[16/10] sm:size-auto sm:w-full sm:rounded-none sm:border-0 sm:border-b-2',
    body: 'flex-1 sm:flex-auto sm:px-3 sm:pt-2.5 sm:pb-3',
    name: 'truncate sm:line-clamp-2 sm:min-h-[2lh] sm:whitespace-normal',
    actions: 'sm:px-3 sm:pb-3',
    tags: 'h-6 sm:mt-auto sm:h-[52px]',
    tagRow: 'max-h-6 flex-nowrap sm:max-h-[52px] sm:flex-wrap sm:content-start',
    tagsRoom: 'hidden sm:mt-auto sm:block sm:h-[52px]',
    notes: 'relative flex-none sm:absolute sm:top-1 sm:right-1',
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
      <!-- The two neutral pills (#733, #900): one wrapper, so they sit beside each other when they fit and wrap when they do not; `min-w-0` lets each pill's truncation work. -->
      <div
        v-if="showMeta && (inEvents > 0 || lastPlayedText)"
        class="flex min-w-0 flex-wrap gap-1"
      >
        <span
          v-if="inEvents > 0"
          :class="PILL"
        >{{ t('library.inEvents', { n: inEvents }, inEvents) }}</span>
        <span
          v-if="lastPlayedText"
          :class="PILL"
        >{{ lastPlayedText }}</span>
      </div>
      <div
        v-if="showMeta && allTags.length > 0"
        class="relative flex flex-col justify-end"
        :class="look.tags"
      >
        <div
          ref="tagRow"
          role="group"
          :aria-label="t('library.tags')"
          class="flex gap-1 overflow-hidden"
          :class="look.tagRow"
        >
          <!-- Every chip is drawn, invisible, until the first fit; only a chip the card cuts carries its full word as a tooltip. In a single line the last chip shrinks, so „+N“ keeps its room. -->
          <TagChip
            v-for="(tag, index) in shownTags"
            :key="tag.key"
            data-tag-chip
            :color="tag.color"
            :title="cut[index] ? tag.label : undefined"
            class="max-w-full truncate px-2 text-[11px] leading-5"
            :class="[shown === null ? 'invisible' : '', tagLines === 1 && moreTags > 0 && index === shownTags.length - 1 ? 'min-w-0 shrink' : 'shrink-0']"
          >
            {{ tag.label }}
          </TagChip>
          <button
            v-if="moreTags > 0"
            ref="more"
            type="button"
            class="hit-44 focus-visible:focus-ring"
            :class="MORE"
            :aria-label="t('library.moreTagsLabel', { n: moreTags }, moreTags)"
            v-bind="triggerAttrs"
          >
            {{ t('library.moreTags', { n: moreTags }) }}
          </button>
        </div>
        <!-- The widest „+N“ the game can need, for `useTagFit` to measure: no tab stop, no text for assistive technology. -->
        <span
          ref="tagProbe"
          aria-hidden="true"
          class="pointer-events-none invisible absolute whitespace-nowrap"
          :class="MORE"
        >{{ t('library.moreTags', { n: allTags.length }) }}</span>
      </div>
      <!-- The room of the Tags on a card without any, while some card of the list has them (#711). -->
      <div
        v-else-if="showMeta && tagsRoom && look.tagsRoom"
        aria-hidden="true"
        :class="look.tagsRoom"
      />
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

    <!-- After the body, so it paints above the name's stretched `after:`, and before the actions, which stay the last child (#351). Not in the cover (overflow-hidden) and not in the link. -->
    <div
      v-if="showNotes"
      :class="look.notes"
    >
      <GameNotesButton
        :name="game.name"
        :notes="notes"
        :event-notes="eventNotes"
        :edit-to="notesEditTo"
        :editable="notesEditable"
        @edit="emit('editNotes')"
      />
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
