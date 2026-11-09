<script setup lang="ts">
import { Equal } from '@lucide/vue'
import { boxWithin } from '~/utils/ceremony-tie-run'
import { ceremonySizes } from '~/utils/ceremony-sizes'
import type { CeremonyLayout, CeremonyModel, CeremonyPerson, CeremonyWinner } from '~/utils/ceremony'
import type { RigState } from '~/utils/compibert-rig'

// The Award ceremony's stage (#309, spec #308, reference AwardCeremony.dc.html): the banner, the places from second to last, the winner card
// with its stamp, the Winners' people as avatars, Compibert on the ground (the rig, #311) and the trophy he carries. Presentational: the
// layer owns when it shows, how it closes and the clock. The static markup is the end frame (what a reader without JS, a failed GSAP chunk
// and reduced motion see); the Pokal-Lauf (#312, `app/utils/ceremony-run.ts`) takes the `data-part` elements to their first frame and plays
// them from there. A Tie (#315, 12-siegerehrung-unentschieden.md, reference Siegerehrung Unentschieden.dc.html frame()) stands under one shared
// plate „Platz 1“: a chain of cards joined by „=“ (2 Winners, on a wide screen 3) or a grid of compact cards, each with its Party's people.
// The stage keeps the banner, the lists with their `aria-label`s and `data-rows`, the people's `<li>`s, Compibert, the trophy, the share row and the
// confetti; a Winner's card (`CeremonyWinnerCard`) and a Standing's row (`CeremonyStandingRow`) are components (#364), and every size comes from `sizes`.
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
const winners = computed(() => props.model.winners)
const first = computed(() => winners.value[0]!)
// Every number that changes with `roomy` (the single card's people, a Tie's chain, grid and plate, Compibert, the ground, the confetti): `app/utils/ceremony-sizes.ts` (#328, #364).
const sizes = computed(() => ceremonySizes(roomy.value, props.layout, winners.value.length))

/** What a screen reader hears of a grid card's stack: the Party and its Players' names, the rest counted. */
function stackLabel(winner: CeremonyWinner) {
  const players = winner.people.flatMap((person: CeremonyPerson) => (person.kind === 'player' ? [person.name] : person.kind === 'more' ? [t('ceremony.more', { n: person.n })] : []))
  return players.length === 0 ? winner.name : t('ceremony.tie.stack', { team: winner.name, players: players.join(', ') })
}

const root = useTemplateRef<HTMLElement>('root')
const confetti = useTemplateRef('confetti')

/** Confetti, from just above a card's or the plate's top centre: the stamp's, or the trophy's landing on the card of a chain (`index`). Counts: `sizes.confetti`. */
function burst(target: 'stamp' | number = 'stamp') {
  const stage = root.value
  const count = typeof target === 'number' ? sizes.value.confetti.card : sizes.value.confetti.stamp
  if (sizes.value.stage.kind === 'single') {
    // The card is a component's root now (#364): found by its part, and the stage is its offsetParent as before.
    const card = stage?.querySelector<HTMLElement>('[data-part="card"]')
    if (!card) return
    confetti.value?.burst(card.offsetLeft + card.offsetWidth / 2, card.offsetTop - 10, count)
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
    :style="{ paddingBottom: `${sizes.ground.paddingBottom}px` }"
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
      v-if="sizes.stage.kind === 'single'"
      class="flex w-full max-w-[820px] flex-wrap items-start justify-center gap-x-7 gap-y-5"
    >
      <div class="flex max-w-full flex-none flex-col items-center gap-4">
        <CeremonyWinnerCard
          :winner="first"
          :stage="sizes.stage"
        />

        <ul
          :aria-label="t('ceremony.players')"
          class="m-0 flex list-none flex-wrap justify-center gap-x-2.5 gap-y-3 p-0"
          :style="{ maxWidth: `${sizes.stage.peopleMaxWidth}px` }"
        >
          <li
            v-for="(person, index) in first.people"
            :key="index"
            data-part="person"
            class="flex flex-col items-center gap-1.5"
            :style="{ width: `${sizes.stage.cellWidth}px` }"
          >
            <CeremonyPersonCell
              :person="person"
              :size="sizes.stage.avatarSize"
            />
          </li>
        </ul>
      </div>

      <ol
        v-if="model.rows.length > 0"
        :aria-label="t('ceremony.standings')"
        class="m-0 flex max-w-[420px] min-w-0 flex-[1_1_300px] list-none flex-col gap-2.5 p-0"
      >
        <CeremonyStandingRow
          v-for="row in model.rows"
          :key="row.team"
          :row="row"
          variant="side"
        />
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
            :style="{ width: `${sizes.groupWidth}px`, height: `${sizes.plate.height}px` }"
          >
            <span
              class="absolute top-0 bottom-0 left-3 flex items-center font-num leading-none"
              :style="{ fontSize: `${sizes.plate.labelFontSize}px` }"
            >{{ t('ceremony.place1') }}</span>
            <!-- „???“ becomes the stamp; the static end frame has the stamp and no „???“, as the single card has no front. -->
            <span class="relative grid place-items-center">
              <span
                data-part="plate-stamp"
                class="-rotate-3 rounded-[6px] border-[3px] border-hot bg-surface px-2.5 py-0.5 font-num leading-[1.15] text-hot uppercase"
                :style="{ fontSize: `${sizes.plate.stampFontSize}px` }"
              >{{ t('ceremony.tie.plateStamp') }}</span>
              <span
                data-part="plate-front"
                aria-hidden="true"
                class="absolute inset-0 grid place-items-center font-num opacity-0"
                :style="{ fontSize: `${sizes.plate.stampFontSize}px` }"
              >???</span>
            </span>
          </div>

          <ol
            v-if="sizes.stage.kind === 'chain'"
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
                :style="{ gap: `${sizes.stage.peopleGap}px` }"
              >
                <CeremonyWinnerCard
                  :winner="winner"
                  :stage="sizes.stage"
                />
                <ul
                  :aria-label="winner.name"
                  data-part="party"
                  class="m-0 flex list-none flex-wrap justify-center p-0"
                  :style="{ width: `${sizes.stage.cardWidth}px`, gap: `10px ${sizes.stage.cellGapX}px` }"
                >
                  <li
                    v-for="(person, at) in winner.people"
                    :key="at"
                    data-part="person"
                    class="flex flex-col items-center gap-[5px]"
                    :style="{ width: `${sizes.stage.cellWidth}px` }"
                  >
                    <CeremonyPersonCell
                      :person="person"
                      :size="sizes.stage.avatarSize"
                      :name-font-size="sizes.stage.personNameFontSize"
                    />
                  </li>
                </ul>
              </div>
              <div
                v-if="index < winners.length - 1"
                data-part="badge"
                aria-hidden="true"
                class="flex flex-none items-center justify-center"
                :style="{ width: `${sizes.stage.badgeGap}px`, height: `${sizes.stage.cardHeight}px` }"
              >
                <span
                  class="box-border grid place-items-center rounded-pill border-[2.5px] border-line bg-primary text-on-primary shadow-sm"
                  :style="{ width: `${sizes.stage.badgeSize}px`, height: `${sizes.stage.badgeSize}px` }"
                >
                  <Equal
                    :size="sizes.stage.badgeIconSize"
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
            :style="{ gap: `${sizes.stage.cardGap}px`, width: `${sizes.groupWidth}px` }"
          >
            <CeremonyWinnerCard
              v-for="winner in winners"
              :key="winner.team"
              :winner="winner"
              :stage="sizes.stage"
            >
              <ul
                :aria-label="stackLabel(winner)"
                data-part="stack"
                class="m-0 flex list-none items-center p-0"
              >
                <li
                  v-for="(person, at) in winner.people"
                  :key="at"
                  class="flex"
                  :style="{ marginLeft: at > 0 ? `${-sizes.stage.avatarOverlap}px` : '0' }"
                >
                  <CeremonyPersonCell
                    :person="person"
                    :size="sizes.stage.avatarSize"
                    stack
                  />
                </li>
              </ul>
            </CeremonyWinnerCard>
          </ol>
        </div>

        <ol
          v-if="layout.rows === 'side' || layout.rows === 'below'"
          :aria-label="t('ceremony.standings')"
          :data-rows="layout.rows"
          class="m-0 flex list-none flex-col p-0"
          :class="layout.rows === 'side' ? 'mt-[52px] w-[380px] flex-none gap-2.5' : 'mt-1 w-full gap-2'"
        >
          <CeremonyStandingRow
            v-for="row in model.rows"
            :key="row.team"
            :row="row"
            :variant="layout.rows"
          />
        </ol>
      </div>

      <ol
        v-if="layout.rows === 'chips'"
        :aria-label="t('ceremony.standings')"
        data-rows="chips"
        class="m-0 flex max-w-full list-none flex-wrap justify-center gap-2 p-0"
      >
        <CeremonyStandingRow
          v-for="row in model.rows"
          :key="row.team"
          :row="row"
          variant="chips"
        />
      </ol>
    </template>

    <div
      aria-hidden="true"
      class="absolute inset-x-0 bottom-0 h-[22px] border-t-(length:--cp-bw) border-line bg-paper-2"
    />
    <!-- Compibert's box starts at the stage's left edge: the run's x is a stage coordinate (ceremony-run.ts). The rig (#311), sized by `sizes.compibert`,
         holds the pose the layer decides (the run's timeline, then the dance; under reduced motion the cheer,
         held). It is mounted with the layer's dialog only, so GSAP loads when the ceremony opens and never on a finished Event page that
         stays closed (ADR 0015), and it hides itself from assistive technology. -->
    <div
      data-part="compibert"
      class="pointer-events-none absolute bottom-4 left-0 z-3"
    >
      <CompibertRig
        variant="full"
        :size="sizes.compibert"
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
         his box's top (`ground.shareBottom`, 136 px), with the stage's bottom padding holding that room from the first frame. -->
    <div
      data-part="share"
      class="absolute z-6 flex flex-wrap gap-2.5"
      :class="roomy ? 'right-[18px] justify-end' : 'left-[18px] right-[18px] justify-center'"
      :style="{ bottom: `${sizes.ground.shareBottom}px` }"
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
