<script setup lang="ts">
import { Clock, Euro, Swords, Tag, Users } from '@lucide/vue'
import { describeGame } from '~/utils/describe-game'
import { priceLine } from '~/utils/price'
import type { GameTag, PoolGame } from '~~/shared/game'
import { colorTags } from '~~/shared/tag-colors'

// A game's facts as pills and its Tags as chips (screen 23 `?s=detail` #141, #142, #335, #337, #427): the library entry's and the game dialog's (#443).
// Two lists, a fragment: the pills (the spelled-out player count, the Suitabilities, the Clip length when given, the Price) and the Tags, each in its colour.
// A part the game lacks is absent, with no empty list. The Clip pill is the library entry's: the dialog passes no `clipLength`, and a Member's passes no Tags.
const props = withDefaults(defineProps<{
  game: Pick<PoolGame, 'playersMin' | 'playersMax' | 'suitabilities' | 'price'>
  tags?: GameTag[]
  /** The Clip's length in seconds; the Clip pill shows only when it is set. */
  clipLength?: number | null
}>(), { tags: () => [], clipLength: null })

const { t } = useI18n()

// The player count (spelled out) and the Suitabilities as facts (#142, #171).
const description = computed(() => describeGame(props.game, t))
const players = computed(() => description.value.players)
const suitabilities = computed(() => description.value.suitabilities)
// The Price line as a fact, like the card's (#337); `now` is read here, so the year shows only for another year.
const priceText = computed(() => (props.game.price ? priceLine(props.game.price, new Date(), t) : null))
const tagChips = computed(() => colorTags(props.tags))
</script>

<template>
  <ul
    v-if="players || suitabilities || clipLength !== null || game.price"
    class="m-0 flex list-none flex-wrap gap-2 p-0"
  >
    <li
      v-if="players"
      class="inline-flex h-8 items-center gap-1.5 rounded-pill border-2 border-line bg-surface px-3 text-[13px] font-bold"
    >
      <AppIcon
        :icon="Users"
        :size="14"
      />
      {{ players }}
    </li>
    <li
      v-if="suitabilities"
      class="inline-flex h-8 items-center gap-1.5 rounded-pill border-2 border-line bg-surface px-3 text-[13px] font-bold"
    >
      <AppIcon
        :icon="Swords"
        :size="14"
      />
      {{ suitabilities }}
    </li>
    <li
      v-if="clipLength !== null"
      class="inline-flex h-8 items-center gap-1.5 rounded-pill border-2 border-line bg-surface px-3 text-[13px] font-bold"
    >
      <AppIcon
        :icon="Clock"
        :size="14"
      />
      {{ t('library.clipFact', { n: clipLength }) }}
    </li>
    <!-- The price line can be long („19,99 € bei Epic Games Store · Stand 3. Nov. 2025“): the pill wraps instead of a fixed height (#337). -->
    <li
      v-if="priceText"
      class="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-pill border-2 border-line bg-surface px-3 py-1 text-[13px] font-bold"
    >
      <AppIcon
        :icon="Euro"
        :size="14"
      />
      {{ priceText }}
    </li>
  </ul>
  <ul
    v-if="tags.length > 0"
    :aria-label="t('library.tags')"
    class="m-0 flex list-none flex-wrap gap-2 p-0"
  >
    <TagChip
      v-for="tag in tagChips"
      :key="tag.key"
      as="li"
      :color="tag.color"
      class="inline-flex h-8 max-w-full items-center gap-1.5 px-3 text-[13px]"
    >
      <AppIcon
        :icon="Tag"
        :size="14"
      />
      <span class="truncate">{{ tag.label }}</span>
    </TagChip>
  </ul>
</template>
