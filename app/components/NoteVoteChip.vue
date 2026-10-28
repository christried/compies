<script setup lang="ts">
import type { VoteValue } from '~~/shared/poll'
import { VOTE_LOOK } from '~/utils/vote-look'

// The Vote as a pill in its word and its cell colour, shared by NotePopover and NoteDialog (02-components § NotePopover).
const props = withDefaults(defineProps<{
  value: VoteValue
  /** The dialog's bigger chip (30 px, 14 px text). */
  large?: boolean
}>(), { large: false })

const { t } = useI18n()
const look = computed(() => VOTE_LOOK[props.value])
</script>

<template>
  <span
    class="inline-flex flex-none items-center gap-1 rounded-pill border-2 border-line px-2 font-extrabold"
    :class="[look.fill, large ? 'h-[30px] text-[14px]' : 'h-6 text-[12px]']"
  >
    <span class="grid size-4 place-items-center rounded-full bg-surface text-ink">
      <AppIcon
        :icon="look.cellIcon"
        :size="10"
      />
    </span>
    {{ t(look.labelKey) }}
  </span>
</template>
