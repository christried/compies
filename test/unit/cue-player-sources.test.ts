import { describe, expect, it, vi } from 'vitest'
import { createCuePlayer } from '../../app/utils/cue-player'
import type { Cue, CueId } from '../../app/utils/sound-cues'
import { bytesOf, FakeAudioContext } from '../fake-audio'

// What the cue player of #743 (spec #718 § Engine changes) added to the player of #531: a rate a cue is started at, plans by source (the read's
// and the ceremony's), a cut of what sounds for the ceremony's source, and the `playNow` sources that Ton off stops. The rest of the player is
// in test/unit/cue-player.test.ts; the fake audio context's clock is the test's (test/fake-audio.ts).

const NOW = 1_000_000

function setup(options: { enabled?: boolean } = {}) {
  const context = new FakeAudioContext()
  let now = NOW
  const player = createCuePlayer({ context: context.asContext, serverNow: () => now, loadFile: (id: CueId) => Promise.resolve(bytesOf(id)), enabled: options.enabled })
  const advance = (ms: number) => {
    now += ms
    context.advance(ms)
  }
  /** The server clock's offset changes while the audio clock stands. */
  const shift = (ms: number) => {
    now += ms
  }
  return { context, player, advance, shift }
}
type Setup = ReturnType<typeof setup>

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const cue = (id: CueId, offset: number, rate?: number): Cue => ({ id, at: NOW + offset, ...(rate === undefined ? {} : { rate }) })
const outcomes = (player: Setup['player']) => player.log.map(entry => `${entry.id}@${entry.at - NOW}x${entry.rate}:${entry.outcome}`)
const stopCalls = (context: Setup['context']) => context.started().map(source => `${source.id}:${source.stopCalls}`)

/** A player whose files are decoded, so a plan is scheduled at once. */
async function ready(ids: CueId[], options: { enabled?: boolean } = {}) {
  const made = setup(options)
  made.player.preload(ids)
  await settle()
  return made
}

describe('the rate of a cue', () => {
  it('starts a cue at the rate it carries, and at 1 when it carries none', async () => {
    const { context, player } = await ready(['cer-row'])

    player.setPlan([cue('cer-row', 1000), cue('cer-row', 1500, 2 ** (1 / 12)), cue('cer-row', 2000, 2 ** (2 / 12))], 'ceremony')

    expect(context.started().map(source => source.rate)).toEqual([1, 2 ** (1 / 12), 2 ** (2 / 12)])
  })

  it('writes the rate to the log: 1 for a cue without one', async () => {
    const { player } = await ready(['cer-row', 'wheel-stop'])

    player.setPlan([cue('cer-row', 1000, 2 ** (3 / 12)), cue('wheel-stop', 2000)])

    expect(player.log.map(entry => entry.rate)).toEqual([2 ** (3 / 12), 1])
  })

  it('keeps the rate of a cue that moves when the server clock\'s offset changes', async () => {
    const { context, player, shift } = await ready(['cer-row'])
    player.setPlan([cue('cer-row', 5000, 2 ** (4 / 12))], 'ceremony')

    // The audio clock stands while the server clock moves 500 ms: the pending cue is started again, at its own rate.
    shift(500)
    player.refresh()

    expect(context.started().map(source => [source.stopCalls, source.rate])).toEqual([[1, 2 ** (4 / 12)], [0, 2 ** (4 / 12)]])
  })

  it('takes two cues of one id and instant with different rates as two cues, both scheduled', async () => {
    const { context, player } = await ready(['cer-row'])

    player.setPlan([cue('cer-row', 1000, 1), cue('cer-row', 1000, 2 ** (1 / 12))], 'ceremony')

    expect(context.started().map(source => source.rate)).toEqual([1, 2 ** (1 / 12)])
    expect(outcomes(player)).toEqual([`cer-row@1000x1:scheduled`, `cer-row@1000x${2 ** (1 / 12)}:scheduled`])
  })

  it('schedules nothing twice when the same plan, rates and all, comes again', async () => {
    const { context, player } = await ready(['cer-row'])
    const plan = [cue('cer-row', 1000, 1), cue('cer-row', 1000, 2 ** (1 / 12))]

    player.setPlan(plan, 'ceremony')
    player.setPlan(plan.map(entry => ({ ...entry })), 'ceremony')

    expect(context.started()).toHaveLength(2)
    expect(context.started().every(source => source.stopCalls === 0)).toBe(true)
  })
})

describe('plans by source', () => {
  it('keeps the read\'s cues when the ceremony\'s plan is cleared, and the ceremony\'s when the read\'s is', async () => {
    const { context, player } = await ready(['wheel-stop', 'cer-drop'])
    player.setPlan([cue('wheel-stop', 3000)])
    player.setPlan([cue('cer-drop', 3000)], 'ceremony')

    player.setPlan([], 'ceremony')
    expect(stopCalls(context)).toEqual(['wheel-stop:0', 'cer-drop:1'])

    player.setPlan([cue('cer-drop', 4000)], 'ceremony')
    player.setPlan([])
    expect(stopCalls(context)).toEqual(['wheel-stop:1', 'cer-drop:1', 'cer-drop:0'])
  })

  it('cancels only its own pending cues when a source gets a new plan', async () => {
    const { context, player } = await ready(['wheel-stop', 'cer-drop', 'cer-run'])
    player.setPlan([cue('wheel-stop', 3000)])
    player.setPlan([cue('cer-drop', 3000)], 'ceremony')

    player.setPlan([cue('cer-run', 5000)], 'ceremony')

    expect(stopCalls(context)).toEqual(['wheel-stop:0', 'cer-drop:1', 'cer-run:0'])
    expect(outcomes(player)).toEqual(['wheel-stop@3000x1:scheduled', 'cer-drop@3000x1:cancelled', 'cer-run@5000x1:scheduled'])
  })

  it('holds the same cue of both sources as two entries', async () => {
    const { context, player } = await ready(['cer-drop'])

    player.setPlan([cue('cer-drop', 3000)])
    player.setPlan([cue('cer-drop', 3000)], 'ceremony')

    expect(context.started()).toHaveLength(2)
  })
})

describe('the cut of the ceremony\'s source', () => {
  it('stops a source that sounds when its cue leaves the plan, and cancels a pending one', async () => {
    const { context, player, advance } = await ready(['cer-drop', 'cer-run'])
    player.setPlan([cue('cer-drop', 500), cue('cer-run', 3000)], 'ceremony')
    advance(600)

    player.setPlan([], 'ceremony')

    expect(stopCalls(context)).toEqual(['cer-drop:1', 'cer-run:1'])
    // The sounding cue keeps its outcome, the pending one is cancelled.
    expect(outcomes(player)).toEqual(['cer-drop@500x1:scheduled', 'cer-run@3000x1:cancelled'])
  })

  it('lets the same cue of the read ring out: the Clip\'s close leaves its plan while it sounds', async () => {
    const { context, player, advance } = await ready(['veto-clip-close'])
    player.setPlan([cue('veto-clip-close', 500)])
    advance(600)

    player.setPlan([])

    expect(stopCalls(context)).toEqual(['veto-clip-close:0'])
  })

  it('does not schedule what it cut again when the next plan is the old one without it', async () => {
    const { context, player, advance } = await ready(['cer-drop', 'cer-run'])
    player.setPlan([cue('cer-drop', 500), cue('cer-run', 3000)], 'ceremony')
    advance(600)

    player.setPlan([cue('cer-run', 3000)], 'ceremony')

    expect(stopCalls(context)).toEqual(['cer-drop:1', 'cer-run:0'])
    expect(context.started()).toHaveLength(2)
  })
})

describe('playNow beside the plans', () => {
  it('plays at the file\'s own pitch: a rate comes with a plan\'s cue only', async () => {
    const { context, player } = await ready(['veto-seal'])

    player.playNow('veto-seal')

    expect(context.started()[0]!.rate).toBe(1)
    expect(player.log[0]!.rate).toBe(1)
  })

  it('survives the clearing of a plan', async () => {
    const { context, player } = await ready(['veto-seal', 'cer-drop'])
    player.setPlan([cue('cer-drop', 2000)], 'ceremony')

    player.playNow('veto-seal')
    player.setPlan([], 'ceremony')
    player.setPlan([])

    expect(stopCalls(context)).toEqual(['cer-drop:1', 'veto-seal:0'])
  })

  it('plays and logs nothing with Ton off', async () => {
    const { context, player } = await ready(['veto-seal'], { enabled: false })

    player.playNow('veto-seal')

    expect(context.started()).toEqual([])
    expect(player.log).toEqual([])
  })

  it('is skipped, and logged so, on a context that does not run or for a file that is not decoded', async () => {
    const { context, player } = setup()
    player.playNow('veto-seal')
    await settle()
    player.playNow('veto-seal')
    context.state = 'suspended'
    player.playNow('veto-seal')

    // The first is skipped (not decoded yet: it asks for the file), the second plays, the third (a suspended context) is skipped.
    expect(outcomes(player)).toEqual(['veto-seal@0x1:skipped', 'veto-seal@0x1:scheduled', 'veto-seal@0x1:skipped'])
    expect(context.started()).toHaveLength(1)
  })
})

describe('Ton off and dispose stop what sounds, immediate cues included', () => {
  it('stops a pending and a sounding playNow source, and the plans\' sources, when Ton is switched off', async () => {
    const { context, player, advance } = await ready(['veto-seal', 'wheel-stop', 'cer-run'])
    player.setPlan([cue('wheel-stop', 5000)])
    player.setPlan([cue('cer-run', 5000)], 'ceremony')
    player.playNow('veto-seal', 0)
    player.playNow('veto-seal', 600)
    advance(100)

    player.setEnabled(false)

    expect(stopCalls(context)).toEqual(['wheel-stop:1', 'cer-run:1', 'veto-seal:1', 'veto-seal:1'])
    // The one that already sounds keeps its outcome, the one that was still ahead is cancelled.
    expect(outcomes(player).filter(line => line.startsWith('veto-seal'))).toEqual(['veto-seal@0x1:scheduled', 'veto-seal@600x1:cancelled'])
  })

  it('does not stop a source twice, and plays nothing after Ton is switched on again until a cue is asked for', async () => {
    const { context, player } = await ready(['veto-seal'])
    player.playNow('veto-seal', 0)

    player.setEnabled(false)
    player.setEnabled(false)
    player.setEnabled(true)

    expect(stopCalls(context)).toEqual(['veto-seal:1'])
    expect(context.started()).toHaveLength(1)
  })

  it('stops them on dispose too', async () => {
    const { context, player } = await ready(['veto-seal'])
    player.playNow('veto-seal', 0)
    player.playNow('veto-seal', 800)

    player.dispose()

    expect(stopCalls(context)).toEqual(['veto-seal:1', 'veto-seal:1'])
  })

  it('forgets a source that has ended, so it is not stopped later', async () => {
    const { context, player } = await ready(['veto-seal'])
    player.playNow('veto-seal', 0)
    const ended = vi.fn()
    context.started()[0]!.stop = ended
    ;(context.started()[0]! as unknown as { onended: () => void }).onended()

    player.setEnabled(false)

    expect(ended).not.toHaveBeenCalled()
  })
})

describe('a context that does not run', () => {
  it.each<'read' | 'ceremony'>(['read', 'ceremony'])('schedules nothing and throws nothing for the %s source', async (source) => {
    const { context, player } = await ready(['cer-drop'])
    context.state = 'suspended'

    expect(() => player.setPlan([cue('cer-drop', 2000)], source)).not.toThrow()

    expect(context.started()).toEqual([])
    expect(player.log).toEqual([])
  })
})
