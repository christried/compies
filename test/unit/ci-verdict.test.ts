import { describe, expect, it } from 'vitest'
import { verdict } from '../../scripts/ci-verdict.mjs'

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
