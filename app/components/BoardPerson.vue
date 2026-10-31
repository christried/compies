<script setup lang="ts">
import { Crown } from '@lucide/vue'
import { popIn } from '~/utils/motion'

// One Member on the Game board: avatar and name, a button that opens the MoveToMenu (Enter or click) and that
// the GameBoard makes draggable through its pointer handlers (#160, 02-components § GameBoard). Everyone's person is
// a button, because the menu explains to a Player why they cannot move somebody else. `lifted` is the person in the hand.
// The avatar is 44 px on a desktop and 36 px on a phone (11-event-seite § GameBoard); in a team it carries the team's ring and mark. A
// Team word (#161) shows as a small chip under it and pops in when it arrives.
const props = withDefaults(defineProps<{
  userId: string
  name: string
  image: string | null
  isHost: boolean
  /** The viewer's own person: shown as „Du“. */
  you: boolean
  /** The team they stand in, for the ring; null on the Bench and the Stands. */
  team: number | null
  /** Where they stand, for the accessible name („Kitty, Team Rot“). */
  where: string
  lifted: boolean
  /** Online in the Event's room (#162); undefined while presence is not known. */
  online?: boolean
  /** The MoveToMenu of this person is open. */
  menuOpen: boolean
  /** Can be picked up by the viewer. */
  draggable: boolean
  /** The Player's Team word, shown as a chip under the avatar (#161). */
  word?: string | null
}>(), { word: null })

const { t } = useI18n()
const wordChip = useTemplateRef<HTMLElement>('wordChip')
watch(() => props.word, async (word, before) => {
  if (!word || word === before) return
  await nextTick()
  if (wordChip.value) popIn(wordChip.value)
})
const shown = computed(() => (props.you ? t('common.you') : props.name))
// The accessible name: „Kitty, Team Rot“, and „Kitty, Team Rot, online“ once presence is known (DS People).
const label = computed(() => t(props.online === undefined ? 'board.personAria' : props.online ? 'board.personAriaOnline' : 'board.personAriaOffline', { name: props.name, where: props.where }))
</script>

<template>
  <button
    type="button"
    class="relative flex w-12 touch-manipulation flex-col items-center gap-1 rounded-md pt-1 text-ink select-none [-webkit-touch-callout:none] md:w-[60px]"
    :class="[draggable ? 'cursor-grab' : 'cursor-pointer', lifted ? 'layer-sticky cursor-grabbing' : '']"
    :data-user-id="userId"
    :aria-label="label"
    aria-haspopup="menu"
    :aria-expanded="menuOpen"
    :title="t('board.dragHint')"
  >
    <UserAvatar
      class="max-md:!size-9 md:!size-11"
      :name="name"
      :image="image"
      :size="48"
      :team="team"
      :lifted="lifted"
      :online="online"
    />
    <span
      class="flex max-w-full items-center gap-0.5 text-[12px] leading-tight"
      :class="you ? 'font-extrabold' : 'font-semibold'"
    >
      <AppIcon
        v-if="isHost"
        :icon="Crown"
        :size="11"
      />
      <span class="truncate">{{ shown }}</span>
    </span>
    <span
      v-if="word"
      ref="wordChip"
      class="-mt-0.5 max-w-full truncate rounded-[6px] border-[1.5px] border-line bg-paper-2 px-1.5 text-[10px] leading-snug font-extrabold"
    >{{ word }}</span>
  </button>
</template>
