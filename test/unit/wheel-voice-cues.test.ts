import { describe, expect, it } from 'vitest'
import type { SpinView } from '~~/shared/stage'
import { mascotMoments } from '../../app/utils/wheel-mascot'
import { REVEAL_AFTER_MS } from '../../app/utils/wheel'
import { wheelCuePlan, wheelVoicePlan, type Cue, type WheelCueInput, type WheelVoiceInput } from '../../app/utils/sound-cues'

// Compibert's voice at the wheel (#671, spec #718 § Secrecy „The Hidden wheel“): `cb-hype`, `cb-gulp` and `cb-yay` are a function of the
// spin's two instants, the Hidden wheel setting and reduced motion, exactly what he is told (`mascotMoments`). Expected instants come from
// `mascotMoments` and `REVEAL_AFTER_MS`, never from copied numbers.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()
const instants = (ms: number) => ({ spinStartAt: iso(START), stopAt: iso(START + ms) })
const moments = (ms: number, hidden = false, reduced = false) => mascotMoments({ spinStartAt: START, stopAt: START + ms }, hidden, reduced)

const OPEN: Omit<WheelVoiceInput, 'spin'> = { hiddenWheel: false, reducedMotion: false }
const voice = (ms: number | null, rest: Partial<Omit<WheelVoiceInput, 'spin'>> = {}) =>
  wheelVoicePlan({ spin: ms === null ? null : instants(ms), ...OPEN, ...rest })
const pairs = (cues: Cue[]) => cues.map(cue => [cue.id, cue.at])

describe('wheelVoicePlan keeps the drawn game secret', () => {
  // The two spins share the two instants and differ in everything else the Event read sends of a draw. They go in through a variable so
  // the excess-property check does not hide the point: the plan must not look at any of it.
  const spinWith = (draw: Partial<SpinView>) => ({
    ...instants(6000), slices: 5, resultIndex: 3, resultOffset: 0.25, labels: null, game: null, ...draw,
  })
  const one = spinWith({ slices: 5, resultIndex: 3, resultOffset: 0.25, labels: ['Halo', 'a', 'b', 'c', 'd'] })
  const other = spinWith({ slices: 30, resultIndex: 17, resultOffset: 0.9, labels: ['???', '???'], game: { id: 'g-x', name: 'X' } as never })

  describe.each([
    ['a Member under a Hidden wheel', { hiddenWheel: true, isHost: false }],
    ['the Host under a Hidden wheel', { hiddenWheel: true, isHost: true }],
    ['a Member on a visible wheel', { hiddenWheel: false, isHost: false }],
    ['the Host on a visible wheel', { hiddenWheel: false, isHost: true }],
  ])('for %s', (_who, viewer) => {
    it.each([false, true])('is the same for two spins that differ only in the drawn game (reduced motion %s)', (reducedMotion) => {
      const a = wheelVoicePlan({ spin: one, hiddenWheel: viewer.hiddenWheel, reducedMotion })
      const b = wheelVoicePlan({ spin: other, hiddenWheel: viewer.hiddenWheel, reducedMotion })

      expect(a).toEqual(b)
      expect(a.length).toBeGreaterThan(0)
    })
  })

  it('has no field the viewer may not know and none for the Host: the type holds exactly three', () => {
    const input: WheelVoiceInput = { spin: instants(6000), hiddenWheel: false, reducedMotion: false }
    expect(Object.keys(input).sort()).toEqual(['hiddenWheel', 'reducedMotion', 'spin'])
    expect(Object.keys(instants(6000)).sort()).toEqual(['spinStartAt', 'stopAt'])
  })
})

describe('wheelVoicePlan: the Host and a Member hear the same voice', () => {
  const spin = { ...instants(6000), slices: 5, resultIndex: 3, resultOffset: 0.25 }
  const wheelOf = (isHost: boolean, hiddenWheel: boolean): WheelCueInput => ({ spin, hiddenWheel, isHost, reducedMotion: false })
  const wholeOf = (isHost: boolean, hiddenWheel: boolean) => [
    ...wheelCuePlan(wheelOf(isHost, hiddenWheel)),
    ...wheelVoicePlan({ spin: { spinStartAt: spin.spinStartAt, stopAt: spin.stopAt }, hiddenWheel, reducedMotion: false }),
  ]

  it('differ under a Hidden wheel in the Member\'s wheel-morph only', () => {
    const host = wholeOf(true, true)
    const member = wholeOf(false, true)

    expect(member.filter(cue => !host.some(h => h.id === cue.id && h.at === cue.at))).toEqual([{ id: 'wheel-morph', at: START + 6000 + REVEAL_AFTER_MS }])
    expect(host.filter(cue => !member.some(m => m.id === cue.id && m.at === cue.at))).toEqual([])
    expect(member.filter(cue => cue.id.startsWith('cb-'))).toEqual(host.filter(cue => cue.id.startsWith('cb-')))
  })

  it('do not differ at all on a visible wheel', () => {
    expect(wholeOf(false, false)).toEqual(wholeOf(true, false))
  })
})

describe('wheelVoicePlan on an open wheel', () => {
  it.each([6000, 10_000])('gives hype at the start, gulp at the brake and yay at the stop for a spin of %s ms', (ms) => {
    const m = moments(ms)

    expect(pairs(voice(ms))).toEqual([['cb-hype', START], ['cb-gulp', m.brakeAt], ['cb-yay', m.cheerAt]])
    expect(m.cheerAt).toBe(START + ms)
  })
})

describe('wheelVoicePlan under a Hidden wheel', () => {
  it('moves the cheer to the reveal, half a second after the stop, and nothing else', () => {
    const m = moments(6000, true)

    expect(pairs(voice(6000, { hiddenWheel: true }))).toEqual([['cb-hype', START], ['cb-gulp', m.brakeAt], ['cb-yay', START + 6000 + REVEAL_AFTER_MS]])
    expect(pairs(voice(6000, { hiddenWheel: true })).slice(0, 2)).toEqual(pairs(voice(6000)).slice(0, 2))
  })
})

describe('wheelVoicePlan under reduced motion', () => {
  it.each([false, true])('plays only the cheer, at the same instant as without it (Hidden wheel %s)', (hiddenWheel) => {
    const full = voice(6000, { hiddenWheel })
    const calm = voice(6000, { hiddenWheel, reducedMotion: true })

    expect(calm).toEqual([full.find(cue => cue.id === 'cb-yay')])
  })
})

describe('wheelVoicePlan, edges', () => {
  it('gives no cue before the first spin', () => {
    expect(voice(null)).toEqual([])
  })

  it('keeps the brake of a spin that is no multiple of 5 ms exactly where Compibert\'s is', () => {
    const cues = voice(6003)

    expect(cues[1]!.at).toBe(moments(6003).brakeAt)
    expect(Number.isInteger(cues[1]!.at)).toBe(false)
  })

  it('gives the same plan for the same read twice, so a refetch schedules nothing twice', () => {
    const key = (cues: Cue[]) => cues.map(cue => `${cue.id}@${cue.at}`)
    expect(key(voice(6000))).toEqual(key(voice(6000)))
  })

  it('is ascending by time', () => {
    const at = voice(6000).map(cue => cue.at)
    expect(at).toEqual([...at].sort((a, b) => a - b))
  })
})
