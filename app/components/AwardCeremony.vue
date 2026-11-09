<script setup lang="ts">
import { Equal } from '@lucide/vue'
import { boxWithin } from '~/utils/ceremony-tie-run'
import { chainSizes, gridSizes, groupWidth, plateSizes } from '~/utils/ceremony-sizes'
import { teamSurfaceStyle, teamVar } from '~/utils/team-style'
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
const roomy = useRoomy()
const avatar = computed((): 80 | 64 => (roomy.value ? 80 : 64))
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

// The sizes of a Tie's chain, grid and plate (`app/utils/ceremony-sizes.ts`, #328).
const chain = computed(() => chainSizes(roomy.value === true, winners.value.length))
const grid = computed(() => gridSizes(roomy.value === true))
const plate = computed(() => plateSizes(roomy.value === true))
/** The width of the Winner group, which the plate takes (#315). */
const winnersWidth = computed(() => groupWidth(props.layout, winners.value.length, roomy.value === true))

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
              :style="teamSurfaceStyle(first.team)"
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
            <CeremonyPersonCell
              :person="person"
              :size="avatar"
            />
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
              :style="{ backgroundColor: teamVar(row.team), backgroundImage: teamVar(row.team, 'pattern') }"
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
            :style="{ width: `${winnersWidth}px`, height: `${plate.height}px` }"
          >
            <span
              class="absolute top-0 bottom-0 left-3 flex items-center font-num leading-none"
              :style="{ fontSize: `${plate.labelFontSize}px` }"
            >{{ t('ceremony.place1') }}</span>
            <!-- „???“ becomes the stamp; the static end frame has the stamp and no „???“, as the single card has no front. -->
            <span class="relative grid place-items-center">
              <span
                data-part="plate-stamp"
                class="-rotate-3 rounded-[6px] border-[3px] border-hot bg-surface px-2.5 py-0.5 font-num leading-[1.15] text-hot uppercase"
                :style="{ fontSize: `${plate.stampFontSize}px` }"
              >{{ t('ceremony.tie.plateStamp') }}</span>
              <span
                data-part="plate-front"
                aria-hidden="true"
                class="absolute inset-0 grid place-items-center font-num opacity-0"
                :style="{ fontSize: `${plate.stampFontSize}px` }"
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
                :style="{ gap: `${chain.peopleGap}px` }"
              >
                <div
                  data-testid="winner-card"
                  data-part="card"
                  class="relative box-border flex-none overflow-hidden rounded-[16px] border-(length:--cp-bw) border-line bg-surface shadow-card"
                  :style="{ width: `${chain.cardWidth}px`, height: `${chain.cardHeight}px` }"
                >
                  <div
                    data-part="back"
                    class="absolute inset-0 flex flex-col"
                  >
                    <div
                      class="flex min-w-0 flex-none items-center border-b-(length:--cp-bw) border-line px-3 font-extrabold"
                      :style="{ height: `${chain.stripHeight}px`, fontSize: `${chain.nameFontSize}px`, ...teamSurfaceStyle(winner.team) }"
                    >
                      <span class="truncate">{{ winner.name }}</span>
                    </div>
                    <div
                      class="flex flex-1 items-start font-num leading-none"
                      :style="{ padding: chain.pointsPadding, fontSize: `${chain.pointsFontSize}px` }"
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
                    :style="{ right: `${chain.stampOffset}px`, bottom: `${chain.stampOffset}px`, fontSize: `${chain.stampFontSize}px` }"
                  >{{ t('ceremony.stamp') }}</span>
                </div>
                <ul
                  :aria-label="winner.name"
                  data-part="party"
                  class="m-0 flex list-none flex-wrap justify-center p-0"
                  :style="{ width: `${chain.cardWidth}px`, gap: `10px ${chain.cellGapX}px` }"
                >
                  <li
                    v-for="(person, at) in winner.people"
                    :key="at"
                    data-part="person"
                    class="flex flex-col items-center gap-[5px]"
                    :style="{ width: `${chain.cellWidth}px` }"
                  >
                    <CeremonyPersonCell
                      :person="person"
                      :size="chain.avatarSize"
                      :name-font-size="chain.personNameFontSize"
                    />
                  </li>
                </ul>
              </div>
              <div
                v-if="index < winners.length - 1"
                data-part="badge"
                aria-hidden="true"
                class="flex flex-none items-center justify-center"
                :style="{ width: `${chain.badgeGap}px`, height: `${chain.cardHeight}px` }"
              >
                <span
                  class="box-border grid place-items-center rounded-pill border-[2.5px] border-line bg-primary text-on-primary shadow-sm"
                  :style="{ width: `${chain.badgeSize}px`, height: `${chain.badgeSize}px` }"
                >
                  <Equal
                    :size="chain.badgeIconSize"
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
            :style="{ gap: `${grid.cardGap}px`, width: `${winnersWidth}px` }"
          >
            <li
              v-for="winner in winners"
              :key="winner.team"
              data-testid="winner-card"
              data-part="card"
              class="relative box-border flex-none overflow-hidden rounded-[14px] border-(length:--cp-bw) border-line bg-surface shadow-card"
              :style="{ width: `${grid.cardWidth}px`, height: `${grid.cardHeight}px` }"
            >
              <div
                data-part="back"
                class="absolute inset-0 flex flex-col"
              >
                <div
                  class="flex min-w-0 flex-none items-center border-b-(length:--cp-bw) border-line px-2.5 font-extrabold"
                  :style="{ height: `${grid.stripHeight}px`, fontSize: `${grid.nameFontSize}px`, ...teamSurfaceStyle(winner.team) }"
                >
                  <span class="truncate">{{ winner.name }}</span>
                </div>
                <div
                  class="flex flex-1 flex-col justify-center px-2.5"
                  :style="{ gap: `${grid.backGap}px` }"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span
                      class="font-num leading-none"
                      :style="{ fontSize: `${grid.pointsFontSize}px` }"
                    >{{ t('ceremony.pts', { n: winner.points }) }}</span>
                    <span
                      data-part="stamp"
                      class="-rotate-8 rounded-[5px] border-[2.5px] border-hot bg-surface px-[7px] py-px font-num leading-[1.2] text-hot"
                      :style="{ fontSize: `${grid.stampFontSize}px` }"
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
                      :style="{ marginLeft: at > 0 ? `${-grid.avatarOverlap}px` : '0' }"
                    >
                      <CeremonyPersonCell
                        :person="person"
                        :size="grid.avatarSize"
                        stack
                      />
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
                :style="{ backgroundColor: teamVar(row.team), backgroundImage: teamVar(row.team, 'pattern') }"
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
            :style="{ backgroundColor: teamVar(row.team), backgroundImage: teamVar(row.team, 'pattern') }"
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
    <!-- Compibert's box starts at the stage's left edge: the run's x is a stage coordinate (ceremony-run.ts). The rig (#311), 150 px on a
         desktop and 120 on a phone, holds the pose the layer decides (the run's timeline, then the dance; under reduced motion the cheer,
         held). It is mounted with the layer's dialog only, so GSAP loads when the ceremony opens and never on a finished Event page that
         stays closed (ADR 0015), and it hides itself from assistive technology. -->
    <div
      data-part="compibert"
      class="pointer-events-none absolute bottom-4 left-0 z-3"
    >
      <CompibertRig
        variant="full"
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
