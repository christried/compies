<script setup lang="ts">
import { settingsSentence, summaryRows } from '~/utils/settings-summary'
import type { EventSettings } from '~~/shared/settings'

// An Event's settings at a glance (#144): optionally the sentence („4 Teams à 2, Host-Wahl, 6 Spiele.“), then
// the key/value list (Format, Spiele, Punkte, Modus, later Pool and Termin). The Fertig screen shows it, and
// the Event page reuses it as „So wird gespielt“ (#148). The words come from app/utils/settings-summary.ts.
const props = withDefaults(defineProps<{
  settings: EventSettings
  /** Game pool sizes (#146 passes them). */
  pools?: { main: number, tiebreaker: number }
  /** The Date line, e.g. „Umfrage, 4 Vorschläge“. */
  dates?: string
  /** Show the sentence above the list. */
  sentence?: boolean
}>(), { pools: undefined, dates: undefined, sentence: false })

const { t } = useI18n()

const rows = computed(() => summaryRows(props.settings, t, { pools: props.pools, dates: props.dates }))
</script>

<template>
  <div class="flex flex-col gap-3">
    <p
      v-if="sentence"
      class="m-0 font-semibold text-pretty"
    >
      {{ settingsSentence(settings, t) }}
    </p>
    <dl class="m-0 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
      <div
        v-for="row in rows"
        :key="row.key"
        class="flex flex-col gap-0.5 rounded-xl border-2 border-line bg-surface px-3.5 py-3"
      >
        <dt class="text-[12px] font-bold text-ink-2">
          {{ row.label }}
        </dt>
        <dd class="m-0 font-extrabold">
          {{ row.value }}
        </dd>
      </div>
    </dl>
  </div>
</template>
