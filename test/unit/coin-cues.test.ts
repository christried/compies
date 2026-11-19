import { describe, expect, it } from 'vitest'
import { COIN_DURATION_MS, COIN_LAND_AT, COIN_SPIN_AT } from '~~/shared/coin'
import type { CoinView } from '~~/shared/stage'
import { flightKeyframes } from '../../app/utils/coin-flight'
import { CUE_GROUPS, coinCuePlan, cueFilesOf, type CoinCueInput, type CueId } from '../../app/utils/sound-cues'

// The Coin flip's cues (#669, spec #718 § The cue plan): four cues from the toss's two instants, the beats of the picture, no side (ADR 0013
// amendment: the Event read carries `coin.side` before the landing, the UI hides it). Expected instants come from the constants the picture
// uses, never from copied numbers.

const START = Date.parse('2090-10-30T20:00:00.000Z')
const LANDS = START + COIN_DURATION_MS
const iso = (ms: number) => new Date(ms).toISOString()
const TOSS = { startedAt: iso(START), landsAt: iso(LANDS) }
const COIN_IDS: CueId[] = ['coin-toss', 'coin-spin', 'coin-land', 'coin-result']

const plan = (over: Partial<CoinCueInput> = {}) => coinCuePlan({ toss: TOSS, reducedMotion: false, ...over })
const pairs = (cues: { id: string, at: number }[]) => cues.map(cue => [cue.id, cue.at])

describe('coinCuePlan keeps the side secret', () => {
  // The Event read's coin carries the side; `planOf` copies the two instants only. The same toss with either side is one plan.
  const read = (side: CoinView['side']): CoinView => ({ id: 'toss-1', side, startedAt: iso(START), landsAt: iso(LANDS) })
  const tossOf = (coin: CoinView) => ({ startedAt: coin.startedAt, landsAt: coin.landsAt })

  it.each([false, true])('gives the same plan for heads and for tails (reduced motion %s)', (reducedMotion) => {
    const heads = coinCuePlan({ toss: tossOf(read('heads')), reducedMotion })
    const tails = coinCuePlan({ toss: tossOf(read('tails')), reducedMotion })

    expect(heads).toEqual(tails)
    expect(heads.length).toBeGreaterThan(0)
  })

  it('takes a toss of two instants: the type holds no side', () => {
    // An excess property of a literal is a type error, so a side cannot be passed by mistake (`pnpm typecheck` checks this line).
    // @ts-expect-error the toss has no `side`
    expect(coinCuePlan({ toss: { startedAt: iso(START), landsAt: iso(LANDS), side: 'heads' }, reducedMotion: false })).toEqual(plan())
  })
})

describe('coinCuePlan', () => {
  it('has the four cues at the toss, the turn, the landing and the result, in that order, each once', () => {
    expect(pairs(plan())).toEqual([
      ['coin-toss', START],
      ['coin-spin', START + COIN_DURATION_MS * COIN_SPIN_AT],
      ['coin-land', START + COIN_DURATION_MS * COIN_LAND_AT],
      ['coin-result', LANDS],
    ])
    expect(plan().map(cue => cue.id)).toEqual(COIN_IDS)
    for (const id of COIN_IDS) expect(CUE_GROUPS[id], id).toEqual(['coin'])
  })

  it('has the beats of the picture: the keyframes of the flight sit at the same two offsets', () => {
    const frames = flightKeyframes(false, { io: 'ease-in-out', out: 'ease-out' })
    const onGround = frames.position.find(frame => frame.offset === COIN_LAND_AT)
    const turned = frames.spin.find(frame => frame.transform.startsWith('rotateX(540deg)'))

    expect(onGround, 'a keyframe of the position at the landing').toBeDefined()
    expect(turned?.offset).toBe(COIN_SPIN_AT)
    // 04-motion § Coin flip is the source of the two numbers.
    expect([COIN_SPIN_AT, COIN_LAND_AT]).toEqual([0.18, 0.74])
  })

  it('leaves out the throw and the turn under reduced motion and keeps the other two at the same instants', () => {
    const reduced = plan({ reducedMotion: true })
    expect(reduced.map(cue => cue.id)).toEqual(['coin-land', 'coin-result'])
    expect(reduced).toEqual(plan().filter(cue => cue.id === 'coin-land' || cue.id === 'coin-result'))
  })

  it('is empty without a toss', () => {
    expect(plan({ toss: null })).toEqual([])
    expect(plan({ toss: null, reducedMotion: true })).toEqual([])
  })

  it('has no clock: a toss in the past gives the same plan shape, the player skips what is late', () => {
    const past = Date.parse('2001-01-01T00:00:00.000Z')
    const cues = coinCuePlan({ toss: { startedAt: iso(past), landsAt: iso(past + COIN_DURATION_MS) }, reducedMotion: false })
    expect(cues.map(cue => cue.id)).toEqual(COIN_IDS)
    expect(cues.map(cue => cue.at - past)).toEqual(plan().map(cue => cue.at - START))
  })
})

// The group's rule is a row of the table in sound-cues.test.ts.
describe('the Coin flip group', () => {
  it('has the four files in the order of the ids', () => {
    expect(cueFilesOf(['coin'])).toEqual(COIN_IDS)
  })
})
