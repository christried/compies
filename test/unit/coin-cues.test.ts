import { describe, expect, it } from 'vitest'
import { COIN_DURATION_MS, COIN_LAND_AT, COIN_SPIN_AT } from '~~/shared/coin'
import type { CoinView } from '~~/shared/stage'
import { flightKeyframes } from '../../app/utils/coin-flight'
import {
  CUE_GROUPS, CUE_VOLUME, coinCuePlan, cueFilesOf, reachableGroups,
  type CoinCueInput, type CueId, type GroupInput,
} from '../../app/utils/sound-cues'

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

  it('has a toss of two instants and nothing else: the type holds no side', () => {
    const input: CoinCueInput = { toss: TOSS, reducedMotion: false }
    expect(Object.keys(input).sort()).toEqual(['reducedMotion', 'toss'])
    expect(Object.keys(TOSS).sort()).toEqual(['landsAt', 'startedAt'])
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
    const onGround = frames.position.find(frame => frame.transform === 'translate3d(0px,83px,0)')
    const turned = frames.spin.find(frame => frame.transform.startsWith('rotateX(540deg)'))

    expect(onGround?.offset).toBe(COIN_LAND_AT)
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

  it('has the Vol of the document for each cue', () => {
    expect(COIN_IDS.map(id => CUE_VOLUME[id])).toEqual([50, 30, 60, 55])
  })
})

describe('the Coin flip group', () => {
  // Literals that name the fields the case is about; `sessionRunning` and `toss` are optional (absent = not reached).
  const groupsOf = (input: GroupInput) => reachableGroups(input)

  it('reaches nothing with no wheel, no running Session and no toss, whatever the Veto fields say', () => {
    expect(groupsOf({ wheel: false, vetoAllowance: 0, vetoWindow: false })).toEqual([])
    expect(groupsOf({ wheel: false, vetoAllowance: 2, vetoWindow: true })).toEqual([])
  })

  it('is reached by a running Session alone', () => {
    expect(groupsOf({ wheel: false, vetoAllowance: 0, vetoWindow: false, sessionRunning: true })).toEqual(['coin'])
  })

  it('is reached by a toss in the read alone', () => {
    expect(groupsOf({ wheel: false, vetoAllowance: 0, vetoWindow: false, toss: true })).toEqual(['coin'])
  })

  it('follows the wheel and the Veto window in the order of the groups', () => {
    expect(groupsOf({ wheel: true, vetoAllowance: 0, vetoWindow: false, sessionRunning: true })).toEqual(['wheel', 'coin'])
    expect(groupsOf({ wheel: true, vetoAllowance: 2, vetoWindow: false, sessionRunning: true })).toEqual(['wheel', 'veto', 'coin'])
    expect(groupsOf({ wheel: true, vetoAllowance: 0, vetoWindow: false })).toEqual(['wheel'])
  })

  it('has the four files in the order of the ids', () => {
    expect(cueFilesOf(['coin'])).toEqual(COIN_IDS)
  })
})
