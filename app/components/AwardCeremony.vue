<script setup lang="ts">
import type { CeremonyModel } from '~/utils/ceremony'

// The end frame of the Award ceremony (#309, spec #308, reference AwardCeremony.dc.html): the banner, the places from second to last,
// the winner card with its stamp, the Winners' people as avatars and Compibert on the ground (the rig, #311). Presentational: the layer owns when
// it shows and how it closes. The frame itself has no motion (the Pokal-Lauf comes with #312); under reduced motion this frame is the whole show.
// A Tie lists every Winner's Team name on a neutral card until the approved design replaces it (#315).
const props = defineProps<{
  model: CeremonyModel
  /** The id of the banner's heading, which names the dialog the layer puts around this. */
  headingId: string
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
</script>

<template>
  <div
    class="relative flex min-h-full flex-col items-center gap-[18px] px-[18px] pt-[22px] text-ink"
    :style="{ paddingBottom: ground }"
  >
    <h2
      :id="headingId"
      class="m-0 flex justify-center font-normal"
    >
      <span
        class="rounded-[14px] border-(length:--cp-bw) border-line bg-primary px-6 py-2 font-display text-[clamp(32px,5vw,52px)] leading-none text-on-primary shadow-card"
        style="transform: rotate(-4deg)"
      >{{ t('ceremony.banner') }}</span>
    </h2>

    <div class="flex w-full max-w-[820px] flex-wrap items-start justify-center gap-x-7 gap-y-5">
      <div class="flex max-w-full flex-none flex-col items-center gap-4">
        <div
          data-testid="winner-card"
          class="relative w-[240px] max-w-full overflow-hidden rounded-[16px] border-(length:--cp-bw) border-line bg-surface shadow-card"
          :class="tie ? 'min-h-[160px]' : 'h-[160px]'"
        >
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
          <!-- The stamp is a physical sticker: fixed in both modes. -->
          <span
            class="absolute right-3 bottom-3 rounded-[6px] border-[3px] border-hot bg-surface px-2.5 py-0.5 font-num text-[20px] text-hot"
            style="transform: rotate(-8deg)"
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
    <div class="pointer-events-none absolute bottom-4 left-2 md:left-4">
      <CeremonyCompibert :size="compibert" />
    </div>
  </div>
</template>
