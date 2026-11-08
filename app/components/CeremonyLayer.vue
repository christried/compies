<script setup lang="ts">
import { RotateCcw, Share2, X } from '@lucide/vue'
import { ceremonyLayout, ceremonyModel } from '~/utils/ceremony'
import { buildRun, ceremonyRigState, measureRun, runGeometry, runPartsOf, type Burst, type RunParts } from '~/utils/ceremony-run'
import type { RigState } from '~/utils/compibert-rig'
import type { Gsap } from '~/utils/gsap'
import { ceremonyEndsAt, ceremonyPlays, ceremonyTimeline } from '~~/shared/ceremony'
import type { EventView } from '~~/shared/event'
import type { CeremonyView } from '~~/shared/stage'

// The Award ceremony's layer (#309, #312, spec #308): a modal dialog over the stage column (the side panel stays visible) on a desktop and full
// screen above the tabs on a phone. It opens by itself at the start instant of the Event read's ceremony, for every Member whatever tab or
// scroll position they are on, plays the Pokal-Lauf and stays on its end frame. Close and Escape close it for this viewer and this start, kept
// in memory: a refetch of the same start keeps it closed, a new start opens it again, a reload forgets the close.
// The page mounts it always, never behind a `v-if` on `open`, because `useDialog` watches `open`.
// Vue owns the facts, GSAP the pixels (#312): `elapsed` is the server's time less the start, sampled every frame; what the layer decides
// (stamped? ended? announce? confetti?) is a function of it. The run is a paused GSAP timeline (`ceremony-run.ts`) that this layer moves with
// `time(elapsed)` and never plays on GSAP's ticker, so a late joiner and a tab that comes back are the same code path.
const props = defineProps<{
  view: Pick<EventView, 'ceremony' | 'standings' | 'members' | 'teams' | 'results'> & { event: Pick<EventView['event'], 'name'> }
  /** The server's time in epoch ms (useServerClock): the opening is measured against it. */
  serverNow: () => number
}>()

const emit = defineEmits<{
  /** „Bild teilen“ of the end frame (#313): the page owns the sheet, which opens over this layer. */
  share: []
}>()

const { t } = useI18n()
const headingId = useId()
const panel = useTemplateRef<HTMLElement>('panel')
const award = useTemplateRef('award')
const skipButton = useTemplateRef<HTMLButtonElement>('skipButton')

/** The Host's last start, which every Member's page plays together. */
const synced = computed(() => props.view.ceremony)
/** The viewer's own run of the last start (#314): `of` is the synced start it replays, `run` the pseudo-ceremony the layer then plays. In memory only. */
const replayed = ref<{ of: string, run: CeremonyView } | null>(null)
/** What the layer plays: the viewer's replay while it belongs to the current start, else the synced start. A new start drops the replay by itself. */
const ceremony = computed(() => (replayed.value && replayed.value.of === synced.value?.startsAt ? replayed.value.run : synced.value))
const model = computed(() => ceremonyModel(props.view, t))
const startsMs = computed(() => (ceremony.value ? Date.parse(ceremony.value.startsAt) : null))
/** Every Party has a Standing, so this is the Party count the server stored the end for. */
const partyCount = computed(() => props.view.standings?.length ?? 0)
// A Tie (#315): the run's timeline also depends on the Winners and on whether this screen shows them as a grid. The server stored the end for
// the default layout; a phone's grid of 3 Winners ends up to 1.7 s earlier than that, never later (shared/ceremony.ts).
const roomy = useMediaQuery('(min-width: 48rem)')
const layout = computed(() => ceremonyLayout(model.value?.winners.length ?? 1, model.value?.rows.length ?? 0, roomy.value === true))
const shape = computed(() => ({ partyCount: partyCount.value, winners: model.value?.winners.length ?? 1, grid: layout.value.stage === 'grid' }))
const schedule = computed(() => (ceremony.value ? ceremonyTimeline(shape.value.partyCount, ceremony.value.gag, shape.value.winners, shape.value.grid) : null))

/** The start (its ISO instant) this viewer's layer opened for, the one they closed and the one they skipped: in memory only. */
const openedFor = ref<string | null>(null)
const closedFor = ref<string | null>(null)
const skippedFor = ref<string | null>(null)

const open = computed(() => ceremony.value !== null && model.value !== null && openedFor.value === ceremony.value.startsAt && closedFor.value !== ceremony.value.startsAt)

// Null until the page has mounted, so the server never renders the layer open. The ticker runs up to the start instant; the sample at or
// past it stays, so the opening is decided once, from the clock the page is at. Once the layer is open it runs to the end instant.
const now = useServerTicker(() => props.serverNow(), {
  until: () => (ceremony.value ? Date.parse(open.value ? ceremony.value.endsAt : ceremony.value.startsAt) : null),
})

// Opening is a latch: from the start instant on, once, while the run plays. A page first loaded at or after the end never opens it; an opened
// layer stays up past the end (the end frame waits to be closed); a new start is a new key and latches again at its own instant.
watch([now, ceremony], ([at, current]) => {
  if (!current || at === null) return
  if (openedFor.value === current.startsAt || closedFor.value === current.startsAt) return
  if (ceremonyPlays(current, at)) openedFor.value = current.startsAt
}, { immediate: true })

/** A replay is waiting for the chunk (a second click does nothing), and how many times the viewer closed since: a close cancels the wait. */
let waiting = false
let cancelled = 0

function close() {
  cancelled++
  if (ceremony.value) closedFor.value = ceremony.value.startsAt
}

/**
 * Plays the show again for this viewer only, from zero, with the last start's gag (#314). The click is the instant, on the server's clock and
 * with no lead; nothing is sent. The replay is a ceremony of the same shape as the synced one, so the ticker, the latch, close, skip and the live
 * region treat it as any run: it is keyed by its own `startsAt`, which `closedFor` and `skippedFor` of the synced start do not match.
 * Exposed for the finished page's button; the end frame's button calls it too.
 */
async function replay() {
  const start = synced.value
  if (!start || waiting) return
  // The chunk comes before the zero is stamped (#308): a Member who opens a finished page later has none yet (it is preloaded for a run that is
  // ahead or on), and the download would eat the first part of the show. Under reduced motion the end frame needs none; a chunk that fails
  // opens the end frame as ever, because `begin()` fails the same way. A close (or a new start) while it loads cancels the replay.
  if (!reducedMotion()) {
    waiting = true
    const asked = cancelled
    await loadGsap().catch(() => {})
    waiting = false
    if (asked !== cancelled || synced.value?.startsAt !== start.startsAt) return
  }
  const startsMs = props.serverNow()
  // The server-style end (the default layout, never this screen's): harmless on a phone's grid of 3 Winners, which only waits a little for the clock (#315).
  const endsAt = new Date(ceremonyEndsAt(startsMs, shape.value.partyCount, start.gag, shape.value.winners)).toISOString()
  const run: CeremonyView = { startsAt: new Date(startsMs).toISOString(), endsAt, gag: start.gag }
  const restart = open.value
  replayed.value = { of: start.startsAt, run }
  openedFor.value = run.startsAt
  // The open layer restarts in place: „Nochmal ansehen“ is gone with the end frame, so the focus it held falls to „Überspringen“. From the page,
  // `useDialog` focuses it as it opens.
  if (!restart) return
  await nextTick()
  panel.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
}
defineExpose({ replay })

const { onKeydown } = useDialog(open, panel, close)

// Escape closes from anywhere while the layer is open: on a desktop the side panel stays clickable, so focus can sit outside the dialog.
function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !event.defaultPrevented && open.value) close()
}
onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  cancelled++
})

// ---- the run

/** Server time since the start, in ms; 0 before the page has a clock. */
const elapsed = computed(() => (now.value === null || startsMs.value === null ? 0 : Math.max(0, now.value - startsMs.value)))
const stamped = computed(() => schedule.value !== null && elapsed.value >= schedule.value.stampAtMs)
const ended = computed(() => schedule.value !== null && elapsed.value >= schedule.value.endMs)
/** The end frame's buttons are in the DOM only once their row shows (04-motion § 6b `share`): `useDialog` traps Tab by selector, so a hidden last button would let Tab leave the dialog. */
const shareShown = computed(() => frame.value === 'end' || elapsed.value >= (schedule.value?.shareAtMs ?? 0))

/** Read when the layer opens: reduced motion shows the end frame at once. */
const reduced = ref(false)
/** The GSAP chunk did not load: the static end frame, no motion. */
const failed = ref(false)
/** The timeline is built and at the clock's place; until then the run's content is invisible (not `hidden`: the dialog still takes focus). The end frame never waits for it (#308). */
const ready = ref(false)
const skipped = computed(() => ceremony.value !== null && skippedFor.value === ceremony.value.startsAt)
const frame = computed(() => (ended.value || skipped.value || reduced.value || failed.value ? 'end' : 'run'))
/** Compibert's pose: the timeline's calls change it as the clock crosses them; the end frame and a late joiner set it from the clock. */
const rig = ref<RigState>('idle')
const endPose = (): RigState => (reduced.value ? 'cheer' : 'dance')

type Timeline = ReturnType<typeof buildRun>
let timeline: Timeline | undefined
let gsapHandle: Gsap | undefined
let parts: RunParts | undefined
let session = 0
let resizeObserver: ResizeObserver | undefined
/** The stretch of the clock the last seek covered: every burst of confetti (the stamp's, a hop's) is for the viewer who saw it live. */
let seek = { from: 0, to: 0 }
const LIVE_STAMP_MS = 500

function onBurst(burst: Burst) {
  if (seek.from < burst.atMs && seek.to - burst.atMs <= LIVE_STAMP_MS) award.value?.burst(burst.at === 'hop' ? burst.index : 'stamp')
}

function teardown() {
  session++
  resizeObserver?.disconnect()
  resizeObserver = undefined
  timeline?.kill()
  timeline = undefined
  parts = undefined
  ready.value = false
}

function finish() {
  timeline?.progress(1, true)
  rig.value = endPose()
}

/** The static end frame, without motion: for a chunk that did not load and for a run that could not be built. The frame is then the whole show. */
function giveUp(gsap?: Gsap, root?: HTMLElement) {
  timeline?.kill()
  timeline = undefined
  parts = undefined
  // A build that threw half way may have set parts to their first frame: the static end frame is what their markup says.
  if (gsap && root) gsap.set(root.querySelectorAll('[data-part]'), { clearProps: 'opacity,visibility,transform' })
  failed.value = true
  ready.value = true
  rig.value = endPose()
}

/**
 * Builds the run after the dialog is in the DOM and GSAP is there, and puts it where the clock is. The end frame needs none of that (#308): under
 * reduced motion no chunk is asked for, and a chunk that fails, a part that is missing or a build that throws leave the static end frame.
 */
async function begin() {
  const mine = ++session
  const stale = () => mine !== session
  await nextTick()
  if (stale()) return
  if (reduced.value) {
    rig.value = endPose()
    ready.value = true
    return
  }
  let gsap: Gsap
  try {
    gsap = await loadGsap()
  }
  catch {
    if (stale()) return
    giveUp()
    return
  }
  await nextTick()
  if (stale()) return
  const root = award.value?.root
  try {
    const found = root ? runPartsOf(root) : null
    if (!root || !found || !ceremony.value) throw new Error('The ceremony has no parts to move')
    gsapHandle = gsap
    parts = found
    timeline = buildRun(gsap, found, runGeometry(measureRun(root, found)), {
      ...shape.value,
      gag: ceremony.value.gag,
      rigState: state => (rig.value = state),
      onBurst,
    })
    // The first seek is silent: a late joiner fires no call, and gets the pose from the clock instead.
    timeline.time(elapsed.value / 1000, true)
    rig.value = frame.value === 'end' ? endPose() : ceremonyRigState(elapsed.value, shape.value.partyCount, ceremony.value.gag, shape.value.winners, shape.value.grid)
    if (frame.value === 'end') finish()
    seek = { from: elapsed.value, to: elapsed.value }
    ready.value = true
  }
  catch {
    giveUp(gsap, root)
  }
}

// The run is torn down and built again whenever the layer opens on a run (#314, #308). `watch(elapsed)` alone would only move the old timeline
// back to 0 on a replay from the end frame, and that is not enough: the build measures the stage again (a screen that changed size since the
// run has other stops), starts the rig at its pose for this clock instead of the end frame's `dance`, reads reduced motion and the chunk's
// failure again, and gives the confetti rule fresh bounds (`seek`). Keyed by the run (`startsAt`), not by `open`, so it holds however `replay()`
// orders its two writes. `flush: 'sync'` has `reduced` there before the dialog renders its first frame (no „Überspringen“ under reduced motion),
// and sees the layer close and open again in between, so the replay passes through `null` like a new start: no test can tell the key from a
// plain `open` here. The geometry case of „Nochmal ansehen“ fails without the rebuild.
watch(() => (open.value ? ceremony.value?.startsAt : null), (key) => {
  teardown()
  failed.value = false
  rig.value = 'idle'
  if (!key) return
  reduced.value = reducedMotion()
  rig.value = reduced.value ? 'cheer' : ceremonyRigState(elapsed.value, shape.value.partyCount, ceremony.value!.gag, shape.value.winners, shape.value.grid)
  void begin()
}, { immediate: true, flush: 'sync' })

// A screen that crosses the phone's width while the layer is open re-lays the stage out (a chain becomes a grid): the run is built again on the
// new parts, at the clock's place (#315).
watch(() => `${layout.value.stage}-${layout.value.rows}`, () => {
  if (!open.value || failed.value) return
  teardown()
  void begin()
}, { flush: 'post' })

// Every frame while the run plays: events fire as the clock crosses them.
watch(elapsed, (at) => {
  if (!timeline || frame.value !== 'run') return
  seek = { from: seek.to, to: at }
  timeline.time(at / 1000, false)
})

// The end (the clock, a skip): the correction at `endsAt` (04-motion § 2), never the local ticks. Focus on the skip button moves to the end frame.
watch(frame, async (now, was) => {
  if (now !== 'end' || was === undefined) return
  const hadFocus = skipButton.value !== null && skipButton.value.contains(document.activeElement)
  finish()
  if (!hadFocus) return
  await nextTick()
  // `preventScroll`: „Bild teilen“ is at the bottom of a stage that scrolls on a phone, and the end frame has to stay at its top (#313).
  panel.value?.querySelector<HTMLElement>('[data-end-focus]')?.focus({ preventScroll: true })
}, { flush: 'pre' })

function skip() {
  if (ceremony.value) skippedFor.value = ceremony.value.startsAt
}

// The end frame follows a resize (the run does not): Compibert stands at the new stopX.
watch([frame, ready], ([which, isReady]) => {
  resizeObserver?.disconnect()
  resizeObserver = undefined
  const root = award.value?.root
  if (which !== 'end' || !isReady || !root || !parts || !gsapHandle || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => {
    if (parts) gsapHandle?.set(parts.compibert, { x: runGeometry(measureRun(root, parts)).stopX })
  })
  resizeObserver.observe(root)
}, { flush: 'post' })

// GSAP is preloaded while the ceremony is ahead or running (the lead, a late joiner), so the chunk is there when the layer opens. Never for a
// ceremony whose end has passed: a finished Event page opened later loads none (ADR 0015). Nor under reduced motion, whose end frame needs none (#308).
watch(() => ceremony.value?.startsAt, () => {
  if (import.meta.client && ceremony.value && props.serverNow() < Date.parse(ceremony.value.endsAt) && !reducedMotion()) loadGsap().catch(() => {})
}, { immediate: true })

onBeforeUnmount(teardown)

// ---- the live region

// Empty at open; it gets the sentence the first time the stamp has landed or the end frame shows (a skip, reduced motion and a failed chunk
// speak at once), once per start. It is set a tick after its dialog mounted, so it is a change that is announced.
const announcement = ref('')
const speaks = computed(() => open.value && (stamped.value || frame.value === 'end'))
watch(speaks, async (does) => {
  if (!does) {
    announcement.value = ''
    return
  }
  await nextTick()
  if (speaks.value) announcement.value = model.value?.live ?? ''
}, { immediate: true })

// useDialog gives focus back to where it was; when that was nothing (the page had no focus), the page's heading takes it (as EventRounds does).
watch(open, async (isOpen, was) => {
  if (isOpen || !was) return
  await nextTick()
  if (!document.activeElement || document.activeElement === document.body) document.querySelector<HTMLElement>('#stage h1')?.focus()
})
</script>

<template>
  <Teleport to="body">
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- Escape and the focus trap of the dialog -->
    <div
      v-if="open && model"
      ref="panel"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="headingId"
      :data-frame="frame"
      class="fixed layer-modal tex-paper animate-enter max-md:inset-0 md:top-[calc(var(--cp-header-h)+var(--cp-bw))] md:right-(--cp-panel-w) md:bottom-0 md:left-0"
      @keydown="onKeydown"
    >
      <!-- „Überspringen“ and the close button: both stay while the run plays (the Host may leave at any time, story 27). -->
      <div class="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          v-if="frame === 'run'"
          ref="skipButton"
          type="button"
          data-autofocus
          class="h-9 cursor-pointer rounded-pill border-2 border-line bg-surface px-3.5 text-[13px] font-bold text-ink shadow-sm"
          @click="skip"
        >
          {{ t('ceremony.skip') }}
        </button>
        <IconButton
          :icon="X"
          :label="t('common.close')"
          :data-autofocus="frame === 'run' ? undefined : ''"
          @click="close"
        />
      </div>
      <div
        class="size-full overflow-y-auto"
        :class="{ 'opacity-0': !ready && frame !== 'end' }"
      >
        <AwardCeremony
          ref="award"
          :model="model"
          :heading-id="headingId"
          :state="rig"
          :layout="layout"
        >
          <!-- The end frame's buttons (#313, #314), rendered once the row shows. „Bild teilen“ takes the focus when the run ends or is skipped (the watch on `frame`). -->
          <template #share>
            <AppButton
              v-if="shareShown"
              variant="secondary"
              data-end-focus
              @click="emit('share')"
            >
              <AppIcon
                :icon="Share2"
                :size="18"
              />
              {{ t('share.open') }}
            </AppButton>
          </template>
          <!-- Under reduced motion and after a failed chunk the end frame is the whole show, so there is nothing to watch again. -->
          <template #again>
            <AppButton
              v-if="shareShown && !reduced && !failed"
              variant="secondary"
              @click="replay"
            >
              <AppIcon
                :icon="RotateCcw"
                :size="18"
              />
              {{ t('ceremony.again') }}
            </AppButton>
          </template>
        </AwardCeremony>
      </div>
      <p
        role="status"
        aria-live="polite"
        class="sr-only"
      >
        {{ announcement }}
      </p>
    </div>
  </Teleport>
</template>
