<script setup lang="ts">
import fullSvg from '~/assets/compibert/compibert-full.svg?raw'
import headSvg from '~/assets/compibert/compibert-head.svg?raw'

// The bust is a framed upper-body pose: its round sticker frame is part of the pose, so every use gets it.
// MVP: still poses only (head in the header, full body on the Construction page).
// The animated rig with states and the CompibertBus lands in 1.0 (04-motion § Compibert).
const props = withDefaults(defineProps<{
  variant?: 'head' | 'bust' | 'full'
  /** Width in px; without it the rig fills its container's width. Full is 404 × 344, the crops are square. */
  size?: number
  accessory?: 'hardhat'
}>(), { variant: 'head', size: undefined, accessory: undefined })

const VIEW_BOX = { full: '0 36 404 344', bust: '150 36 254 254', head: '212 40 192 192' }
const ASPECT = { full: '404 / 344', bust: '1', head: '1' }
// Lid rect y for open eyes: −(2·ry + 10), ry = 24.2 (rig mount step 4).
const OPEN_LID = 'translate(0 -58.4)'
// bauhelm.svg as child of compibert-head, in rig coordinates (05-assets).
const HARD_HAT = '<g transform="translate(236 6) scale(.95) rotate(-7 80 66)"><g stroke="#151515" stroke-linejoin="round" fill="#ffd23f"><path d="M24 66 C24 26 52 8 80 8 C108 8 136 26 136 66 Z" stroke-width="6"/><rect x="70" y="9" width="20" height="56" rx="6" stroke-width="4"/><rect x="6" y="60" width="148" height="14" rx="7" stroke-width="6"/></g></g>'

const uid = useId()

// Outline: light = hard shadow, dark = sticker rim. None for the head crop and below 40 px.
const outlined = computed(() => props.variant !== 'head' && (props.size ?? Infinity) >= 40)

const markup = computed(() => {
  // Each instance needs its own ids for filters and clip paths; element ids would repeat, so they go.
  const prefix = `cb${uid.replace(/\W/g, '')}_`
  let svg = (props.variant === 'head' ? headSvg : fullSvg)
    .replace(/ id="compibert[^"]*"/g, '')
    .replace(/id="cb_/g, `id="${prefix}`)
    .replace(/url\(#cb_/g, `url(#${prefix}`)
    .replace(/<rect class="compibert-lid-/g, `<rect transform="${OPEN_LID}" class="compibert-lid-`)
    .replace(/viewBox="[^"]*"/, `viewBox="${VIEW_BOX[props.variant]}" width="100%" height="100%"`)
  if (props.variant === 'bust') svg = svg.replace(/<ellipse class="compibert-shadow"[^>]*><\/ellipse>/, '')
  if (outlined.value) svg = svg.replace('<g class="cb-fig">', `<g class="cb-fig" style="filter:var(--cb-outline)">`)
  if (props.accessory === 'hardhat') svg = svg.replace(/<\/svg>$/, `${HARD_HAT}</svg>`)
  return { svg, prefix }
})
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- the rig is our own static asset, not user content -->
  <span
    class="compibert block flex-none"
    :class="[
      variant === 'full' ? 'overflow-visible' : 'overflow-hidden',
      variant === 'bust' ? 'rounded-full border-(length:--cp-bw) border-line bg-surface shadow-sticker' : '',
    ]"
    :style="{
      'width': size ? `${size}px` : '100%',
      'aspectRatio': ASPECT[variant],
      '--cb-hard': `url(#${markup.prefix}hrd)`,
      '--cb-sticker': `url(#${markup.prefix}stk)`,
    }"
    aria-hidden="true"
    v-html="markup.svg"
  />
</template>

<style>
.compibert {
  --cb-outline: var(--cb-hard);
}
[data-theme=dark] .compibert {
  --cb-outline: var(--cb-sticker);
}
.compibert > svg {
  display: block;
  overflow: inherit;
}
</style>
