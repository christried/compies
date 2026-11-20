<script setup lang="ts">
import { EMOTE_PICTURE } from '~/utils/emote-art'
import { EMOTE_RISE_MS, emoteRise } from '~/utils/motion'
import type { EmoteId } from '~~/shared/emote'

// An Emote rising above its sender's avatar (#668, 02-components § FloatingEmote): the picture, 48 px (this build's pick; the art is 100 × 100 and readable at 32), fixed at
// the avatar button's top edge, so its bottom rests on the avatar and the rise starts 10 px lower. Decoration, so `aria-hidden`. It is a fixed layer of the page and not a
// child of the board, whose zones would clip or cover it and whose avatars glide. It says `done` when its animation ends, or `EMOTE_RISE_MS` + 50 ms after mounting where the
// animation never reports its end (a hidden tab, a test's mocked `animate`): the page then removes it.
const props = defineProps<{
  emote: EmoteId
  /** Whose Emote it is: the data attribute the tests and the browser checks read it by. */
  userId: string
  /** The sender's avatar button on the board (`[data-user-id]`). */
  anchorEl: HTMLElement
}>()
const emit = defineEmits<{ done: [] }>()

// Placed once, at setup: the Emote rises from where the avatar was when it arrived.
const rect = props.anchorEl.getBoundingClientRect()
const place = { left: `${rect.left + rect.width / 2}px`, top: `${rect.top}px` }

const picture = useTemplateRef<HTMLElement>('picture')
let timer: ReturnType<typeof setTimeout> | undefined
let over = false

function end() {
  clearTimeout(timer)
  if (over) return
  over = true
  emit('done')
}

onMounted(() => {
  timer = setTimeout(end, EMOTE_RISE_MS + 50)
  const animation = picture.value ? emoteRise(picture.value) : undefined
  void animation?.finished?.then(end, end)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <span
    aria-hidden="true"
    :data-emote="emote"
    :data-emote-for="userId"
    class="pointer-events-none fixed layer-sticky -translate-x-1/2 -translate-y-full"
    :style="place"
  >
    <img
      ref="picture"
      :src="EMOTE_PICTURE[emote]"
      alt=""
      class="block"
      width="48"
      height="48"
    >
  </span>
</template>
