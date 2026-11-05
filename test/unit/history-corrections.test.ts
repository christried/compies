import { describe, expect, it } from 'vitest'
import { historyCorrections } from '../../app/utils/history-corrections'

// The history's „Korrigieren“ (#275, #283): offered to the Host only, while the Event has not finished, and only when the Event has its settings and its end.
describe('historyCorrections', () => {
  type Read = Parameters<typeof historyCorrections>[0]
  const save = async () => true
  const table = { values: [3, 1, 0] }
  const read = (event: Partial<Read['event']> = {}, rest: Partial<Read> = {}): Read => ({
    event: { phase: 'running', isHost: true, ...event },
    settings: { pointsTable: table } as Read['settings'],
    end: { played: 1, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null },
    ...rest,
  })

  it('gives the Host the points table, the Game count and the save while the Event runs', () => {
    expect(historyCorrections(read(), save)).toEqual({ pointsTable: table, total: 6, save })
  })

  it('gives a Member none', () => {
    expect(historyCorrections(read({ isHost: false }), save)).toBeNull()
  })

  it('gives the Host none once the Event has finished', () => {
    expect(historyCorrections(read({ phase: 'finished' }), save)).toBeNull()
  })

  it('gives none without settings or without the end', () => {
    expect(historyCorrections(read({}, { settings: null }), save)).toBeNull()
    expect(historyCorrections(read({}, { end: null }), save)).toBeNull()
  })
})
