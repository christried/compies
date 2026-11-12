<script setup lang="ts">
import { GAME_GRID } from '~/utils/game-grid'
import { reducedMotion } from '~/utils/motion'
import { SCRAMBLE_FRAME_MS, finalAngle, removalEase, removalEnd, revealStage, scramble, sliceSpans, wheelAngle, type WheelTiming } from '~/utils/wheel'
import { BULB_RADIUS, FLAPPER_HINGE, FLAPPER_PLACEMENT, PIN_RADIUS, PIN_RING_RADIUS, WHEEL_COLOURS, WHEEL_FILLS, bulbPoints, pinAngles, wheelPoint } from '~/utils/wheel-look'
import { bulbsLit } from '~/utils/wheel-bulbs'
import { flapperKick, pinCrossings } from '~/utils/wheel-pins'
import { cardPop, labelPop } from '~/utils/wheel-stop'
import { stopReached } from '~~/shared/draw-timeline'
import type { HostGameFacts } from '~~/shared/game'
import type { WheelView } from '~~/shared/stage'
import { characterCount, cutToCharacters } from '~~/shared/text'
import { refillAt, refillPlan, type RefillPlan, type RestSlice } from '~/utils/wheel-refill'

// The Lucky Wheel on the stage (#229, 02-components § LuckyWheel, 04-motion § Lucky Wheel, reference App Spielrunde ?s=wheel).
// It shows the games left on the wheel and, from the server's spin, turns toward a fixed stop: the angle is a function of the
// server's clock alone (utils/wheel.ts), so every device, a late joiner included, stands at the same angle at the same moment. The
// server ticker (useServerTicker) feeds it the server time every frame while a spin runs and shortly past its removal; at rest, and
// while the wheel is scrolled out of view, nothing runs.
// At the stop the drawn slice gets its outline, its label pops and the result card pops in (#523, utils/wheel-stop.ts: both are a function
// of the server time since the stop, so a late joiner sees the end state). Under a Hidden wheel a Member sees placeholders; the
// drawn label turns into the real game half a second after the stop (a scramble, under reduced motion a crossfade), and the
// drawn slice leaves at stop + 2.8 s instead of 2.2 s. The drawn slice shrinks and the others close the gap (0.6 s), or fade and
// jump under reduced motion. Since 0.13.2 (#519, spec #503) the wheel is drawn as the Show-Rad: a red band with a rim of 24 bulbs, a pin
// at every slice edge, a flapper at the top, in fixed colours (a stage piece, the same in Hell and Dunkel: utils/wheel-look.ts). The
// bulbs light by server time (#521) and the flapper kicks at every pin that passes the top (#522, utils/wheel-pins.ts); Compibert and
// the sounds come with 0.13.3. When the games change at rest (a put back, the Game pool), the slices move together over 0.6 s and a new
// slice pops in (#524, utils/wheel-refill.ts): on the page's own clock from the moment the data arrives, never during a spin.
// The wheel is 340 px at most on a phone and 420 px from md up, and never changes size during a spin.
const props = withDefaults(defineProps<{
  wheel: WheelView
  /** The Event's Hidden wheel setting: it delays the drawn slice's removal for every viewer alike, so the devices stay in step. */
  hidden: boolean
  isHost: boolean
  /** The server's time in epoch ms (useServerClock). */
  serverNow: () => number
  /** The Tags and Notes of the games, for the Host's game dialog on the drawn game's tile (#443); null for every other Member. */
  hostGames?: Record<string, HostGameFacts> | null
}>(), { hostGames: null })

const { t } = useI18n()

/** How long past the stop the loop keeps running: the removal ends at 2.8 s + 0.6 s on a Hidden wheel. */
const TAIL_MS = 100
const RADIUS = 180
const HUB_RADIUS = 22
const LABEL_MAX = 22
/** The run a label has from its end (RADIUS - 12) to the hub's rim plus 4 units (#263), and the width of a glyph at weight 800 in em (an estimate). */
const LABEL_RUN = RADIUS - 12 - HUB_RADIUS - 4
const GLYPH_EM = 0.66
/** The Show-Rad's fixed colours, the bulbs' places and the rim's sizes (#519): utils/wheel-look.ts. */
const COLOURS = WHEEL_COLOURS
const BULBS = bulbPoints()
/** The flapper's shape in its local box (the reference's `pFlap`): a blade and its round head, drawn twice, once as the hard shadow. */
const FLAP_BLADE = 'M15 10 22 54 29 10Z'

const reduced = ref(false)

const spin = computed(() => props.wheel.spin)
const timing = computed((): WheelTiming | null => {
  const current = spin.value
  return current && { spinStartAt: Date.parse(current.spinStartAt), stopAt: Date.parse(current.stopAt), slices: current.slices, resultIndex: current.resultIndex, resultOffset: current.resultOffset }
})
/** The server time of this frame; null before the page has mounted, so the server's render and the first client render agree. */
const rootEl = useTemplateRef('root')
const clock = useServerTicker(() => props.serverNow(), {
  until: () => (timing.value ? removalEnd(timing.value, props.hidden) + TAIL_MS : null),
  target: rootEl,
})
/** Whether the spin's own layout is on screen: from the commit until the drawn slice has left. */
const running = computed(() => timing.value !== null && clock.value !== null && clock.value < removalEnd(timing.value, props.hidden))
const stopped = computed(() => timing.value !== null && clock.value !== null && stopReached(timing.value, clock.value))

// Whether the User prefers reduced motion is read at mount and for each new spin.
onMounted(() => void (reduced.value = reducedMotion()))
watch(() => spin.value?.drawId, () => void (reduced.value = reducedMotion()))

/**
 * The bulbs' own clock (#521): it runs at rest too, for as long as the wheel is in view and motion is not reduced, since the bulbs blink
 * at rest. `clock` above stays as it is, so a finished moment (the removal, the pops, the flapper) never flips back on a resync.
 */
const lampClock = useServerTicker(() => props.serverNow(), {
  until: () => (reduced.value ? null : Number.POSITIVE_INFINITY),
  target: rootEl,
})

// A change of the games at rest (#524): the slices of the resting wheel, each with the key that tells it from the others across the change. A
// viewer who has the slices keys them by the game's id; a Member under a Hidden wheel has only the count, so the key is the slot's number and
// nothing of the pool reaches the plan that the server did not send. The keys are never rendered.
const restSlices = computed((): RestSlice[] => props.wheel.slices
  ? props.wheel.slices.map(slice => ({ key: slice.id, name: slice.name }))
  : Array.from({ length: props.wheel.count }, (_, index) => ({ key: `slot-${index}`, name: t('wheel.placeholderQ') })))
/** The slices the last change was measured against; set at setup, so a page opened after a change plays nothing. */
let baseline = restSlices.value
const refill = shallowRef<{ plan: RefillPlan, startedAt: number } | null>(null)
// A change while a spin runs (its commit takes the drawn game off the wheel: the count falls by one) or its removal plays nothing: the
// baseline moves to the new data silently and the wheel shows it as soon as the removal is over. At rest, a change starts a plan; a second
// change inside the first starts from the layout the first one ends in.
watch([restSlices, running], ([next, isRunning]) => {
  const previous = baseline
  baseline = next
  if (isRunning) {
    refill.value = null
    return
  }
  const plan = refillPlan(previous, next, reducedMotion())
  if (plan) refill.value = { plan, startedAt: performance.now() }
})
// The local clock: the app's frame ticker with this page's own time, not the server's (the refill answers a change of data, not a moment the
// server sets, ADR 0013). `ready` is true at once, since it does not wait for the Event page's server clock. It stops itself at the plan's end
// and, out of view or in a hidden tab, reads again on return: the plan has then run out unseen and the final layout shows, with no replay.
const refillClock = useServerTicker(() => performance.now(), {
  ready: () => true,
  until: () => (refill.value ? refill.value.startedAt + refill.value.plan.ms : null),
  target: rootEl,
})
const refilling = computed(() => {
  const current = refill.value
  if (!current || running.value || refillClock.value === null) return null
  const elapsed = refillClock.value - current.startedAt
  return elapsed < current.plan.ms ? refillAt(current.plan, elapsed) : null
})
/** Only under reduced motion does the refill fade: the rotor then rises from 0 to 1 (the layout itself jumps). */
const refillOpacity = computed(() => (refilling.value && refilling.value.opacity < 1 ? refilling.value.opacity : undefined))

// The wheel as drawn: the spin's slices while it runs, else the games left on the wheel (a Member under a Hidden wheel sees ???).
const count = computed(() => (running.value ? spin.value!.slices : props.wheel.count))
const spans = computed(() => {
  const current = timing.value
  if (running.value && current) return sliceSpans(current.slices, current.resultIndex, removalEase(current, clock.value!, props.hidden, reduced.value))
  return refilling.value ? refilling.value.slices : sliceSpans(count.value, -1, 0)
})
const names = computed(() => {
  if (running.value) return spin.value!.labels ?? Array.from({ length: count.value }, () => t('wheel.placeholderQ'))
  if (refilling.value) return refilling.value.slices.map(slice => slice.name)
  return props.wheel.slices ? props.wheel.slices.map(slice => slice.name) : Array.from({ length: count.value }, () => t('wheel.placeholderQ'))
})

/** The wheel rests where the last spin stopped (a multiple of a full turn off the final angle); 0 before the first one. */
const angle = computed(() => {
  const current = timing.value
  if (!current || clock.value === null) return 0
  // + 0 turns a -0 into 0 (utils/wheel.ts wheelAngle does the same for the spin).
  return (running.value ? wheelAngle(current, clock.value, reduced.value) : finalAngle(current) % 360) + 0
})

// The drawn label under a Hidden wheel (a Member's): the placeholder until 0.5 s after the stop, then it turns into the game.
// The read that follows the stop already carries the real name there, so the placeholder is kept from the read before it.
const concealed = computed(() => props.hidden && !props.isHost)
const held = ref<{ drawId: string, labels: string[] } | null>(null)
// The server's time is read here, not the ticker's: out of view the ticker stands still (#257), and a read that brings the real name
// while the wheel is scrolled away would still count as „before the stop“.
watchEffect(() => {
  const current = spin.value
  if (current?.labels && concealed.value && timing.value && clock.value !== null && !stopReached(timing.value, props.serverNow())) held.value = { drawId: current.drawId, labels: current.labels }
})

function labelOf(index: number): { text: string, opacity: number } {
  const text = names.value[index] ?? ''
  const current = timing.value
  if (!running.value || !concealed.value || !current || index !== current.resultIndex) return { text, opacity: 1 }
  const stage = revealStage(current, clock.value!, reduced.value)
  if (stage.stage === 'real') return { text, opacity: 1 }
  if (stage.stage === 'placeholder') return { text: held.value?.drawId === spin.value!.drawId ? held.value.labels[index] ?? t('wheel.placeholderQ') : t('wheel.placeholderQ'), opacity: 1 }
  return reduced.value ? { text, opacity: stage.progress } : { text: scramble(text, Math.floor(stage.progress * (300 / SCRAMBLE_FRAME_MS))), opacity: 1 }
}

const shortened = (text: string) => (characterCount(text) > LABEL_MAX ? `${cutToCharacters(text, LABEL_MAX - 1)}…` : text)
const fontSize = computed(() => Math.max(10, Math.min(19, 230 / Math.max(count.value, 1) + 6)))
/** A label's size: the slice's size, or less so the shortened text fits the run from the rim to the hub; the hub would cover a long name (#263). */
const labelSize = (text: string) => Math.max(9, Math.min(fontSize.value, Math.floor(LABEL_RUN / (characterCount(text) * GLYPH_EM))))

/** A point on the wheel `degrees` clockwise from the top. */
function point(degrees: number, radius: number): string {
  const { x, y } = wheelPoint(degrees, radius)
  return `${x.toFixed(2)},${y.toFixed(2)}`
}
function pathOf({ start, end }: { start: number, end: number }): string {
  if (end - start < 0.01) return ''
  if (end - start >= 359.99) return `M200,${200 - RADIUS}A${RADIUS},${RADIUS} 0 1 1 200,${200 + RADIUS}A${RADIUS},${RADIUS} 0 1 1 200,${200 - RADIUS}Z`
  return `M200,200L${point(start, RADIUS)}A${RADIUS},${RADIUS} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end, RADIUS)}Z`
}
// The last slice takes the surface colour when it would otherwise share the first one's fill (#263): a single slice has no neighbour, so it keeps the first fill.
// During a refill a slice takes the fill of its place in the new layout (in the old one while it leaves), so no colour changes at the end.
function fillOf(slot: number) {
  const slice = refilling.value?.slices[slot]
  const index = slice ? slice.fillIndex : slot
  const total = slice ? slice.fillCount : count.value
  return total > 1 && index === total - 1 && total % WHEEL_FILLS.length === 1 ? COLOURS.paper : WHEEL_FILLS[index % WHEEL_FILLS.length]
}

// The Show-Rad's still defaults (#519); each is a function of the server's clock once its ticket fills it, and the template reads only these.
/** A pin at every slice edge, drawn in the rotor from the one place that works the positions out (utils/wheel-look.ts). */
const pins = computed(() => pinAngles(spans.value).map(degrees => wheelPoint(degrees, PIN_RING_RADIUS)))
/**
 * Which of the 24 bulbs are lit (#521): a function of the server time alone (utils/wheel-bulbs.ts). The lamp clock ticks every frame, so the
 * same array comes back while the lit set is unchanged and the wheel renders only when a bulb switches (every 0.6 s at rest).
 */
const litBulbs = computed((previous?: boolean[]): boolean[] => {
  const next = bulbsLit(timing.value, lampClock.value, reduced.value)
  return previous && previous.every((lit, index) => lit === next[index]) ? previous : next
})
/** The pins' crossings of this spin: worked out once, when the spin changes (utils/wheel-pins.ts); not for reduced motion, which has no kicks (#522). */
const crossings = computed(() => (timing.value && !reduced.value ? pinCrossings(timing.value) : []))
/** The flapper's angle in degrees about its hinge, SVG sense (positive turns clockwise): a kick at every pin that passes, a function of the server's clock alone (#522). */
const flapperAngle = computed((): number => (running.value && clock.value !== null ? flapperKick(crossings.value, clock.value, reduced.value) : 0))

/** The drawn slice has its outline from the stop on, until it leaves. */
const winner = computed(() => (running.value && stopped.value && timing.value ? timing.value.resultIndex : -1))
/** How far the drawn slice has faded under reduced motion (the redistribution then jumps). */
const drawnOpacity = computed(() => {
  const current = timing.value
  if (!current || !running.value || !reduced.value || clock.value === null) return 1
  return removalEase(current, clock.value, props.hidden, true) === 1 ? 0 : 1
})

// The pops at the stop (#523): the time since the stop from the server's clock, null before it. The pop functions clamp it to their run, so a
// late joiner or a returning tab reads the end state at once, and nothing here compares with the stop itself (`stopped` is the one gate).
const stopElapsed = computed(() => (stopped.value && clock.value !== null && timing.value ? clock.value - timing.value.stopAt : null))
const cardStyle = computed(() => {
  if (!card.value || stopElapsed.value === null) return undefined
  const { scale, opacity } = cardPop(stopElapsed.value, reduced.value)
  return { transform: `scale(${scale})`, opacity: String(opacity) }
})
/** Only the drawn label pops. Its scaleY pivots on its own centre line in the rotated frame (its y is 200 before the rotation). */
const isDrawn = (index: number) => index === winner.value && stopElapsed.value !== null
function labelTransform(index: number): string {
  const scale = isDrawn(index) ? labelPop(stopElapsed.value!, reduced.value).scaleY : 1
  const span = spans.value[index]!
  return `rotate(${(span.start + span.end) / 2 - 90} 200 200) translate(0 200) scale(1 ${scale}) translate(0 -200)`
}
/** The Hidden reveal's crossfade times the pop's opacity (reduced motion fades the drawn label in). */
const labelOpacity = (index: number) => labelOf(index).opacity * (isDrawn(index) ? labelPop(stopElapsed.value!, reduced.value).opacity : 1)

// The result card names the game only while its spin is the latest draw (a later set, a veto or a put back takes it away, F6); a vetoed
// game is then named in the Veto window's outcome line only.
const card = computed(() => (stopped.value && spin.value?.current && spin.value.game ? spin.value.game : null))
const status = computed(() => {
  if (timing.value && clock.value !== null && !stopReached(timing.value, clock.value)) return t('wheel.spinning')
  return count.value === 0 ? t('wheel.empty') : null
})
const headingId = useId()
</script>

<template>
  <section
    ref="root"
    :aria-labelledby="headingId"
    class="flex flex-col items-center gap-3 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-4 text-ink"
  >
    <div class="flex w-full items-baseline justify-between gap-3">
      <h2
        :id="headingId"
        class="m-0 font-display text-[22px] leading-tight font-normal"
      >
        {{ t('wheel.title') }}
      </h2>
      <p
        v-if="status"
        class="m-0 text-[14px] font-bold text-ink-2"
      >
        {{ status }}
      </p>
    </div>

    <!-- The disc is the Show-Rad (#519): a stage piece in fixed colours, hooked for the Dunkel-Check (scripts/browser/dark-read.mjs). The top margin
         clears the flapper, which hangs past the box's top edge; the shadow reaches past its right and bottom edge, inside the card's padding. -->
    <div
      data-testid="wheel-disc"
      class="relative mt-4 aspect-square w-full max-w-[340px] md:max-w-[420px]"
    >
      <svg
        viewBox="0 0 400 400"
        role="img"
        :aria-label="t('wheel.aria', { n: count }, count)"
        class="size-full overflow-visible"
      >
        <g aria-hidden="true">
          <!-- The wheel's hard shadow, the backing disc (what an empty wheel and the last slice's surface fill show) and the red band with its outline. -->
          <circle
            cx="207"
            cy="208"
            r="204"
            :fill="COLOURS.ink"
          />
          <circle
            cx="200"
            cy="200"
            :r="RADIUS"
            :fill="COLOURS.paper"
          />
          <circle
            cx="200"
            cy="200"
            r="190"
            fill="none"
            :stroke="COLOURS.red"
            stroke-width="22"
          />
          <circle
            cx="200"
            cy="200"
            r="201"
            fill="none"
            :stroke="COLOURS.ink"
            stroke-width="3.5"
          />
        </g>
        <g
          data-testid="wheel-rotor"
          :style="{ transform: `rotate(${angle}deg)`, transformOrigin: '200px 200px', opacity: refillOpacity }"
        >
          <template
            v-for="(span, index) in spans"
            :key="index"
          >
            <path
              v-if="pathOf(span) !== ''"
              data-testid="wheel-slice"
              :d="pathOf(span)"
              :fill="fillOf(index)"
              :stroke="COLOURS.ink"
              :stroke-width="winner === index ? 7 : 3"
              stroke-linejoin="round"
              :opacity="winner === index ? drawnOpacity : 1"
            />
            <text
              v-if="pathOf(span) !== '' && span.end - span.start > 4"
              :data-testid="`wheel-label-${index}`"
              :transform="labelTransform(index)"
              :x="200 + RADIUS - 12"
              y="200"
              text-anchor="end"
              dominant-baseline="central"
              :font-size="labelSize(shortened(labelOf(index).text))"
              font-weight="800"
              :fill="COLOURS.ink"
              :opacity="labelOpacity(index)"
            >{{ shortened(labelOf(index).text) }}</text>
          </template>
          <!-- The pins sit on the slice edges, last in the rotor so they turn with it and lie over the outlines. -->
          <g
            data-testid="wheel-pins"
            aria-hidden="true"
          >
            <circle
              v-for="(pin, index) in pins"
              :key="index"
              data-testid="wheel-pin"
              :cx="pin.x.toFixed(2)"
              :cy="pin.y.toFixed(2)"
              :r="PIN_RADIUS"
              :fill="COLOURS.cream"
              :stroke="COLOURS.ink"
              stroke-width="2.5"
            />
          </g>
        </g>
        <g aria-hidden="true">
          <!-- What stands still over the rotor: the rim ring and the hub with its hard shadow. -->
          <circle
            cx="200"
            cy="200"
            :r="RADIUS"
            fill="none"
            :stroke="COLOURS.ink"
            stroke-width="5"
          />
          <circle
            cx="204"
            cy="204"
            :r="HUB_RADIUS"
            :fill="COLOURS.ink"
          />
          <circle
            cx="200"
            cy="200"
            :r="HUB_RADIUS"
            :fill="COLOURS.red"
            :stroke="COLOURS.ink"
            stroke-width="4"
          />
        </g>
        <!-- The 24 bulbs on the band (#521 lights them by server time). They stand still. -->
        <g
          data-testid="wheel-bulbs"
          aria-hidden="true"
        >
          <circle
            v-for="(bulb, index) in BULBS"
            :key="index"
            data-testid="wheel-bulb"
            :data-lit="litBulbs[index] ? 'true' : 'false'"
            :cx="bulb.x.toFixed(2)"
            :cy="bulb.y.toFixed(2)"
            :r="BULB_RADIUS"
            :fill="litBulbs[index] ? COLOURS.bulbLit : COLOURS.bulbUnlit"
            :stroke="COLOURS.ink"
            stroke-width="2"
          />
        </g>
        <!-- The flapper at the top, in place of the pointer: it stays where it is while the wheel turns, and only its arm will move (#522). -->
        <g
          data-testid="wheel-flapper"
          aria-hidden="true"
          :transform="FLAPPER_PLACEMENT"
        >
          <g
            data-testid="wheel-flapper-arm"
            :transform="`rotate(${flapperAngle} ${FLAPPER_HINGE.x} ${FLAPPER_HINGE.y})`"
          >
            <!-- Its hard shadow, the same shape offset by (3, 3), drawn as shapes: a CSS filter on an inner SVG element draws badly in Safari. -->
            <g transform="translate(3 3)">
              <path
                :d="FLAP_BLADE"
                :fill="COLOURS.ink"
                :stroke="COLOURS.ink"
                stroke-width="3.5"
                stroke-linejoin="round"
              />
              <circle
                :cx="FLAPPER_HINGE.x"
                :cy="FLAPPER_HINGE.y"
                r="10"
                :fill="COLOURS.ink"
                :stroke="COLOURS.ink"
                stroke-width="3.5"
                stroke-linejoin="round"
              />
            </g>
            <path
              :d="FLAP_BLADE"
              :fill="COLOURS.flapper"
              :stroke="COLOURS.ink"
              stroke-width="3.5"
              stroke-linejoin="round"
            />
            <circle
              :cx="FLAPPER_HINGE.x"
              :cy="FLAPPER_HINGE.y"
              r="10"
              :fill="COLOURS.flapper"
              :stroke="COLOURS.ink"
              stroke-width="3.5"
              stroke-linejoin="round"
            />
            <circle
              :cx="FLAPPER_HINGE.x"
              :cy="FLAPPER_HINGE.y"
              r="3.5"
              :fill="COLOURS.ink"
            />
          </g>
        </g>
      </svg>
    </div>

    <div
      v-if="card"
      data-testid="wheel-card"
      :style="cardStyle"
      class="flex w-full max-w-[420px] flex-col gap-2 rounded-[14px] border-2 border-line bg-surface-2 p-3"
    >
      <p class="m-0 text-[13px] font-extrabold tracking-wide text-ink-2 uppercase">
        {{ running ? t('wheel.says') : t('wheel.last') }}
      </p>
      <!-- The drawn game as a tile in the pool's grid (#435): one column wide, as on the Event page's pool. -->
      <div :class="GAME_GRID">
        <GameTile
          :game="card"
          :audience="isHost ? 'host' : 'member'"
          :facts="hostGames?.[card.id] ?? null"
        />
      </div>
    </div>

    <!-- The result for screen readers, announced when the wheel stops. -->
    <p
      role="status"
      aria-live="polite"
      class="sr-only"
    >
      {{ card ? t('activity.wheel', { game: card.name }) : '' }}
    </p>
  </section>
</template>
