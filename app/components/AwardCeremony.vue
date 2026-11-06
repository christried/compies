<script setup lang="ts">
import type { CeremonyModel } from '~/utils/ceremony'
import type { RigState } from '~/utils/compibert-rig'

// The Award ceremony's stage (#309, spec #308, reference AwardCeremony.dc.html): the banner, the places from second to last, the winner card
// with its stamp, the Winners' people as avatars, Compibert on the ground (the rig, #311) and the trophy he carries. Presentational: the
// layer owns when it shows, how it closes and the clock. The static markup is the end frame (what a reader without JS, a failed GSAP chunk
// and reduced motion see); the Pokal-Lauf (#312, `app/utils/ceremony-run.ts`) takes the `data-part` elements to their first frame and plays
// them from there. A Tie lists every Winner's Team name on a neutral card until the approved design replaces it (#315).
const props = defineProps<{
  model: CeremonyModel
  /** The id of the banner's heading, which names the dialog the layer puts around this. */
  headingId: string
  /** Compibert's pose: the layer decides it (the run's timeline, the end frame, reduced motion). */
  state: RigState
}>()

const { t } = useI18n()
// A phone (below md, as AppShell's side panel) gets the smaller sizes of the reference's `mob` variant.
const roomy = useMediaQuery('(min-width: 48rem)')
const avatar = computed(() => (roomy.value ? 80 : 64))
const compibert = computed(() => (roomy.value ? 150 : 120))
/** The cell of a person is a little wider than the avatar; three cells make a row. */
const cell = computed(() => avatar.value + 16)
const tie = computed(() => props.model.winners.length > 1)
const first = computed(() => props.model.winners[0]!)
/** Room for Compibert under the content: his height (the full pose is 404 : 344) and the ground. */
const ground = computed(() => `${Math.round(compibert.value * 344 / 404) + 34}px`)

const root = useTemplateRef<HTMLElement>('root')
const card = useTemplateRef<HTMLElement>('card')
const confetti = useTemplateRef('confetti')

/** The stamp's confetti: 40 pieces on a desktop, 20 on a phone (04-motion § Confetti), from just above the card's middle. */
function burst() {
  if (!card.value) return
  confetti.value?.burst(card.value.offsetLeft + card.value.offsetWidth / 2, card.value.offsetTop - 10, roomy.value ? 40 : 20)
}

defineExpose({ root, burst })
</script>

<template>
  <div
    ref="root"
    class="relative flex min-h-full flex-col items-center gap-[18px] px-[18px] pt-[22px] text-ink"
    :style="{ paddingBottom: ground }"
  >
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

    <div class="flex w-full max-w-[820px] flex-wrap items-start justify-center gap-x-7 gap-y-5">
      <div class="flex max-w-full flex-none flex-col items-center gap-4">
        <div
          ref="card"
          data-testid="winner-card"
          data-part="card"
          class="relative w-[240px] max-w-full overflow-hidden rounded-[16px] border-(length:--cp-bw) border-line bg-surface shadow-card"
          :class="tie ? 'min-h-[160px]' : 'h-[160px]'"
        >
          <!-- The back is the end frame and stays in flow, so a Tie's card grows with its list; the front lies over it until the card flips. -->
          <div data-part="back">
            <!-- A Tie has no one team's colour: a neutral header with every Winner's Team name as plain text (#315 replaces this). -->
            <div
              v-if="tie"
              class="flex flex-col justify-center border-b-(length:--cp-bw) border-line bg-paper-2 px-3 py-2 text-[16px] font-extrabold"
            >
              <ul
                data-testid="winners"
                class="m-0 flex list-none flex-col gap-1 p-0"
              >
                <li
                  v-for="winner in model.winners"
                  :key="winner.team"
                  class="[overflow-wrap:anywhere]"
                >
                  {{ winner.name }}
                </li>
              </ul>
            </div>
            <div
              v-else
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
            v-for="(person, index) in model.people"
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
         `shareAtMs`) and out of flow in the corner the stage leaves free: the buttons appear mid-run, and a row in the content's flow would
         grow the stage then and move the ground and Compibert, which the run measured. -->
    <div
      data-part="share"
      class="absolute right-[18px] bottom-[34px] z-6 flex flex-wrap justify-end gap-2.5"
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
