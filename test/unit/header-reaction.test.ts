import { describe, expect, it } from 'vitest'
import { EMOTE_IDS } from '~~/shared/emote'
import { baseFor, connectionReaction, EMOTE_STATE, emoteReaction, vetoReaction } from '../../app/utils/header-reaction'
import type { BannerState } from '../../app/utils/connection-banner'
import { admitReaction, reactionSeconds, RIG_REACTIONS } from '../../app/utils/rig-reaction'
import { ARRIVAL_LATE_MS, type VetoArrivalState } from '../../app/utils/sound-cues'

// What the header's Compibert does on the Event page (#673, spec #927): a pure plan of the own Emote, the reveal's arrival and the connection.
// The rig owns the timer (rig-reaction.ts); the composable (useHeaderReaction) owns the wiring.

const NOW = Date.UTC(2090, 10, 7, 20, 0, 0)

describe('emoteReaction', () => {
  const reaction = (emote: (typeof EMOTE_IDS)[number], own: boolean, serverTime = NOW, now = NOW) => emoteReaction({ emote, own, serverTime, now })

  it.each([
    ['clap', 'clap', 2], ['tears', 'laugh', 2.4], ['angry', 'angry', 2.6], ['roar', 'roar', 2.4],
  ] as const)('gives the own %s the state %s for %s s', (emote, state, seconds) => {
    const result = reaction(emote, true)

    expect(result).toEqual({ state })
    expect(reactionSeconds(result!)).toBe(seconds)
  })

  it('gives another Member\'s Emote nothing, whichever it is', () => {
    for (const emote of EMOTE_IDS) expect(reaction(emote, false)).toBeNull()
  })

  it('reacts to an own Emote exactly 2000 ms old, not one 2001 ms old', () => {
    expect(ARRIVAL_LATE_MS).toBe(2000)
    expect(reaction('clap', true, NOW - 2000)).not.toBeNull()
    expect(reaction('clap', true, NOW - 2001)).toBeNull()
  })

  it('has a state for every Emote', () => {
    expect(Object.keys(EMOTE_STATE).sort()).toEqual([...EMOTE_IDS].sort())
  })

  it('returns a new object each time, so the rig sees a new reaction', () => {
    expect(reaction('clap', true)).not.toBe(reaction('clap', true))
  })
})

describe('vetoReaction', () => {
  const draw = (over: Partial<NonNullable<VetoArrivalState['draw']>> = {}) => ({
    drawId: 'd1', kind: 'spin' as const, stopAt: new Date(NOW - 40_000).toISOString(), vetoEndsAt: new Date(NOW).toISOString(), ...over,
  })
  const state = (over: Partial<VetoArrivalState> = {}): VetoArrivalState => ({ draw: draw(), ownCast: false, revealedCount: null, ...over })

  it.each([1, 2])('gives a reveal of %s Veto(es) one angry, 2.6 s', (count) => {
    const result = vetoReaction(state(), state({ revealedCount: count }), NOW + 300)

    expect(result).toEqual({ state: 'angry' })
    expect(reactionSeconds(result!)).toBe(2.6)
  })

  it('gives a reveal of no Veto nothing', () => {
    expect(vetoReaction(state(), state({ revealedCount: 0 }), NOW + 300)).toBeNull()
  })

  it('gives a first read nothing, however much it shows', () => {
    expect(vetoReaction(null, state({ revealedCount: 2 }), NOW + 300)).toBeNull()
  })

  it('gives a read that already carried the reveal, read again, nothing', () => {
    expect(vetoReaction(state({ revealedCount: 2 }), state({ revealedCount: 2 }), NOW + 300)).toBeNull()
  })

  it('reacts to a reveal 2000 ms after the end, not 2001', () => {
    expect(vetoReaction(state(), state({ revealedCount: 1 }), NOW + 2000)).not.toBeNull()
    expect(vetoReaction(state(), state({ revealedCount: 1 }), NOW + 2001)).toBeNull()
  })

  it('gives another draw\'s reveal and an unknown end nothing', () => {
    expect(vetoReaction(state(), state({ revealedCount: 1, draw: draw({ drawId: 'd2' }) }), NOW + 300)).toBeNull()
    expect(vetoReaction(state(), state({ revealedCount: 1, draw: draw({ vetoEndsAt: null }) }), NOW + 300)).toBeNull()
  })
})

describe('the connection', () => {
  const STATES: BannerState[] = ['ok', 'reconnecting', 'lost', 'back']

  it.each([
    ['ok', 'reconnecting'], ['reconnecting', 'lost'], ['ok', 'lost'],
  ] as const)('%s to %s: the base is confused, no reaction', (before, now) => {
    expect(baseFor(now)).toBe('confused')
    expect(connectionReaction(before, now)).toBeNull()
  })

  it.each([['lost', 'back'], ['reconnecting', 'back'], ['lost', 'ok'], ['reconnecting', 'ok']] as const)('%s to %s: the base is idle and one wave', (before, now) => {
    expect(baseFor(now)).toBe('idle')
    expect(connectionReaction(before, now)).toEqual({ state: 'wave' })
  })

  it.each([['back', 'ok'], ['ok', 'ok'], ['ok', 'back'], ['back', 'back'], ['lost', 'lost']] as const)('%s to %s: no reaction', (before, now) => {
    expect(connectionReaction(before, now)).toBeNull()
  })

  it('has a base for every banner state: confused while down, idle else', () => {
    expect(STATES.map(baseFor)).toEqual(['idle', 'confused', 'confused', 'idle'])
  })

  it('returns a new wave each time', () => {
    expect(connectionReaction('lost', 'back')).not.toBe(connectionReaction('lost', 'back'))
  })
})

describe('what the rig admits of the plans', () => {
  const emote = (id: (typeof EMOTE_IDS)[number]) => emoteReaction({ emote: id, own: true, serverTime: NOW, now: NOW })!

  it('admits a later Emote over a running one of equal priority (clap, then roar)', () => {
    expect(RIG_REACTIONS.clap!.priority).toBe(RIG_REACTIONS.roar!.priority)
    expect(admitReaction('idle', emote('clap').state, emote('roar').state)).toBe(true)
  })

  it('does not admit a wave over a running clap', () => {
    expect(admitReaction('idle', 'clap', connectionReaction('lost', 'back')!.state)).toBe(false)
  })

  it('admits no plan reaction while the base is confused (the lost connection)', () => {
    for (const id of EMOTE_IDS) expect(admitReaction(baseFor('lost'), null, emote(id).state)).toBe(false)
    expect(admitReaction(baseFor('lost'), null, 'angry')).toBe(false)
  })

  it('admits the wave after the base went back to idle, over no running reaction', () => {
    expect(admitReaction(baseFor('back'), null, connectionReaction('lost', 'back')!.state)).toBe(true)
  })
})
