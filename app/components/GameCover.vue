<script setup lang="ts">
import { Gamepad2 } from '@lucide/vue'
import { gameCover } from '~/utils/game-cover'
import type { PoolGameFace } from '~~/shared/game'

// A game's big picture (#141, #443): the library entry's cover and the game dialog's. The uploaded image, else the Clip's YouTube
// thumbnail, else the neutral placeholder. It is decorative: the name beside it is the text. It plays no Clip.
const props = defineProps<{
  game: Pick<PoolGameFace, 'imageUrl' | 'youtubeId'>
}>()

const cover = computed(() => gameCover(props.game))
</script>

<template>
  <img
    v-if="cover"
    :src="cover"
    alt=""
    class="aspect-video w-full rounded-[16px] border-(length:--cp-bw) border-line object-cover shadow-card"
  >
  <div
    v-else
    data-cover="placeholder"
    class="grid aspect-video place-items-center rounded-[16px] border-(length:--cp-bw) border-line shadow-card"
    style="background-image: repeating-linear-gradient(135deg, var(--cp-paper-2) 0 14px, var(--cp-surface) 14px 28px)"
  >
    <AppIcon
      :icon="Gamepad2"
      :size="48"
      class="text-ink-3"
    />
  </div>
</template>
