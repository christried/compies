<script setup lang="ts">
// A person (DS People, Avatar.dc.html): the provider image, or the initial when there is none. With a `team` the
// avatar carries the Team colour as a ring and the team's mark on the rim, bottom left; `lifted` is the avatar in the hand
// while it is dragged on the Game board (#160). `online` (#162) puts the presence dot on the rim, bottom right: online
// is a filled green dot, offline a hollow ring and the picture in grey, so it differs by shape and not by colour alone
// (DS People); undefined means nobody knows yet and shows neither. Decorative: the name next to it carries the
// meaning, and the team and presence are named in text beside it too. The initial is sized by its container (cqw), so a caller can
// resize the avatar with CSS (the board does, 44 px on a desktop and 36 px on a phone). The picture is never dragged as an image,
// so a press on it stays the Game board's drag (#207).
const props = withDefaults(defineProps<{
  name: string
  image?: string | null
  /** 24 for the poll matrix rows (DS People). */
  size?: 24 | 32 | 40 | 48 | 64
  /** The Team colour index, 1 to 8. */
  team?: number | null
  /** Scaled up with the lift shadow, while it is dragged. */
  lifted?: boolean
  /** Has a socket open in the Event's room. Undefined: presence is not known, no dot and no grey. */
  online?: boolean
}>(), { image: null, size: 40, team: null, lifted: false, online: undefined })

const failed = ref(false)
watch(() => props.image, () => failed.value = false)

// Team ring: the Team colour, then the line colour around it (Avatar.dc.html); the lift shadow joins it.
const shadow = computed(() => {
  const ring = props.size >= 40 ? [3, 5] : [2, 4]
  return [
    ...(props.team ? [`0 0 0 ${ring[0]}px var(--cp-team-${props.team})`, `0 0 0 ${ring[1]}px var(--cp-line)`] : []),
    ...(props.lifted ? ['var(--cp-shadow-lift)'] : []),
  ].join(', ') || undefined
})
const badge = computed(() => Math.max(14, Math.round(props.size * 0.4)))

// The presence dot (Avatar.dc.html): 28 % of the avatar, at least 9 px, and a little further out when a team ring is there.
const dot = computed(() => {
  const offset = props.team ? -Math.round(props.size * 0.06) - 2 : -Math.round(props.size * 0.02)
  return {
    width: `${Math.max(9, Math.round(props.size * 0.28))}px`,
    height: `${Math.max(9, Math.round(props.size * 0.28))}px`,
    right: `${offset}px`,
    bottom: `${offset}px`,
  }
})
</script>

<template>
  <span
    class="relative inline-block flex-none [container-type:inline-size]"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    <span
      class="absolute inset-0 grid place-items-center overflow-hidden rounded-pill border-line bg-paper-2 font-extrabold text-ink"
      :class="[size >= 40 ? 'border-[2.5px]' : 'border-2', lifted ? 'scale-[1.06]' : '', online === false ? 'grayscale' : '']"
      :style="{ fontSize: '44cqw', boxShadow: shadow }"
    >
      <img
        v-if="image && !failed"
        :src="image"
        alt=""
        draggable="false"
        class="size-full object-cover"
        referrerpolicy="no-referrer"
        @error="failed = true"
      >
      <template v-else>{{ [...name][0]?.toUpperCase() }}</template>
    </span>
    <span
      v-if="team"
      class="absolute -bottom-1.5 -left-1.5 grid"
    >
      <TeamMark
        :team="team"
        :size="badge"
      />
    </span>
    <span
      v-if="online !== undefined"
      class="absolute box-border rounded-pill"
      :class="online ? 'border-2 border-line bg-online' : 'border-[2.5px] border-offline bg-surface'"
      :style="dot"
      :data-presence="online ? 'online' : 'offline'"
    />
  </span>
</template>
