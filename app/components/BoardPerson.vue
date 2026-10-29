<script setup lang="ts">
import { Crown } from '@lucide/vue'

// One Member on the Game board: avatar and name, a button that opens the MoveToMenu (Enter or click) and that
// the GameBoard makes draggable through its pointer handlers (#160, 02-components § GameBoard). Everyone's person is
// a button, because the menu explains to a Player why they cannot move somebody else. `lifted` is the person in the hand.
const props = defineProps<{
  userId: string
  name: string
  image: string | null
  isHost: boolean
  /** The viewer's own person: shown as „Du“. */
  you: boolean
  /** Where they stand, for the accessible name („Kitty, Team Rot“). */
  where: string
  lifted: boolean
  /** The MoveToMenu of this person is open. */
  menuOpen: boolean
  /** Can be picked up by the viewer. */
  draggable: boolean
}>()

const { t } = useI18n()
const shown = computed(() => (props.you ? t('common.you') : props.name))
</script>

<template>
  <button
    type="button"
    class="relative flex min-w-0 touch-manipulation flex-col items-center gap-1 rounded-md p-1 text-ink select-none [-webkit-touch-callout:none]"
    :class="[draggable ? 'cursor-grab' : 'cursor-pointer', lifted ? 'layer-sticky cursor-grabbing' : '']"
    :data-user-id="userId"
    :aria-label="t('board.personAria', { name, where })"
    aria-haspopup="menu"
    :aria-expanded="menuOpen"
    :title="t('board.dragHint')"
  >
    <UserAvatar
      :name="name"
      :image="image"
      :size="40"
      :lifted="lifted"
    />
    <span
      class="flex max-w-full items-center gap-1 text-[13px] leading-tight"
      :class="you ? 'font-extrabold' : 'font-semibold'"
    >
      <AppIcon
        v-if="isHost"
        :icon="Crown"
        :size="12"
      />
      <span class="truncate">{{ shown }}</span>
    </span>
  </button>
</template>
