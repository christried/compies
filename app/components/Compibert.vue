<script setup lang="ts">
import fullSvg from '~/assets/compibert/compibert-full.svg?raw'
import headSvg from '~/assets/compibert/compibert-head.svg?raw'
// The baked stills of the head moods (#819): the same files the bake writes, so there is one copy; the rig and GSAP stay out (ADR 0015).
import confusedSvg from '~~/server/assets/compibert/compibert-head-confused.svg?raw'
import sadSvg from '~~/server/assets/compibert/compibert-head-sad.svg?raw'
import { PARTY_HAT } from '~/utils/compibert-hat'
import { hatPop } from '~/utils/motion'

// The bust is a framed upper-body pose: its round sticker frame is part of the pose, so every use gets it.
// MVP: still poses only (head in the header, full body on the Construction page).
// The animated rig with states and the CompibertBus lands in 1.0 (04-motion § Compibert).
const props = withDefaults(defineProps<{
  variant?: 'head' | 'bust' | 'full'
  /** Width in px; without it the rig fills its container's width. Full is 404 × 344, the crops are square. */
  size?: number
  accessory?: 'hardhat' | 'partyhat'
  /** A baked mood for the head crop on the empty and full-page states (#819): a still, never the rig. Ignored by the other variants and with an accessory. */
  mood?: 'confused' | 'sad'
}>(), { variant: 'head', size: undefined, accessory: undefined, mood: undefined })

const VIEW_BOX = { full: '0 36 404 344', bust: '150 36 254 254', head: '212 40 192 192' }
const ASPECT = { full: '404 / 344', bust: '1', head: '1' }
// Lid rect y for open eyes: −(2·ry + 10), ry = 24.2 (rig mount step 4).
const OPEN_LID = 'translate(0 -58.4)'
// bauhelm.svg as child of compibert-head, in rig coordinates (05-assets).
const HARD_HAT = '<g transform="translate(236 6) scale(.95) rotate(-7 80 66)"><g stroke="#151515" stroke-linejoin="round" fill="#ffd23f"><path d="M24 66 C24 26 52 8 80 8 C108 8 136 26 136 66 Z" stroke-width="6"/><rect x="70" y="9" width="20" height="56" rx="6" stroke-width="4"/><rect x="6" y="60" width="148" height="14" rx="7" stroke-width="6"/></g></g>'

const rootEl = useTemplateRef<HTMLElement>('root')

const uid = useId()

// Outline: light = hard shadow, dark = sticker rim. None for the head crop and below 40 px.
const outlined = computed(() => props.variant !== 'head' && (props.size ?? Infinity) >= 40)

// The mood the head wears, if any: only the plain head crop (a hat sits on the rig's head, not on a baked one).
const mood = computed(() => (props.variant === 'head' && !props.accessory ? props.mood : undefined))

const markup = computed(() => {
  // Each instance needs its own ids for filters and clip paths; element ids would repeat, so they go.
  const prefix = `cb${uid.replace(/\W/g, '')}_`
  let svg = (mood.value ? { confused: confusedSvg, sad: sadSvg }[mood.value] : props.variant === 'head' ? headSvg : fullSvg)
    .replace(/ id="compibert[^"]*"/g, '')
    .replace(/id="cb_/g, `id="${prefix}`)
    .replace(/url\(#cb_/g, `url(#${prefix}`)
    // The baked clip paths are `c0`, `c1` (the bake numbers them).
    .replace(/id="c(\d)/g, `id="${prefix}c$1`)
    .replace(/url\(#c(\d)/g, `url(#${prefix}c$1`)
    .replace(/<rect class="compibert-lid-/g, `<rect transform="${OPEN_LID}" class="compibert-lid-`)
    .replace(/viewBox="[^"]*"/, `viewBox="${VIEW_BOX[props.variant]}" width="100%" height="100%"`)
  if (props.variant === 'bust') svg = svg.replace(/<ellipse class="compibert-shadow"[^>]*><\/ellipse>/, '')
  if (outlined.value) svg = svg.replace('<g class="cb-fig">', `<g class="cb-fig" style="filter:var(--cb-outline)">`)
  if (props.accessory === 'hardhat') svg = svg.replace(/<\/svg>$/, `${HARD_HAT}</svg>`)
  if (props.accessory === 'partyhat') svg = svg.replace(/<\/svg>$/, `${PARTY_HAT}</svg>`)
  return { svg, prefix }
})

// The hat pops once when it appears on an open page (04-motion § Compibert, #38). After the flush: the v-html above is new by then. Mounting with
// the hat, hydration and a re-read that keeps it never pop; the hat going away pops nothing.
watch(() => props.accessory, (now, before) => {
  if (now !== 'partyhat' || before === 'partyhat') return
  const art = rootEl.value?.querySelector('.compibert-hat-art')
  if (art) hatPop(art)
}, { flush: 'post' })
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- the rig is our own static asset, not user content -->
  <span
    ref="root"
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
    :data-mood="mood"
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
/* System twin under the dark media query (#402). */
@media (prefers-color-scheme: dark) {
  [data-theme=system] .compibert {
    --cb-outline: var(--cb-sticker);
  }
}
.compibert > svg {
  display: block;
  overflow: inherit;
}
</style>
