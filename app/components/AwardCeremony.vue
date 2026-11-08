<script setup lang="ts">
import { Equal } from '@lucide/vue'
import { boxWithin } from '~/utils/ceremony-tie-run'
import type { CeremonyLayout, CeremonyModel, CeremonyPerson, CeremonyWinner } from '~/utils/ceremony'
import type { RigState } from '~/utils/compibert-rig'

// The Award ceremony's stage (#309, spec #308, reference AwardCeremony.dc.html): the banner, the places from second to last, the winner card
// with its stamp, the Winners' people as avatars, Compibert on the ground (the rig, #311) and the trophy he carries. Presentational: the
// layer owns when it shows, how it closes and the clock. The static markup is the end frame (what a reader without JS, a failed GSAP chunk
// and reduced motion see); the Pokal-Lauf (#312, `app/utils/ceremony-run.ts`) takes the `data-part` elements to their first frame and plays
// them from there. A Tie (#315, 12-siegerehrung-unentschieden.md, reference Siegerehrung Unentschieden.dc.html frame()) stands under one shared
// plate „Platz 1“: a chain of cards joined by „=“ (2 Winners, on a wide screen 3) or a grid of compact cards, each with its Party's people.
const props = defineProps<{
  model: CeremonyModel
  /** The id of the banner's heading, which names the dialog the layer puts around this. */
  headingId: string
  /** Compibert's pose: the layer decides it (the run's timeline, the end frame, reduced motion). */
  state: RigState
  /** How the Winners and the places below stand (`ceremonyLayout`): the layer decides it, since the run's timeline depends on it too. */
  layout: CeremonyLayout
}>()

const { t } = useI18n()
// A phone (below md, as AppShell's side panel) gets the smaller sizes of the reference's `mob` variant.
const roomy = useMediaQuery('(min-width: 48rem)')
const avatar = computed(() => (roomy.value ? 80 : 64))
const compibert = computed(() => (roomy.value ? 150 : 120))
/** The cell of a person is a little wider than the avatar; three cells make a row. */
const cell = computed(() => avatar.value + 16)
const winners = computed(() => props.model.winners)
const first = computed(() => winners.value[0]!)
/** Compibert's room under the content, in px: his height (the full pose is 404 : 344) and the ground strip. */
const track = computed(() => Math.round(compibert.value * 344 / 404) + 34)
/** The share row's room on a phone (#314): its height (AppButton's `md`, 44 px) and the stage's gap above it. */
const SHARE_ROW_ROOM = 44 + 18
/**
 * The stage's bottom padding, Compibert's `track` on a wide screen and `track` plus the share row's room on a phone (#314). It is set from the
 * first frame, so the stage keeps its height when the buttons appear mid-run.
 */
const ground = computed(() => `${roomy.value ? track.value : track.value + SHARE_ROW_ROOM}px`)

// A Tie's sizes, number for number from the artboard's frame() (card w x h, strip, name, points and stamp font, stamp offset, avatar, cell,
// gap, name font, „=“ badge, the gap it takes and its icon, the points' padding).
const CHAIN_WIDE_2 = { w: 240, h: 160, strip: 40, nfs: 16, pfs: 32, sfs: 20, so: 12, av: 56, cell: 68, gx: 10, ns: 13, eq: 40, eg: 56, ei: 18, pp: '12px 14px', mgap: 14 } as const
const CHAIN_WIDE_3 = { w: 220, h: 140, strip: 36, nfs: 15, pfs: 28, sfs: 18, so: 10, av: 48, cell: 60, gx: 8, ns: 12, eq: 36, eg: 48, ei: 16, pp: '11px 13px', mgap: 14 } as const
const CHAIN_PHONE = { w: 160, h: 120, strip: 32, nfs: 13, pfs: 24, sfs: 15, so: 8, av: 44, cell: 50, gx: 5, ns: 12, eq: 28, eg: 34, ei: 14, pp: '9px 11px', mgap: 10 } as const
const GRID_WIDE = { w: 236, h: 120, strip: 36, nfs: 15, pfs: 22, sfs: 13, av: 28, ov: 8, gap: 14, bg: 10 } as const
const GRID_PHONE = { w: 171, h: 96, strip: 30, nfs: 13, pfs: 18, sfs: 11, av: 24, ov: 7, gap: 12, bg: 7 } as const
const chain = computed(() => (!roomy.value ? CHAIN_PHONE : winners.value.length === 2 ? CHAIN_WIDE_2 : CHAIN_WIDE_3))
const grid = computed(() => (roomy.value ? GRID_WIDE : GRID_PHONE))
/** The width of the Winner group, which the plate takes. */
const groupWidth = computed(() => {
  const k = winners.value.length
  if (props.layout.stage === 'chain') return k * chain.value.w + (k - 1) * chain.value.eg
  const columns = Math.min(k, props.layout.cols)
  return columns * grid.value.w + (columns - 1) * grid.value.gap
})
const plate = computed(() => (roomy.value ? { h: 40, label: 15, stamp: 20 } : { h: 34, label: 12, stamp: 15 }))

/** What a screen reader hears of a grid card's stack: the Party and its Players' names, the rest counted. */
function stackLabel(winner: CeremonyWinner) {
  const players = winner.people.flatMap((person: CeremonyPerson) => (person.kind === 'player' ? [person.name] : person.kind === 'more' ? [t('ceremony.more', { n: person.n })] : []))
  return players.length === 0 ? winner.name : t('ceremony.tie.stack', { team: winner.name, players: players.join(', ') })
}

const root = useTemplateRef<HTMLElement>('root')
const card = useTemplateRef<HTMLElement>('card')
const confetti = useTemplateRef('confetti')

/**
 * Confetti, from just above a card's or the plate's top centre. A sole Winner's stamp: 40 pieces on a desktop, 20 on a phone (04-motion § Confetti).
 * A Tie's stamp bursts from the plate with the same counts, and the trophy landing on a card of a chain (`index`) 14, on a phone 8 (6b-T).
 */
function burst(target: 'stamp' | number = 'stamp') {
  const stage = root.value
  const count = typeof target === 'number' ? (roomy.value ? 14 : 8) : roomy.value ? 40 : 20
  if (props.layout.stage === 'single') {
    if (!card.value) return
    confetti.value?.burst(card.value.offsetLeft + card.value.offsetWidth / 2, card.value.offsetTop - 10, count)
    return
  }
  const element = typeof target === 'number'
    ? stage?.querySelectorAll<HTMLElement>('[data-part="card"]')[target]
    : stage?.querySelector<HTMLElement>('[data-part="plate"]')
  if (!stage || !element) return
  const box = boxWithin(stage, element)
  confetti.value?.burst(box.left + box.width / 2, box.top - 10, count)
}

defineExpose({ root, burst })
</script>

<template>
  <div
    ref="root"
    class="relative flex min-h-full flex-col items-center gap-[18px] px-[18px] pt-[66px] text-ink md:pt-[22px]"
    :style="{ paddingBottom: ground }"
  >
    <!-- The top padding below md (66 px) clears the layer's „Überspringen“ and close button (top 12 px, 36 px high, and the banner's tilt lifts its
         corner by about 9 px): at 390 px the banner is 248 px wide and ran under them. The reference reserves nothing there; from md on it is the
         reference's 22 px. The layer's buttons are the same for a Tie's chain and grid, which share this stage (#315). -->
    <h2
      :id="headingId"
      class="m-0 flex justify-center font-normal"
    >
      <span
        data-part="banner"
        class="-rotate-4 rounded-[14px] border-(length:--cp-bw) border-line bg-primary px-6 py-2 font-display text-[clamp(32px,5vw,52px)] leading-none text-on-primary shadow-card"
      >{{ t('ceremony.banner') }}</span>
    </h2>
    <p class="m-0 text-center text-[14px] font-bold text-ink-2">
      {{ model.sub }}
    </p>

    <div
      v-if="layout.stage === 'single'"
      class="flex w-full max-w-[820px] flex-wrap items-start justify-center gap-x-7 gap-y-5"
    >
      <div class="flex max-w-full flex-none flex-col items-center gap-4">
        <div
          ref="card"
          data-testid="winner-card"
          data-part="card"
          class="relative h-[160px] w-[240px] max-w-full overflow-hidden rounded-[16px] border-(length:--cp-bw) border-line bg-surface shadow-card"
        >
          <div data-part="back">
            <div
              class="flex h-10 flex-none items-center overflow-hidden border-b-(length:--cp-bw) border-line px-3 text-[16px] font-extrabold whitespace-nowrap"
              :style="{ backgroundColor: `var(--cp-team-${first.team})`, backgroundImage: `var(--cp-team-${first.team}-pattern)`, color: `var(--cp-team-${first.team}-ink)` }"
            >
              <span class="truncate">{{ first.name }}</span>
            </div>
            <div class="flex flex-col gap-1 px-3.5 py-3">
              <span class="text-[13px] font-bold text-ink-2">{{ t('ceremony.place1') }}</span>
              <span class="font-num text-[32px] leading-none">{{ t('ceremony.pts', { n: model.points }) }}</span>
            </div>
          </div>
          <!-- The front is decoration (opacity-0 in the static end frame, the run shows it at its first frame): „Platz 1“ stays real text on the back. -->
          <div
            data-part="front"
            aria-hidden="true"
            class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-paper-2 opacity-0"
          >
            <span class="font-num text-[48px] leading-none">???</span>
            <span class="text-[13px] font-bold text-ink-2">{{ t('ceremony.place1') }}</span>
          </div>
          <!-- The stamp is a physical sticker: fixed in both modes. -->
          <span
            data-part="stamp"
            class="absolute right-3 bottom-3 -rotate-8 rounded-[6px] border-[3px] border-hot bg-surface px-2.5 py-0.5 font-num text-[20px] text-hot"
          >{{ t('ceremony.stamp') }}</span>
        </div>

        <ul
          :aria-label="t('ceremony.players')"
          class="m-0 flex list-none flex-wrap justify-center gap-x-2.5 gap-y-3 p-0"
          :style="{ maxWidth: `${cell * 3 + 20}px` }"
        >
          <li
            v-for="(person, index) in first.people"
            :key="index"
            data-part="person"
            class="flex flex-col items-center gap-1.5"
            :style="{ width: `${cell}px` }"
          >
            <UserAvatar
              v-if="person.kind === 'player'"
              :name="person.name"
              :image="person.image"
              :team="person.team"
              :size="avatar"
            />
            <TeamMark
              v-else-if="person.kind === 'mark'"
              :team="person.team"
              :size="avatar"
            />
            <span
              v-else
              class="box-border grid place-items-center rounded-pill border-[2.5px] border-line bg-paper-2 font-num text-ink"
              :style="{ width: `${avatar}px`, height: `${avatar}px`, fontSize: `${Math.round(avatar * 0.3)}px` }"
            >+{{ person.n }}</span>
            <span class="max-w-full truncate text-[13px] leading-[1.1] font-extrabold">{{ person.kind === 'player' || person.kind === 'mark' ? person.name : t('ceremony.more', { n: person.n }) }}</span>
          </li>
        </ul>
      </div>

      <ol
        v-if="model.rows.length > 0"
        :aria-label="t('ceremony.standings')"
        class="m-0 flex max-w-[420px] min-w-0 flex-[1_1_300px] list-none flex-col gap-2.5 p-0"
      >
        <li
          v-for="row in model.rows"
          :key="row.team"
          data-part="row"
          class="grid min-h-[52px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[12px] border-(length:--cp-bw) border-line bg-surface px-3.5 shadow-sm"
        >
          <span class="font-num text-[22px]">{{ row.rank }}</span>
          <span class="flex min-w-0 items-center gap-2 font-extrabold">
            <i
              aria-hidden="true"
              class="size-[18px] flex-none rounded-[5px] border-2 border-line"
              :style="{ backgroundColor: `var(--cp-team-${row.team})`, backgroundImage: `var(--cp-team-${row.team}-pattern)` }"
            />
            <span class="truncate">{{ row.name }}</span>
          </span>
          <span class="font-num text-[18px]">{{ t('ceremony.pts', { n: row.points }) }}</span>
        </li>
      </ol>
    </div>

    <!-- A Tie (#315): the plate over the Winners' cards, and the places below beside them, under them, or as one line of chips. -->
    <template v-else>
      <div
        class="flex max-w-full justify-center"
        :class="layout.rows === 'side' ? 'flex-row items-start gap-10' : 'w-full flex-col items-center gap-[14px]'"
      >
        <div
          class="flex flex-none flex-col items-center"
          :class="roomy ? 'gap-3' : 'gap-2.5'"
        >
          <div
            data-part="plate"
            class="relative box-border flex flex-none items-center justify-center rounded-[12px] border-(length:--cp-bw) border-line bg-primary text-on-primary shadow-sm"
            :style="{ width: `${groupWidth}px`, height: `${plate.h}px` }"
          >
            <span
              class="absolute top-0 bottom-0 left-3 flex items-center font-num leading-none"
              :style="{ fontSize: `${plate.label}px` }"
            >{{ t('ceremony.place1') }}</span>
            <!-- „???“ becomes the stamp; the static end frame has the stamp and no „???“, as the single card has no front. -->
            <span class="relative grid place-items-center">
              <span
                data-part="plate-stamp"
                class="-rotate-3 rounded-[6px] border-[3px] border-hot bg-surface px-2.5 py-0.5 font-num leading-[1.15] text-hot uppercase"
                :style="{ fontSize: `${plate.stamp}px` }"
              >{{ t('ceremony.tie.plateStamp') }}</span>
              <span
                data-part="plate-front"
                aria-hidden="true"
                class="absolute inset-0 grid place-items-center font-num opacity-0"
                :style="{ fontSize: `${plate.stamp}px` }"
              >???</span>
            </span>
          </div>

          <ol
            v-if="layout.stage === 'chain'"
            :aria-label="t('ceremony.tie.list')"
            data-stage="chain"
            class="m-0 flex list-none items-start justify-center p-0"
          >
            <li
              v-for="(winner, index) in winners"
              :key="winner.team"
              class="flex items-start"
            >
              <div
                class="flex flex-col items-center"
                :style="{ gap: `${chain.mgap}px` }"
              >
                <div
                  data-testid="winner-card"
                  data-part="card"
                  class="relative box-border flex-none overflow-hidden rounded-[16px] border-(length:--cp-bw) border-line bg-surface shadow-card"
                  :style="{ width: `${chain.w}px`, height: `${chain.h}px` }"
                >
                  <div
                    data-part="back"
                    class="absolute inset-0 flex flex-col"
                  >
                    <div
                      class="flex min-w-0 flex-none items-center border-b-(length:--cp-bw) border-line px-3 font-extrabold"
                      :style="{ height: `${chain.strip}px`, fontSize: `${chain.nfs}px`, backgroundColor: `var(--cp-team-${winner.team})`, backgroundImage: `var(--cp-team-${winner.team}-pattern)`, color: `var(--cp-team-${winner.team}-ink)` }"
                    >
                      <span class="truncate">{{ winner.name }}</span>
                    </div>
                    <div
                      class="flex flex-1 items-start font-num leading-none"
                      :style="{ padding: chain.pp, fontSize: `${chain.pfs}px` }"
                    >
                      {{ t('ceremony.pts', { n: winner.points }) }}
                    </div>
                  </div>
                  <div
                    data-part="front"
                    aria-hidden="true"
                    class="absolute inset-0 flex flex-col items-center justify-center bg-paper-2 opacity-0"
                  >
                    <span class="font-num text-[40px] leading-none">???</span>
                  </div>
                  <span
                    data-part="stamp"
                    class="absolute -rotate-8 rounded-[6px] border-[3px] border-hot bg-surface px-2.5 py-0.5 font-num text-hot"
                    :style="{ right: `${chain.so}px`, bottom: `${chain.so}px`, fontSize: `${chain.sfs}px` }"
                  >{{ t('ceremony.stamp') }}</span>
                </div>
                <ul
                  :aria-label="winner.name"
                  data-part="party"
                  class="m-0 flex list-none flex-wrap justify-center p-0"
                  :style="{ width: `${chain.w}px`, gap: `10px ${chain.gx}px` }"
                >
                  <li
                    v-for="(person, at) in winner.people"
                    :key="at"
                    data-part="person"
                    class="flex flex-col items-center gap-[5px]"
                    :style="{ width: `${chain.cell}px` }"
                  >
                    <UserAvatar
                      v-if="person.kind === 'player'"
                      :name="person.name"
                      :image="person.image"
                      :team="person.team"
                      :size="chain.av"
                    />
                    <TeamMark
                      v-else-if="person.kind === 'mark'"
                      :team="person.team"
                      :size="chain.av"
                    />
                    <span
                      v-else
                      class="box-border grid place-items-center rounded-pill border-[2.5px] border-line bg-paper-2 font-num text-ink"
                      :style="{ width: `${chain.av}px`, height: `${chain.av}px`, fontSize: `${Math.round(chain.av * 0.3)}px` }"
                    >+{{ person.n }}</span>
                    <span
                      class="max-w-full truncate leading-[1.1] font-extrabold"
                      :style="{ fontSize: `${chain.ns}px` }"
                    >{{ person.kind === 'player' || person.kind === 'mark' ? person.name : t('ceremony.more', { n: person.n }) }}</span>
                  </li>
                </ul>
              </div>
              <div
                v-if="index < winners.length - 1"
                data-part="badge"
                aria-hidden="true"
                class="flex flex-none items-center justify-center"
                :style="{ width: `${chain.eg}px`, height: `${chain.h}px` }"
              >
                <span
                  class="box-border grid place-items-center rounded-pill border-[2.5px] border-line bg-primary text-on-primary shadow-sm"
                  :style="{ width: `${chain.eq}px`, height: `${chain.eq}px` }"
                >
                  <Equal
                    :size="chain.ei"
                    :stroke-width="3"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </li>
          </ol>

          <ol
            v-else
            :aria-label="t('ceremony.tie.list')"
            data-stage="grid"
            class="m-0 flex list-none flex-wrap justify-center p-0"
            :style="{ gap: `${grid.gap}px`, width: `${groupWidth}px` }"
          >
            <li
              v-for="winner in winners"
              :key="winner.team"
              data-testid="winner-card"
              data-part="card"
              class="relative box-border flex-none overflow-hidden rounded-[14px] border-(length:--cp-bw) border-line bg-surface shadow-card"
              :style="{ width: `${grid.w}px`, height: `${grid.h}px` }"
            >
              <div
                data-part="back"
                class="absolute inset-0 flex flex-col"
              >
                <div
                  class="flex min-w-0 flex-none items-center border-b-(length:--cp-bw) border-line px-2.5 font-extrabold"
                  :style="{ height: `${grid.strip}px`, fontSize: `${grid.nfs}px`, backgroundColor: `var(--cp-team-${winner.team})`, backgroundImage: `var(--cp-team-${winner.team}-pattern)`, color: `var(--cp-team-${winner.team}-ink)` }"
                >
                  <span class="truncate">{{ winner.name }}</span>
                </div>
                <div
                  class="flex flex-1 flex-col justify-center px-2.5"
                  :style="{ gap: `${grid.bg}px` }"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span
                      class="font-num leading-none"
                      :style="{ fontSize: `${grid.pfs}px` }"
                    >{{ t('ceremony.pts', { n: winner.points }) }}</span>
                    <span
                      data-part="stamp"
                      class="-rotate-8 rounded-[5px] border-[2.5px] border-hot bg-surface px-[7px] py-px font-num leading-[1.2] text-hot"
                      :style="{ fontSize: `${grid.sfs}px` }"
                    >{{ t('ceremony.stamp') }}</span>
                  </div>
                  <ul
                    :aria-label="stackLabel(winner)"
                    data-part="stack"
                    class="m-0 flex list-none items-center p-0"
                  >
                    <li
                      v-for="(person, at) in winner.people"
                      :key="at"
                      class="flex"
                      :style="{ marginLeft: at > 0 ? `${-grid.ov}px` : '0' }"
                    >
                      <UserAvatar
                        v-if="person.kind === 'player'"
                        :name="person.name"
                        :image="person.image"
                        :size="grid.av"
                      />
                      <TeamMark
                        v-else-if="person.kind === 'mark'"
                        :team="person.team"
                        :size="grid.av"
                      />
                      <span
                        v-else
                        class="box-border grid place-items-center rounded-pill border-2 border-line bg-paper-2 font-num text-ink"
                        :style="{ width: `${grid.av}px`, height: `${grid.av}px`, fontSize: `${Math.round(grid.av * 0.4)}px` }"
                      >+{{ person.n }}</span>
                    </li>
                  </ul>
                </div>
              </div>
              <div
                data-part="front"
                aria-hidden="true"
                class="absolute inset-0 flex flex-col items-center justify-center bg-paper-2 opacity-0"
              >
                <span class="font-num text-[32px] leading-none">???</span>
              </div>
            </li>
          </ol>
        </div>

        <ol
          v-if="layout.rows === 'side' || layout.rows === 'below'"
          :aria-label="t('ceremony.standings')"
          :data-rows="layout.rows"
          class="m-0 flex list-none flex-col p-0"
          :class="layout.rows === 'side' ? 'mt-[52px] w-[380px] flex-none gap-2.5' : 'mt-1 w-full gap-2'"
        >
          <li
            v-for="row in model.rows"
            :key="row.team"
            data-part="row"
            class="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[12px] border-(length:--cp-bw) border-line bg-surface px-3.5 shadow-sm"
            :class="layout.rows === 'side' ? 'min-h-[52px]' : 'min-h-[48px]'"
          >
            <span class="font-num text-[22px]">{{ row.rank }}</span>
            <span class="flex min-w-0 items-center gap-2 font-extrabold">
              <i
                aria-hidden="true"
                class="size-[18px] flex-none rounded-[5px] border-2 border-line"
                :style="{ backgroundColor: `var(--cp-team-${row.team})`, backgroundImage: `var(--cp-team-${row.team}-pattern)` }"
              />
              <span class="truncate">{{ row.name }}</span>
            </span>
            <span class="font-num text-[18px]">{{ t('ceremony.pts', { n: row.points }) }}</span>
          </li>
        </ol>
      </div>

      <ol
        v-if="layout.rows === 'chips'"
        :aria-label="t('ceremony.standings')"
        data-rows="chips"
        class="m-0 flex max-w-full list-none flex-wrap justify-center gap-2 p-0"
      >
        <li
          v-for="row in model.rows"
          :key="row.team"
          data-part="row"
          class="box-border flex h-10 max-w-full items-center gap-2 rounded-pill border-[2.5px] border-line bg-surface pr-3.5 pl-[5px] shadow-sm"
        >
          <span class="grid size-7 flex-none place-items-center rounded-pill bg-paper-2 font-num text-[14px] leading-none">{{ row.rank }}</span>
          <i
            aria-hidden="true"
            class="size-4 flex-none rounded-[5px] border-2 border-line"
            :style="{ backgroundColor: `var(--cp-team-${row.team})`, backgroundImage: `var(--cp-team-${row.team}-pattern)` }"
          />
          <span class="min-w-0 truncate text-[14px] font-extrabold">{{ row.name }}</span>
          <span class="flex-none font-num text-[14px]">{{ t('ceremony.pts', { n: row.points }) }}</span>
        </li>
      </ol>
    </template>

    <div
      aria-hidden="true"
      class="absolute inset-x-0 bottom-0 h-[22px] border-t-(length:--cp-bw) border-line bg-paper-2"
    />
    <!-- Compibert's box starts at the stage's left edge: the run's x is a stage coordinate (ceremony-run.ts). -->
    <div
      data-part="compibert"
      class="pointer-events-none absolute bottom-4 left-0 z-3"
    >
      <CeremonyCompibert
        :size="compibert"
        :state="state"
      />
    </div>
    <!-- The trophy he carries (the reference's SVG; fixed colours, a physical sticker in both themes). Hidden by GSAP until the run starts: the end frame has none. -->
    <div
      data-part="trophy"
      aria-hidden="true"
      class="pointer-events-none absolute top-0 left-0 z-4 h-[52px] w-[48px] opacity-0"
    >
      <svg
        viewBox="0 0 52 56"
        width="48"
        height="52"
        class="block overflow-visible"
      >
        <path
          d="M8 12C0 12 0 26 11 27M44 12C52 12 52 26 41 27"
          style="fill: none; stroke: #151515; stroke-width: 3.5; stroke-linecap: round"
        />
        <path
          d="M8 5H44V17C44 31 36 37 26 37C16 37 8 31 8 17Z"
          style="fill: #ffd23f; stroke: #151515; stroke-width: 3.5; stroke-linejoin: round"
        />
        <rect
          x="22"
          y="37"
          width="8"
          height="8"
          style="fill: #ffd23f; stroke: #151515; stroke-width: 3"
        />
        <rect
          x="13"
          y="45"
          width="26"
          height="9"
          rx="2"
          style="fill: #ff70c3; stroke: #151515; stroke-width: 3"
        />
      </svg>
    </div>
    <!-- The share row, the layer's buttons of the end frame (#313 „Bild teilen“, #314 „Nochmal ansehen“). It is part of the run (it rises in at
         `shareAtMs`) and out of flow, so the buttons' appearing mid-run moves nothing the run measured. On a wide screen it stands in the
         corner the stage leaves free, bottom right, 34 px up. On a phone there is no room beside Compibert (his 120 px and the row's 316 px
         do not fit in 354 px: browser check c3, #314), so the row stands centred above him, as the reference has it: its bottom 18 px over
         his box's top (`track`, 136 px), with the stage's bottom padding holding that room from the first frame. -->
    <div
      data-part="share"
      class="absolute z-6 flex flex-wrap gap-2.5"
      :class="roomy ? 'right-[18px] justify-end' : 'left-[18px] right-[18px] justify-center'"
      :style="{ bottom: roomy ? '34px' : `${track}px` }"
    >
      <slot name="share" />
      <slot name="again" />
    </div>
    <StickerConfetti
      ref="confetti"
      class="z-5"
    />
  </div>
</template>
