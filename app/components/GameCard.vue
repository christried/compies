<script setup lang="ts">
import { Gamepad2, Users } from '@lucide/vue'
import type { RouteLocationRaw } from 'vue-router'
import type { GameView } from '~~/shared/game'
import { youTubeThumbnail } from '~~/shared/youtube'

// A game as a card or a row (02-components § GameCard, #141). The cover is the uploaded image, else the
// clip's YouTube thumbnail, else a neutral placeholder. It is decorative: the name is the text. With `to`
// the name is the link and stretches over the whole card (so `#actions` can hold buttons of their own);
// without it the card is a plain element, not a button. #146 and #148 reuse it.
const props = withDefaults(defineProps<{
  game: Pick<GameView, 'name' | 'imageUrl' | 'youtubeId' | 'playersMin' | 'playersMax' | 'formats'>
  layout?: 'card' | 'row'
  to?: RouteLocationRaw
}>(), { layout: 'card', to: undefined })

const { t } = useI18n()
const NuxtLink = resolveComponent('NuxtLink')

const cover = computed(() => props.game.imageUrl ?? (props.game.youtubeId ? youTubeThumbnail(props.game.youtubeId) : null))
const players = computed(() => {
  const { playersMin: min, playersMax: max } = props.game
  if (min === null && max === null) return null
  return min === max || min === null || max === null ? String(min ?? max) : `${min}–${max}`
})
// Both Formats read as „Beides“ (#142, 02-components § GameCard).
const formats = computed(() => (props.game.formats.length > 1
  ? t('library.formatBoth')
  : props.game.formats.map(format => t(`library.format.${format}`)).join(', ')))
const isRow = computed(() => props.layout === 'row')
</script>

<template>
  <div
    class="relative flex min-w-0 border-(length:--cp-bw) border-line bg-surface shadow-sm"
    :class="isRow ? 'min-h-15 items-center gap-3 rounded-[12px] py-1.5 pr-2.5 pl-1.5' : 'flex-col overflow-hidden rounded-[14px]'"
  >
    <div
      :data-cover="cover ? 'image' : 'placeholder'"
      class="relative grid flex-none place-items-center overflow-hidden border-line bg-paper-2"
      :class="isRow ? 'size-[46px] rounded-[9px] border-2' : 'aspect-[16/10] w-full border-b-2'"
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
        :size="isRow ? 20 : 32"
        class="text-ink-3"
      />
    </div>

    <div
      class="flex min-w-0 flex-col gap-1"
      :class="isRow ? 'flex-1' : 'px-3 pt-2.5 pb-3'"
    >
      <component
        :is="to ? NuxtLink : 'b'"
        :to="to"
        class="leading-tight font-bold text-ink no-underline"
        :class="[
          to ? 'outline-memphis rounded-sm after:absolute after:inset-0 after:block after:content-[\'\']' : '',
          isRow ? 'truncate text-[15px]' : 'line-clamp-2 text-[15px]',
        ]"
      >
        {{ game.name }}
      </component>
      <div
        v-if="players || formats"
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
        <span v-if="formats">{{ formats }}</span>
      </div>
    </div>

    <div
      v-if="$slots.actions"
      class="relative flex flex-none items-center gap-2"
      :class="isRow ? '' : 'px-3 pb-3'"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
