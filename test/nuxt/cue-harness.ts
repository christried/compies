import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { expect, vi } from 'vitest'
import { useRuntimeConfig } from '#imports'
import type { CueLogEntry } from '~/utils/cue-player'
import { reducedMotion } from '~/utils/motion'
import { CUE_GROUPS, CUE_IDS, cueFilesOf, wheelCuePlan, wheelVoicePlan, type CueGroup, type CueId } from '~/utils/sound-cues'
import type { SpinView } from '~~/shared/stage'
import { FakeAudioContext } from '../fake-audio'
import { kitty, signInAs } from './auth'

// What the Event page's cue tests share (event-cues*.test.ts, event-sound-unlock*.test.ts; #830, review 0.17 S3 and Q2): the cue files a test serves and
// counts, the fake audio context the page made, the cue log, and the body of the `beforeEach` and `afterEach` around them. A file keeps its own
// fixtures, its own mounting and its assertions. The audio context is the fake of test/fake-audio.ts; the page's motion setting is test/nuxt/motion.ts.

export const iso = (ms: number) => new Date(ms).toISOString()

/** The requests each cue file got, by id. */
export const requests: Record<string, number> = {}

/**
 * Serves every cue file; the handlers answer with the cue id as bytes, which the fake decodes back to `{ id }`. A file calls this once at its top
 * level, as `registerEndpoint` is (a file that serves no cue file, such as event-sound-unlock.test.ts, does not call it).
 */
export function serveCueFiles() {
  for (const id of CUE_IDS) {
    registerEndpoint(`/sounds/cues/${id}.wav`, () => {
      requests[id] = (requests[id] ?? 0) + 1
      return new TextEncoder().encode(id)
    })
  }
}

/** Forgets what was requested: a test that mounts a second page starts the count again. */
export function resetRequests() {
  for (const id of CUE_IDS) requests[id] = 0
}

/** The ids of the files that were requested, sorted. */
export const requested = () => Object.keys(requests).filter(id => requests[id]).sort()
/** The requested files of these groups: an assertion names the groups it is about, so another moment's files never break it (#718). */
export const requestedOf = (...groups: CueGroup[]) => requested().filter(id => CUE_GROUPS[id as CueId].some(group => groups.includes(group)))

/** The audio context the page made last. */
export const context = () => FakeAudioContext.instances.at(-1)
/** The sources that started, in the order they were told to. */
export const started = () => context()?.started() ?? []
export const startedOf = (id: CueId) => started().filter(source => source.id === id)
/** The cue log of a staging build, which is the player's own (`window.__compiesCueLog`, #537): every line, in order. */
export const cueLog = () => (globalThis as { __compiesCueLog?: () => readonly CueLogEntry[] }).__compiesCueLog?.() ?? []

/** A browser that lets no sound through before a gesture: the context is made suspended. */
export class HeldContext extends FakeAudioContext {
  override state = 'suspended'
}

// The ids the fake decoded since the test began: `decodeAudioData` is the one step of a file's way (request, bytes, decode, buffer) that a test can see.
const decoded = new Set<string>()
const decodeAudioData = FakeAudioContext.prototype.decodeAudioData

/** Everything a cue test needs before the page mounts: the viewer, the fake as the browser's `AudioContext` (its clock follows the device's), no requests yet. */
export function setUpCuePage({ user = kitty, audio = FakeAudioContext, staging = false }: { user?: Parameters<typeof signInAs>[0], audio?: typeof FakeAudioContext, staging?: boolean } = {}) {
  signInAs(user)
  document.body.innerHTML = ''
  FakeAudioContext.instances = []
  FakeAudioContext.follows = true
  resetRequests()
  decoded.clear()
  vi.spyOn(FakeAudioContext.prototype, 'decodeAudioData').mockImplementation(function (this: FakeAudioContext, bytes: ArrayBuffer) {
    return (decodeAudioData.call(this, bytes) as Promise<{ id: string }>).then((buffer) => {
      decoded.add(buffer.id)
      return buffer
    })
  })
  vi.stubGlobal('AudioContext', audio)
  // The cue log is exposed in a staging build only.
  if (staging) useRuntimeConfig().public.staging = true
}

/** Puts back what `setUpCuePage` and a cue test changed. A file unmounts its page first, so the context closes while the fake is still the global. */
export function tearDownCuePage() {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  FakeAudioContext.follows = false
  localStorage.removeItem('compies-sound')
  Reflect.deleteProperty(document, 'visibilityState')
  document.documentElement.style.removeProperty('--cp-motion')
  useRuntimeConfig().public.staging = false
  Reflect.deleteProperty(globalThis, '__compiesCueLog')
}

/** The page has asked for the group's files and decoded them: the player is ready to play, with no sleep to guess it. */
export async function filesReady(group: CueGroup) {
  const files = cueFilesOf([group])
  await vi.waitFor(() => expect(files.filter(id => decoded.has(id))).toEqual(files))
  await flushPromises()
}

/**
 * Time for a sound that must NOT come to have come: an absence is the one thing a test cannot wait on, so this is a real-clock wait. A slow runner
 * can only make it too short (a missed extra sound), never make a test fail, so it is the one kind of sleep that stays.
 */
export const quiet = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * What the plan of a spin is on the Event page: the wheel's cues and Compibert's voice (#671). It mirrors `planOf` of useCuePlayer.ts for a viewer who
 * is not the Host and has no Hidden wheel, because how many ticks the wheel has is the plan's own thinning (`thinTicks`), which a fixture cannot
 * state without the function. A test compares only its length and its outcomes with it, never an instant.
 */
export const wheelPlanOf = (spin: SpinView) => [
  ...wheelCuePlan({ spin, hiddenWheel: false, isHost: false, reducedMotion: reducedMotion() }),
  ...wheelVoicePlan({ spin: { spinStartAt: spin.spinStartAt, stopAt: spin.stopAt }, hiddenWheel: false, reducedMotion: reducedMotion() }),
]
