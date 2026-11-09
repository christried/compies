<script setup lang="ts">
import type { CeremonyPerson } from '~/utils/ceremony'

// One person of a Winner in the Award ceremony (#309, #315, #328): the picture (a Player's avatar, a TeamMark for a Party without Players, or the
// „+N“ circle that counts the rest) and, in a cell, the name under it. Two shapes, as the artboard's `cells(t, s, cell, ns, stack, ov)` draws
// them (Siegerehrung Unentschieden.dc.html): a cell of the single card and the chain has the Team ring, the name and a 2.5 px „+N“ circle at
// 0.3 of the size; the stack on a grid card (`stack`) has no ring and no name, a 2 px circle and a „+N“ at 0.4 of the size. That drift is the
// artboard's, not an accident (review 0.9 S4 and F7). The `<li>` that holds the person stays in AwardCeremony.vue, with its `data-part`, so the
// Pokal-Lauf finds it there. The component adds no element of its own: the picture and the name are its two roots.

const props = withDefaults(defineProps<{
  person: CeremonyPerson
  /** The picture in px: the single card 80 / 64, a chain 56 / 48 / 44, a grid card's stack 28 / 24. */
  size: 24 | 28 | 44 | 48 | 56 | 64 | 80
  /** The name under the picture in px (a cell only): 13 under the single card, the chain's `personNameFontSize`. */
  nameFontSize?: number
  /** In a grid card's stack: no Team ring, no name, the stack's „+N“ (artboard `cells(…, stack)`). */
  stack?: boolean
}>(), { nameFontSize: 13, stack: false })

const { t } = useI18n()

/** The „+N“ circle's border and the share of the size its number takes: a cell 2.5 px and 0.3 (`fs: Math.round(s * .3)`), a stack 2 px and 0.4. */
const more = computed(() => (props.stack ? { border: 'border-2', factor: 0.4 } : { border: 'border-[2.5px]', factor: 0.3 }))
</script>

<template>
  <UserAvatar
    v-if="person.kind === 'player'"
    :name="person.name"
    :image="person.image"
    :team="stack ? null : person.team"
    :size="size"
  />
  <TeamMark
    v-else-if="person.kind === 'mark'"
    :team="person.team"
    :size="size"
  />
  <span
    v-else
    class="box-border grid place-items-center rounded-pill border-line bg-paper-2 font-num text-ink"
    :class="more.border"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * more.factor)}px` }"
  >+{{ person.n }}</span>
  <span
    v-if="!stack"
    class="max-w-full truncate leading-[1.1] font-extrabold"
    :style="{ fontSize: `${nameFontSize}px` }"
  >{{ person.kind === 'more' ? t('ceremony.more', { n: person.n }) : person.name }}</span>
</template>
