<script setup lang="ts">
import LuckyWheel from '~/components/LuckyWheel.vue'
import VetoWindow from '~/components/VetoWindow.vue'
import {
  CANDIDATE_BASE, CUE_BRIEF, MOMENT_OF, arrivalCues, buildRun, candidatesOf, choicesReport, configFor, emptyChoices, stampCues, testCandidateOf,
  type ArrivalButton, type Candidate, type Choices, type Controls, type Run,
} from '~/dev/listening-model'
import { createCuePlayer, type CuePlayer } from '~/utils/cue-player'
import { CUE_IDS, CUE_VOLUME, TICK_MIN_GAP_MS, type CueId } from '~/utils/sound-cues'
import type { WheelView } from '~~/shared/stage'

// The listening page for the cue sounds (#534, the session of #535): a tool for the operator on `pnpm dev`, no design. It lists the eleven
// cues with their candidate files, plays each alone, plays a test spin and a test Veto window through the REAL cue plans and the REAL cue
// player beside the REAL wheel, and keeps the eleven choices where the agent can read them back. Only the `listening-page` module of
// nuxt.config.ts registers it (dev server only, stage.ts); it is no part of any build. UI text is plain German here, not in de.json: a dev
// tool has no shipped copy. The logic is in listening-model.ts, which has a unit test; this page has none.

const STORAGE_KEY = 'compies-listening-choices'
const RETRY_MS = 100
const RETRIES = 10

const serverNow = () => Date.now()
const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms))

const byCue = ref(candidatesOf({ cues: {} }).byCue)
const problems = ref<string[]>([])
const choices = ref<Choices>(emptyChoices())

const controls = reactive<Controls>({
  spin: 'none', window: 'none', start: 'beginning', clip: true, vetoes: 0, hidden: false, reduced: false, tickGapMs: TICK_MIN_GAP_MS,
})
/** The tick cap the session settles on is part of the read-back; it is the control's value. */
const tickGapMs = toRef(controls, 'tickGapMs')

const run = shallowRef<Run | null>(null)
/** The wheel as the run's read gives it: at the end of the window plus a moment the reveal comes in and the tiles turn. */
const liveWheel = shallowRef<WheelView | null>(null)
const failed = ref<Record<string, boolean>>({})
const logText = ref('')

let context: AudioContext | null = null
let armed: CuePlayer | null = null
const alone = new Map<string, CuePlayer>()
let timer: ReturnType<typeof setTimeout> | undefined
let logTimer: ReturnType<typeof setInterval> | undefined
let counter = 0
let motionBefore: string | undefined

const report = computed(() => choicesReport(byCue.value, choices.value, tickGapMs.value))
const globals = globalThis as { __compiesListeningChoices?: () => typeof report.value, webkitAudioContext?: typeof AudioContext }

useHead({ title: 'Hörsitzung (nur Entwicklung)' })

async function bytesOf(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.arrayBuffer()
}

/** The page's one context, made on the first click: `resume()` runs inside that click, as iOS and Chrome want it. */
async function ensureContext(): Promise<AudioContext | null> {
  if (!context) {
    const Context = globalThis.AudioContext ?? globals.webkitAudioContext
    if (!Context) return null
    context = new Context()
    await context.resume()
    armPlayer()
  }
  else if (context.state !== 'running') {
    await context.resume()
  }
  return context
}

/** A fresh player for runs, with the test file of each cue (the marked candidate, else the placeholder). Disposing the old one cancels its pending cues. */
function armPlayer() {
  armed?.dispose()
  armed = null
  if (!context) return
  armed = createCuePlayer({ context, serverNow, loadFile: id => bytesOf(testCandidateOf(byCue.value, choices.value, id).url) })
  armed.preload(CUE_IDS)
}

function stopRun() {
  clearTimeout(timer)
  timer = undefined
  run.value = null
  liveWheel.value = null
  armPlayer()
}

function disposeAlone() {
  for (const player of alone.values()) player.dispose()
  alone.clear()
  failed.value = {}
}

/** One candidate alone, through the real player at the cue's relative volume. `playNow` skips a buffer that is not decoded yet, so it asks again until the log says `scheduled`. */
async function playAlone(id: CueId, candidate: Candidate) {
  const audio = await ensureContext()
  if (!audio) return
  const key = `${id}/${candidate.name}`
  let player = alone.get(key)
  if (!player) {
    player = createCuePlayer({ context: audio, serverNow, loadFile: () => bytesOf(candidate.url) })
    alone.set(key, player)
    player.preload([id])
  }
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const last = player.log.at(-1)
    player.playNow(id)
    const line = player.log.at(-1)
    if (line !== last && line?.outcome === 'scheduled') {
      failed.value = { ...failed.value, [key]: false }
      return
    }
    await sleep(RETRY_MS)
  }
  failed.value = { ...failed.value, [key]: true }
}

function setMotion(reduced: boolean) {
  document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'
}

/** A test run: the wheel, the window or both, built through the real plans; the player gets the whole plan, the page the visuals. */
async function startRun(kind: 'spin' | 'window' | 'both') {
  if (!await ensureContext() || !armed) return
  clearTimeout(timer)
  const config = configFor(kind, controls)
  // Before the run starts: the wheel reads the motion setting at its mount and at a new draw.
  setMotion(config.reduced)
  const built = buildRun(config, Date.now(), ++counter)
  run.value = built
  liveWheel.value = built.wheel
  armed.setPlan(built.plan)
  const draw = built.draw
  if (built.revealAt !== null && draw !== null) {
    timer = setTimeout(() => {
      // The read that follows the window's end: the tiles turn and the stamps sound, exactly as the Event page's watch plays them.
      liveWheel.value = { ...built.wheel, vetoes: { ...built.wheel.vetoes, revealed: built.revealed } }
      for (const cue of stampCues(draw, built.revealed.length, Date.now())) armed?.playNow(cue.id, cue.delayMs)
    }, Math.max(built.revealAt - Date.now(), 0))
  }
}

async function arrive(button: ArrivalButton) {
  if (!await ensureContext() || !armed) return
  for (const cue of arrivalCues(button, Date.now())) armed.playNow(cue.id, cue.delayMs)
}

/** The cue's default moment with the current controls: a spin, a window, or for `veto-seal` the own cast. `wheel-morph` needs the Hidden wheel. */
function playMoment(id: CueId) {
  const moment = MOMENT_OF[id]
  if (moment === 'arrival') return void arrive('own')
  if (id === 'wheel-morph') controls.hidden = true
  void startRun(moment === 'spin' ? 'spin' : 'window')
}

function choose(id: CueId, name: string | null) {
  choices.value = { ...choices.value, [id]: { candidate: name, noneFits: name === null } }
}
const isMarked = (id: CueId, candidate: Candidate) => !choices.value[id].noneFits && choices.value[id].candidate === candidate.name

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ choices: choices.value, tickMinGapMs: tickGapMs.value }))
  }
  catch {
    // Storage blocked: the choices last until reload (useSound does the same).
  }
}

// A changed selection changes the test files and stops a running run.
watch(choices, () => {
  persist()
  stopRun()
}, { deep: true })
watch(tickGapMs, persist)

async function loadManifest() {
  let manifest: unknown = { cues: {} }
  let fetchProblem: string | null = null
  try {
    const response = await fetch(`${CANDIDATE_BASE}/manifest.json`)
    if (!response.ok) fetchProblem = `manifest.json lädt nicht (${response.status}).`
    else manifest = await response.json()
  }
  catch {
    fetchProblem = 'manifest.json lädt nicht oder ist kein JSON.'
  }
  const read = candidatesOf(manifest)
  byCue.value = read.byCue
  problems.value = fetchProblem ? [fetchProblem] : read.problems
  // The files on disk may have changed: nothing decoded before is trusted.
  disposeAlone()
  stopRun()
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(report.value, null, 2))
  }
  catch {
    // No clipboard: the text is in the box below.
  }
}

function refreshLog() {
  logText.value = (armed?.log ?? []).slice(-24).map(line => `${new Date(line.at).toISOString().slice(11, 23)} ${line.id} ${line.outcome}`).join('\n')
}

onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { choices?: Partial<Choices>, tickMinGapMs?: number } | null
    if (stored?.choices) {
      const next = emptyChoices()
      for (const id of CUE_IDS) {
        const choice = stored.choices[id]
        if (choice && (typeof choice.candidate === 'string' || choice.candidate === null) && typeof choice.noneFits === 'boolean') next[id] = { candidate: choice.candidate, noneFits: choice.noneFits }
      }
      choices.value = next
    }
    if (typeof stored?.tickMinGapMs === 'number' && stored.tickMinGapMs > 0) controls.tickGapMs = stored.tickMinGapMs
  }
  catch {
    // Storage blocked or not our JSON: start undecided.
  }
  motionBefore = document.documentElement.dataset.motion
  globals.__compiesListeningChoices = () => report.value
  logTimer = setInterval(refreshLog, 500)
  void loadManifest()
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  clearInterval(logTimer)
  armed?.dispose()
  disposeAlone()
  try {
    void context?.close().catch(() => {})
  }
  catch {
    // Closed already: the page is going anyway.
  }
  context = null
  Reflect.deleteProperty(globals, '__compiesListeningChoices')
  if (motionBefore === undefined) delete document.documentElement.dataset.motion
  else document.documentElement.dataset.motion = motionBefore
})

const BUTTON = 'rounded border border-line bg-surface px-2 py-1 text-[14px] font-semibold text-ink'
const FIELD = 'rounded border border-line bg-surface px-1.5 py-0.5 text-ink'
</script>

<template>
  <main
    class="mx-auto flex w-full max-w-[960px] flex-col gap-4 bg-paper-2 p-4 text-[14px] text-ink"
    data-testid="compies-listening-page"
  >
    <h1 class="m-0 text-[22px] font-extrabold">
      Hörsitzung: die elf Töne
    </h1>
    <p class="m-0 text-ink-2">
      Nur auf dem Entwicklungsserver. Kandidaten: <code>sound-candidates/</code> (manifest.json). Einen Kandidaten pro Ton markieren; der Kasten unten ist, was zurückgelesen wird.
    </p>

    <ul
      v-if="problems.length > 0"
      class="m-0 flex flex-col gap-1 pl-5 font-semibold text-error"
      data-testid="listening-problems"
    >
      <li
        v-for="problem in problems"
        :key="problem"
      >
        {{ problem }}
      </li>
    </ul>

    <section
      class="flex flex-col gap-3 rounded border border-line bg-surface p-3"
      aria-label="Steuerung"
    >
      <h2 class="m-0 text-[16px] font-extrabold">
        Test im Moment
      </h2>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label>Drehung
          <select
            v-model="controls.spin"
            :class="FIELD"
          >
            <option value="none">keine</option>
            <option value="6">6 s</option>
            <option value="10">10 s</option>
          </select>
        </label>
        <label><input
          v-model="controls.hidden"
          type="checkbox"
        > Hidden wheel</label>
        <label><input
          v-model="controls.reduced"
          type="checkbox"
        > Reduzierte Bewegung</label>
        <label>Fenster
          <select
            v-model="controls.window"
            :class="FIELD"
          >
            <option value="none">keins</option>
            <option value="40">40 s</option>
            <option value="150">150 s</option>
          </select>
        </label>
        <label>Start
          <select
            v-model="controls.start"
            :class="FIELD"
          >
            <option value="beginning">von Anfang</option>
            <option value="last12">letzte 12 s</option>
          </select>
        </label>
        <label><input
          v-model="controls.clip"
          type="checkbox"
        > Clip dabei</label>
        <label>Vetos beim Aufdecken
          <select
            v-model.number="controls.vetoes"
            :class="FIELD"
          >
            <option :value="0">0</option>
            <option :value="1">1</option>
            <option :value="2">2</option>
          </select>
        </label>
        <label>Tick-Abstand (ms)
          <input
            v-model.number="controls.tickGapMs"
            type="number"
            min="1"
            step="5"
            :class="[FIELD, 'w-20']"
          >
        </label>
        <button
          type="button"
          :class="BUTTON"
          @click="controls.tickGapMs = TICK_MIN_GAP_MS"
        >
          Zurück auf {{ TICK_MIN_GAP_MS }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          :class="BUTTON"
          @click="startRun('spin')"
        >
          Test spin
        </button>
        <button
          type="button"
          :class="BUTTON"
          @click="startRun('window')"
        >
          Test window
        </button>
        <button
          type="button"
          :class="BUTTON"
          @click="startRun('both')"
        >
          Spin + window
        </button>
        <button
          type="button"
          :class="BUTTON"
          @click="stopRun()"
        >
          Stop
        </button>
        <button
          type="button"
          :class="BUTTON"
          @click="loadManifest()"
        >
          Neu laden
        </button>
        <span
          v-if="run"
          class="text-ink-2"
          data-testid="listening-run"
        >
          Plan: {{ run.plan.length }} Töne, {{ run.tickCount }} Ticks bei {{ controls.tickGapMs }} ms
        </span>
      </div>
      <p
        v-if="controls.start === 'last12'"
        class="m-0 text-ink-2"
      >
        „Letzte 12 s“ gilt nur für Test window; Spin + window startet von Anfang.
      </p>
    </section>

    <div
      v-if="run"
      class="flex w-full max-w-3xl flex-col gap-4"
    >
      <LuckyWheel
        v-if="run.spin && liveWheel"
        :key="run.drawId"
        :wheel="liveWheel"
        :hidden="liveWheel.slices === null"
        :is-host="false"
        :server-now="serverNow"
      />
      <VetoWindow
        v-if="run.draw && liveWheel"
        :key="run.drawId"
        :wheel="liveWheel"
        :teams="[]"
        :server-now="serverNow"
      />
    </div>

    <section
      v-for="id in CUE_IDS"
      :key="id"
      class="flex flex-col gap-2 rounded border border-line bg-surface p-3"
      :data-testid="`listening-cue-${id}`"
    >
      <h2 class="m-0 text-[16px] font-extrabold">
        <code>{{ id }}</code>
      </h2>
      <p class="m-0 text-ink-2">
        {{ CUE_BRIEF[id].character }} · {{ CUE_BRIEF[id].lengthMs }} ms{{ CUE_BRIEF[id].loop ? ' (Schleife)' : '' }} · Vol {{ CUE_VOLUME[id] }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          :class="BUTTON"
          @click="playMoment(id)"
        >
          In ihrem Moment
        </button>
        <span class="text-ink-2">
          {{ MOMENT_OF[id] === 'spin' ? 'Test spin' : MOMENT_OF[id] === 'window' ? 'Test window' : 'Ankunft der Antwort' }}
        </span>
        <template v-if="id === 'veto-seal'">
          <button
            type="button"
            :class="BUTTON"
            @click="arrive('own')"
          >
            Eigenes Veto
          </button>
          <button
            type="button"
            :class="BUTTON"
            @click="arrive('reveal-1')"
          >
            Aufdecken: 1 Veto
          </button>
          <button
            type="button"
            :class="BUTTON"
            @click="arrive('reveal-2')"
          >
            Aufdecken: 2 Vetos
          </button>
        </template>
        <button
          v-if="id === 'veto-open'"
          type="button"
          :class="BUTTON"
          @click="arrive('set')"
        >
          Gesetztes Spiel
        </button>
      </div>
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        <li
          v-for="candidate in byCue[id]"
          :key="candidate.name"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft pt-1"
        >
          <button
            type="button"
            :class="BUTTON"
            @click="playAlone(id, candidate)"
          >
            Abspielen
          </button>
          <strong>{{ candidate.name }}</strong>
          <span>
            <a
              v-if="candidate.source.startsWith('http')"
              :href="candidate.source"
              target="_blank"
              rel="noopener"
              class="underline"
            >{{ candidate.source }}</a>
            <template v-else>{{ candidate.source }}</template>
          </span>
          <span>{{ candidate.author ?? 'kein Autor' }}</span>
          <span>{{ candidate.licence }}</span>
          <span
            v-if="candidate.note"
            class="text-ink-2"
          >{{ candidate.note }}</span>
          <span
            v-if="failed[`${id}/${candidate.name}`]"
            class="font-semibold text-error"
          >Datei lädt nicht</span>
          <label class="ml-auto">
            <input
              type="radio"
              :name="`choice-${id}`"
              :checked="isMarked(id, candidate)"
              @change="choose(id, candidate.name)"
            > wählen
          </label>
        </li>
        <li class="flex justify-end border-t border-line-soft pt-1">
          <label>
            <input
              type="radio"
              :name="`choice-${id}`"
              :checked="choices[id].noneFits"
              @change="choose(id, null)"
            > keins passt
          </label>
        </li>
      </ul>
    </section>

    <section
      class="flex flex-col gap-2 rounded border border-line bg-surface p-3"
      aria-label="Auswahl"
    >
      <h2 class="m-0 text-[16px] font-extrabold">
        Auswahl
      </h2>
      <div>
        <button
          type="button"
          :class="BUTTON"
          @click="copyReport()"
        >
          Kopieren
        </button>
      </div>
      <pre
        class="m-0 overflow-x-auto text-[12px]"
        data-testid="listening-choices"
      >{{ JSON.stringify(report, null, 2) }}</pre>
    </section>

    <details class="rounded border border-line bg-surface p-3">
      <summary class="cursor-pointer font-semibold">
        Log des Players
      </summary>
      <pre class="m-0 text-[12px]">{{ logText }}</pre>
    </details>
  </main>
</template>
