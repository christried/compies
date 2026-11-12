import { describe, expect, it, vi } from 'vitest'
import { createCuePlayer } from '../../app/utils/cue-player'
import type { Cue, CueId } from '../../app/utils/sound-cues'
import { bytesOf, FakeAudioContext, type FakeSource } from '../fake-audio'

// The cue player (#531, spec #504 § The cue player): it hands every cue of a plan to the audio clock ahead of time, at the cue's server time
// minus the server's now, and keeps what it holds in step with the plan it is given. Tested against a fake audio context whose clock the
// test moves (test/fake-audio.ts); the server's now is a number the test holds.

const NOW = 1_000_000
/** The fake's `currentTime` at the start of every test (seconds). */
const CLOCK = 10

function setup(options: { enabled?: boolean, loadFile?: (id: CueId) => Promise<ArrayBuffer> } = {}) {
  const context = new FakeAudioContext()
  let now = NOW
  const loadFile = vi.fn(options.loadFile ?? ((id: CueId) => Promise.resolve(bytesOf(id))))
  const onChange = vi.fn()
  const player = createCuePlayer({ context: context.asContext, serverNow: () => now, loadFile, onChange, enabled: options.enabled })
  /** Time passes on both clocks. */
  const advance = (ms: number) => {
    now += ms
    context.advance(ms)
  }
  return { context, player, loadFile, onChange, advance }
}

/** Lets the loads and decodes the player started finish. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))

/** When a source was told to start, to the millisecond (the sums of seconds in the fake are floats). */
const when = (source: FakeSource) => Math.round(source.startedAt! * 1000) / 1000
const cue = (id: CueId, offset: number): Cue => ({ id, at: NOW + offset })
const outcomes = (player: ReturnType<typeof setup>['player']) => player.log.map(entry => `${entry.id}@${entry.at - NOW}:${entry.outcome}`)

describe('the offset of a cue', () => {
  it('starts a cue two seconds ahead at its own offset on the audio clock, at the volume of its cue', async () => {
    const { context, player } = setup()

    player.setPlan([cue('wheel-stop', 2000)])
    await settle()

    const [source, ...rest] = context.started()
    expect(rest).toEqual([])
    expect(source!.id).toBe('wheel-stop')
    expect(source!.startedAt).toBeCloseTo(12, 3)
    expect(source!.gain).toBe(0.7)
  })

  it('starts a tick half a second ahead at 10.5 with its gain of 0.30', async () => {
    const { context, player } = setup()

    player.setPlan([cue('wheel-tick', 500)])
    await settle()

    const [source] = context.started()
    expect(source!.startedAt).toBeCloseTo(10.5, 3)
    expect(source!.gain).toBe(0.3)
  })

  it('starts the three cues of one plan at their own offsets', async () => {
    const { context, player } = setup()

    player.setPlan([cue('wheel-windup', 250), cue('wheel-tick', 1000), cue('wheel-slice-out', 4500)])
    await settle()

    expect(context.started().map(source => [source.id, when(source)])).toEqual([
      ['wheel-windup', 10.25], ['wheel-tick', 11], ['wheel-slice-out', 14.5],
    ])
  })

  it('runs every cue through one bus into the destination, with no other gain', async () => {
    const { context, player } = setup()

    player.setPlan([cue('wheel-tick', 500), cue('wheel-stop', 900)])
    await settle()

    const [bus, ...cueGains] = context.gains
    expect(bus!.gain.value).toBe(1)
    expect(bus!.connected).toBe(context.destination)
    expect(cueGains.map(gain => gain.connected)).toEqual([bus, bus])
  })
})

describe('a cue that is late', () => {
  it.each([
    ['100 ms late', -100, 'late'],
    ['exactly 150 ms late', -150, 'late'],
  ])('starts a cue %s at once', async (_name, offset, outcome) => {
    const { context, player } = setup()

    player.setPlan([cue('wheel-stop', offset)])
    await settle()

    expect(context.started().map(source => when(source))).toEqual([CLOCK])
    expect(outcomes(player)).toEqual([`wheel-stop@${offset}:${outcome}`])
  })

  it('skips a cue 151 ms late: no source, and the log says skipped', async () => {
    const { context, player } = setup()

    player.setPlan([cue('wheel-stop', -151)])
    await settle()

    expect(context.started()).toEqual([])
    expect(outcomes(player)).toEqual(['wheel-stop@-151:skipped'])
  })

  it('logs where the cue stood on both clocks', async () => {
    const { player } = setup()

    player.setPlan([cue('wheel-tick', 500)])
    await settle()

    expect(player.log[0]).toMatchObject({ id: 'wheel-tick', at: NOW + 500, when: 10.5, currentTime: CLOCK, outcome: 'scheduled' })
    expect(typeof player.log[0]!.perf).toBe('number')
  })
})

describe('Ton', () => {
  it('schedules nothing and requests no file while off', async () => {
    const { context, player, loadFile } = setup({ enabled: false })

    player.setPlan([cue('wheel-tick', 500), cue('wheel-stop', 900)])
    await settle()

    expect(context.started()).toEqual([])
    expect(context.gains).toHaveLength(1) // the bus only, made at construction
    expect(loadFile).not.toHaveBeenCalled()
  })

  it('stops all three scheduled cues when it is switched off, and leaves none', async () => {
    const { context, player } = setup()
    player.setPlan([cue('wheel-tick', 500), cue('wheel-tick', 800), cue('wheel-stop', 1200)])
    await settle()
    expect(context.started()).toHaveLength(3)

    player.setEnabled(false)

    expect(context.started().map(source => source.stopCalls)).toEqual([1, 1, 1])
    expect(outcomes(player)).toEqual(['wheel-tick@500:cancelled', 'wheel-tick@800:cancelled', 'wheel-stop@1200:cancelled'])
  })

  it('reschedules the still-future cues when it is switched on again, and skips the past ones', async () => {
    const { context, player, advance } = setup()
    player.setPlan([cue('wheel-tick', 500), cue('wheel-tick', 800), cue('wheel-stop', 1200)])
    await settle()
    player.setEnabled(false)

    advance(1000)
    player.setEnabled(true)
    await settle()

    // The tick at +500 is 500 ms past: skipped. The tick at +800 is 200 ms past: skipped. The stop is 200 ms ahead.
    const fresh = context.started().slice(3)
    expect(fresh.map(source => [source.id, when(source)])).toEqual([['wheel-stop', 11.2]])
    expect(player.log.slice(3).map(entry => entry.outcome)).toEqual(['skipped', 'skipped', 'scheduled'])
  })
})

describe('the same plan again', () => {
  it('starts each cue once however often the plan is set', async () => {
    const { context, player } = setup()
    const plan = [cue('wheel-tick', 500), cue('wheel-stop', 900)]

    player.setPlan(plan)
    player.setPlan([...plan])
    await settle()
    player.setPlan(plan.map(entry => ({ ...entry })))
    await settle()

    expect(context.started()).toHaveLength(2)
    expect(context.started().map(source => source.stopCalls)).toEqual([0, 0])
  })

  it('does not replay a cue that played 100 ms late when the plan is set again 50 ms later', async () => {
    const { context, player, advance } = setup()
    const plan = [cue('wheel-stop', -100), cue('wheel-slice-out', 3000)]
    player.setPlan(plan)
    await settle()

    advance(50)
    player.setPlan(plan)
    await settle()

    expect(context.started().map(source => source.id)).toEqual(['wheel-stop', 'wheel-slice-out'])
  })
})

describe('a new plan', () => {
  it('stops the old plan\'s pending cues and starts the new one\'s, and keeps a cue both plans hold', async () => {
    const { context, player } = setup()
    player.setPlan([cue('wheel-stop', 2000), cue('wheel-tick', 500), cue('wheel-slice-out', 4000)])
    await settle()

    player.setPlan([cue('wheel-stop', 3000), cue('wheel-slice-out', 4000)])
    await settle()

    const [stopA, tickA, outA, stopB] = context.started()
    expect(context.started()).toHaveLength(4)
    expect([stopA!.stopCalls, tickA!.stopCalls, outA!.stopCalls]).toEqual([1, 1, 0])
    expect([stopB!.id, stopB!.startedAt, stopB!.stopCalls]).toEqual(['wheel-stop', 13, 0])
    expect(outcomes(player)).toEqual(['wheel-stop@2000:cancelled', 'wheel-tick@500:cancelled', 'wheel-slice-out@4000:scheduled', 'wheel-stop@3000:scheduled'])
  })

  it('moves a cue whose end moved: the first is stopped, the second starts at 17', async () => {
    const { context, player } = setup()
    player.setPlan([cue('veto-reveal', 5000)])
    await settle()

    player.setPlan([cue('veto-reveal', 7000)])
    await settle()

    const [first, second, ...rest] = context.started()
    expect(rest).toEqual([])
    expect([first!.startedAt, first!.stopCalls]).toEqual([15, 1])
    expect([second!.startedAt, second!.stopCalls]).toEqual([17, 0])
  })
})

describe('a suspended context', () => {
  const plan = [cue('wheel-tick', 200), cue('wheel-stop', 900), cue('wheel-slice-out', 3000)]

  it('plays nothing and throws nothing, and says it is suspended', async () => {
    const { context, player } = setup()
    context.state = 'suspended'

    expect(() => player.setPlan(plan)).not.toThrow()
    await settle()

    expect(context.started()).toEqual([])
    expect(player.suspended).toBe(true)
  })

  it('schedules what is still due once it resumes, and skips what the wait made too late', async () => {
    const { context, player, advance, onChange } = setup()
    context.state = 'suspended'
    player.setPlan(plan)
    await settle()
    advance(1100)

    await player.resume()

    // The tick is 900 ms late, the stop 200 ms late (skipped), the slice's leaving 1900 ms ahead.
    expect(player.suspended).toBe(false)
    expect(context.resumeCalls).toBe(1)
    expect(context.started().map(source => [source.id, when(source)])).toEqual([['wheel-slice-out', 13]])
    expect(outcomes(player)).toEqual(['wheel-tick@200:skipped', 'wheel-stop@900:skipped', 'wheel-slice-out@3000:scheduled'])
    expect(onChange).toHaveBeenCalled()
  })

  it('plays a cue 100 ms late at once when the context resumes', async () => {
    const { context, player, advance } = setup()
    context.state = 'suspended'
    player.setPlan([cue('wheel-stop', 900), cue('wheel-slice-out', 3000)])
    await settle()
    advance(1000)

    await player.resume()

    expect(context.started().map(source => [source.id, when(source)])).toEqual([['wheel-stop', 11], ['wheel-slice-out', 13]])
    expect(outcomes(player)).toEqual(['wheel-stop@900:late', 'wheel-slice-out@3000:scheduled'])
  })

  it('calls the context\'s resume in the same call, before any await', () => {
    const { context, player } = setup()
    context.state = 'suspended'

    void player.resume()

    expect(context.resumeCalls).toBe(1)
  })

  it('does not throw when the resume is refused, and stays suspended', async () => {
    const { context, player } = setup()
    context.state = 'suspended'
    context.resumeRejects = true
    player.setPlan(plan)

    await expect(player.resume()).resolves.toBeUndefined()

    expect(player.suspended).toBe(true)
    expect(context.started()).toEqual([])
  })

  it('takes the not-yet-due cues back when the state leaves running, and schedules them again when it returns', async () => {
    const { context, player, advance } = setup()
    player.setPlan([cue('wheel-tick', -100), cue('wheel-stop', 900), cue('wheel-slice-out', 3000)])
    await settle()
    expect(context.started()).toHaveLength(3)

    context.setState('interrupted')
    expect(player.suspended).toBe(true)
    expect(context.started().map(source => source.stopCalls)).toEqual([0, 1, 1])

    advance(400)
    context.setState('running')
    await settle()

    const again = context.started().slice(3)
    expect(again.map(source => [source.id, when(source)])).toEqual([['wheel-stop', 10.9], ['wheel-slice-out', 13]])
    expect(outcomes(player)).toEqual([
      'wheel-tick@-100:late', 'wheel-stop@900:cancelled', 'wheel-slice-out@3000:cancelled', 'wheel-stop@900:scheduled', 'wheel-slice-out@3000:scheduled',
    ])
  })
})

describe('the files', () => {
  it('requests each file once however often the plan is set', async () => {
    const { player, loadFile } = setup()

    player.setPlan([cue('wheel-tick', 500), cue('wheel-tick', 800), cue('wheel-stop', 900)])
    player.setPlan([cue('wheel-tick', 500), cue('wheel-tick', 800), cue('wheel-stop', 900)])
    player.preload(['wheel-tick', 'wheel-windup'])
    await settle()
    player.setPlan([cue('wheel-tick', 500), cue('wheel-stop', 900), cue('wheel-tick', 1100)])
    await settle()

    expect(loadFile.mock.calls.map(([id]) => id).sort()).toEqual(['wheel-stop', 'wheel-tick', 'wheel-windup'])
  })

  it('waits for the decode: the cue starts once the buffer is there, timed from that moment', async () => {
    let deliver: (bytes: ArrayBuffer) => void = () => {}
    const { context, player, advance } = setup({ loadFile: () => new Promise((resolve) => {
      deliver = resolve
    }) })
    player.setPlan([cue('wheel-stop', 1000)])
    await settle()
    expect(context.started()).toEqual([])

    advance(400)
    deliver(bytesOf('wheel-stop'))
    await settle()

    expect(context.started().map(source => [source.id, when(source)])).toEqual([['wheel-stop', 11]])
  })

  it('applies the 150 ms rule when the decode arrives too late', async () => {
    let deliver: (bytes: ArrayBuffer) => void = () => {}
    const { context, player, advance } = setup({ loadFile: () => new Promise((resolve) => {
      deliver = resolve
    }) })
    player.setPlan([cue('wheel-stop', 1000)])

    advance(1300)
    deliver(bytesOf('wheel-stop'))
    await settle()

    expect(context.started()).toEqual([])
    expect(outcomes(player)).toEqual(['wheel-stop@1000:skipped'])
  })

  it('skips only the cues of a file that failed, throws nothing and does not try it again', async () => {
    const { context, player, loadFile } = setup({ loadFile: id => (id === 'wheel-tick' ? Promise.reject(new Error('404')) : Promise.resolve(bytesOf(id))) })

    player.setPlan([cue('wheel-tick', 500), cue('wheel-stop', 900)])
    await settle()
    player.setPlan([cue('wheel-tick', 500), cue('wheel-stop', 900), cue('wheel-tick', 1100)])
    await settle()

    expect(context.started().map(source => source.id)).toEqual(['wheel-stop'])
    expect(loadFile.mock.calls.filter(([id]) => id === 'wheel-tick')).toHaveLength(1)
    expect(outcomes(player)).toEqual(['wheel-tick@500:skipped', 'wheel-stop@900:scheduled', 'wheel-tick@1100:skipped'])
  })

  it('skips the cues of a file the browser cannot decode', async () => {
    const { context, player } = setup()
    context.decodeFails = true

    player.setPlan([cue('wheel-stop', 900)])
    await settle()

    expect(context.started()).toEqual([])
    expect(outcomes(player)).toEqual(['wheel-stop@900:skipped'])
  })
})

describe('the log', () => {
  it('holds at most 500 entries, the newest last', async () => {
    const { player } = setup()

    player.setPlan(Array.from({ length: 520 }, (_, index) => cue('wheel-tick', 1000 + index)))
    await settle()

    expect(player.log).toHaveLength(500)
    expect(player.log.at(-1)!.at).toBe(NOW + 1519)
    expect(player.log[0]!.at).toBe(NOW + 1020)
  })
})

describe('dispose', () => {
  it('stops everything, and a later plan does nothing', async () => {
    const { context, player } = setup()
    player.setPlan([cue('wheel-tick', 500), cue('wheel-stop', 900)])
    await settle()

    player.dispose()
    player.setPlan([cue('wheel-slice-out', 3000)])
    player.preload(['wheel-windup'])
    await settle()

    expect(context.started().map(source => source.stopCalls)).toEqual([1, 1])
    expect(context.started()).toHaveLength(2)
    expect(context.onstatechange).toBeNull()
    expect(context.closed).toBe(false)
  })
})

describe('a cue that left the plan', () => {
  it('is not cut off once it sounded: a cue 100 ms past that played rings out when the plan no longer holds it (#532)', async () => {
    const { context, player } = setup()
    player.setPlan([cue('veto-clip-close', -100)])
    await settle()

    player.setPlan([])

    expect(context.started().map(source => source.stopCalls)).toEqual([0])
    expect(outcomes(player)).toEqual(['veto-clip-close@-100:late'])
  })

  it('is stopped and logged cancelled while it is not yet due', async () => {
    const { context, player } = setup()
    player.setPlan([cue('veto-reveal', 2000)])
    await settle()

    player.setPlan([])

    expect(context.started().map(source => source.stopCalls)).toEqual([1])
    expect(outcomes(player)).toEqual(['veto-reveal@2000:cancelled'])
  })

  it('is still stopped by Ton going off, after it started', async () => {
    const { context, player } = setup()
    player.setPlan([cue('veto-clip-close', -100)])
    await settle()

    player.setEnabled(false)

    expect(context.started().map(source => source.stopCalls)).toEqual([1])
  })
})

describe('playNow', () => {
  it('starts a cue at the audio clock\'s now with the gain of its cue, and logs it scheduled', async () => {
    const { context, player } = setup()
    player.preload(['veto-seal'])
    await settle()

    player.playNow('veto-seal')

    const [source, ...rest] = context.started()
    expect(rest).toEqual([])
    expect(source!.id).toBe('veto-seal')
    expect(source!.startedAt).toBe(CLOCK)
    expect(source!.gain).toBe(0.55)
    expect(outcomes(player)).toEqual(['veto-seal@0:scheduled'])
    expect(player.log[0]).toMatchObject({ when: CLOCK, currentTime: CLOCK })
  })

  it('starts after its delay: 80 ms is 10.08', async () => {
    const { context, player } = setup()
    player.preload(['veto-seal'])
    await settle()

    player.playNow('veto-seal', 80)

    expect(when(context.started()[0]!)).toBe(10.08)
    expect(outcomes(player)).toEqual(['veto-seal@80:scheduled'])
  })

  it('plays nothing and logs nothing while Ton is off', async () => {
    const { context, player } = setup({ enabled: false })
    player.preload(['veto-seal'])
    await settle()

    player.playNow('veto-seal')
    player.setEnabled(false)
    player.playNow('veto-seal')

    expect(context.started()).toEqual([])
    expect(player.log).toEqual([])
  })

  it('is skipped on a context that does not run', async () => {
    const { context, player } = setup()
    player.preload(['veto-seal'])
    await settle()
    context.state = 'suspended'

    player.playNow('veto-seal')

    expect(context.started()).toEqual([])
    expect(outcomes(player)).toEqual(['veto-seal@0:skipped'])
  })

  it('is skipped when its file is not decoded yet, and asks for the file', async () => {
    const { context, player, loadFile } = setup()

    player.playNow('veto-seal')
    await settle()

    expect(context.started()).toEqual([])
    expect(outcomes(player)).toEqual(['veto-seal@0:skipped'])
    expect(loadFile.mock.calls.map(([id]) => id)).toEqual(['veto-seal'])
  })

  it('is skipped when its file failed to decode', async () => {
    const { context, player } = setup()
    context.decodeFails = true
    player.preload(['veto-seal'])
    await settle()

    player.playNow('veto-seal')

    expect(context.started()).toEqual([])
    expect(outcomes(player)).toEqual(['veto-seal@0:skipped'])
  })

  it('is not cancelled by the plan: the next plan stops its pending cue, not the seal', async () => {
    const { context, player } = setup()
    player.preload(['veto-seal'])
    await settle()
    player.setPlan([cue('veto-open', 1000)])
    await settle()

    player.playNow('veto-seal')
    player.setPlan([])

    const seal = context.started().find(source => source.id === 'veto-seal')!
    const open = context.started().find(source => source.id === 'veto-open')!
    expect([seal.stopCalls, open.stopCalls]).toEqual([0, 1])
  })

  it('starts nothing after dispose', async () => {
    const { context, player } = setup()
    player.preload(['veto-seal'])
    await settle()

    player.dispose()
    player.playNow('veto-seal')

    expect(context.started()).toEqual([])
  })
})
