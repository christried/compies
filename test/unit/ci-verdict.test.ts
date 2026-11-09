import { describe, expect, it } from 'vitest'
import { rerunDecision, verdict } from '../../scripts/ci-verdict.mjs'

// scripts/ci-wait.mjs reports a run GitHub never gave a job as a start failure and re-runs it once (#388).
describe('scripts/ci-verdict.mjs', () => {
  it('calls a successful run green', () => {
    expect(verdict({ conclusion: 'success' }, 3)).toBe('green')
  })

  it('calls a successful run green even with zero jobs', () => {
    expect(verdict({ conclusion: 'success' }, 0)).toBe('green')
  })

  it('calls a failed run with zero jobs a start failure', () => {
    expect(verdict({ conclusion: 'failure' }, 0)).toBe('start-failure')
  })

  it('calls a cancelled run with zero jobs a start failure', () => {
    expect(verdict({ conclusion: 'cancelled' }, 0)).toBe('start-failure')
  })

  it('calls a failed run with jobs red', () => {
    expect(verdict({ conclusion: 'failure' }, 3)).toBe('red')
  })
})

describe('scripts/ci-verdict.mjs rerunDecision', () => {
  it('re-runs a first-attempt start failure', () => {
    expect(rerunDecision({ conclusion: 'failure', attempt: 1 }, 0, false)).toBe('rerun')
  })

  it('reports a start failure of a second attempt as twice, as an earlier call re-ran it', () => {
    expect(rerunDecision({ conclusion: 'failure', attempt: 2 }, 0, false)).toBe('twice')
  })

  it('reports a start failure this call re-ran as twice, while the list still shows attempt 1', () => {
    expect(rerunDecision({ conclusion: 'failure', attempt: 1 }, 0, true)).toBe('twice')
  })

  it('never re-runs a run that has jobs, whatever its attempt', () => {
    expect(rerunDecision({ conclusion: 'failure', attempt: 2 }, 3, false)).toBe('red')
    expect(rerunDecision({ conclusion: 'success', attempt: 2 }, 3, false)).toBe('green')
  })
})
