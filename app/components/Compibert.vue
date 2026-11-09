<script setup lang="ts">
import fullSvg from '~/assets/compibert/compibert-full.svg?raw'
import headSvg from '~/assets/compibert/compibert-head.svg?raw'
import { hatPop } from '~/utils/motion'

// The bust is a framed upper-body pose: its round sticker frame is part of the pose, so every use gets it.
// MVP: still poses only (head in the header, full body on the Construction page).
// The animated rig with states and the CompibertBus lands in 1.0 (04-motion § Compibert).
const props = withDefaults(defineProps<{
  variant?: 'head' | 'bust' | 'full'
  /** Width in px; without it the rig fills its container's width. Full is 404 × 344, the crops are square. */
  size?: number
  accessory?: 'hardhat' | 'partyhat'
}>(), { variant: 'head', size: undefined, accessory: undefined })

const VIEW_BOX = { full: '0 36 404 344', bust: '150 36 254 254', head: '212 40 192 192' }
const ASPECT = { full: '404 / 344', bust: '1', head: '1' }
// Lid rect y for open eyes: −(2·ry + 10), ry = 24.2 (rig mount step 4).
const OPEN_LID = 'translate(0 -58.4)'
// bauhelm.svg as child of compibert-head, in rig coordinates (05-assets).
const HARD_HAT = '<g transform="translate(236 6) scale(.95) rotate(-7 80 66)"><g stroke="#151515" stroke-linejoin="round" fill="#ffd23f"><path d="M24 66 C24 26 52 8 80 8 C108 8 136 26 136 66 Z" stroke-width="6"/><rect x="70" y="9" width="20" height="56" rx="6" stroke-width="4"/><rect x="6" y="60" width="148" height="14" rx="7" stroke-width="6"/></g></g>'
// partyhut.svg as child of compibert-head (#38, Partyhut.dc.html § 04, 05-assets): the mount's translate sandwich puts the art group's origin at the
// hat base (hat units 40 86), so the pop scales and turns from the brim with plain transforms. Colours are fixed in light and dark (a physical object).
const PARTY_HAT = '<g class="compibert-hat" transform="translate(324.4 56) scale(.7) rotate(15 40 86)"><g transform="translate(40 86)"><g class="compibert-hat-art" stroke-linejoin="round"><g transform="translate(-40 -86)"><path d="M40 20 L67 84 Q40 98 13 84 Z" fill="#ff4f4f"/><path d="M27.3 50 Q37.4 48 45.9 34 L50.1 44 Q40.4 58 23.1 60 Z" fill="#ffd23f"/><path d="M18.1 72 Q38.4 72 55.2 56 L59.4 66 Q37.4 82 13.8 82 Z" fill="#ffd23f"/><path d="M40 20 L67 84 Q40 98 13 84 Z" fill="none" stroke="#151515" stroke-width="8"/><circle cx="40" cy="15" r="11" fill="#ffd23f" stroke="#151515" stroke-width="7"/></g></g></g></g>'

const rootEl = useTemplateRef<HTMLElement>('root')

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
