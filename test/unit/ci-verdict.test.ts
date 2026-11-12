import { describe, expect, it } from 'vitest'
import { rerunDecision, verdict } from '../../scripts/ci-verdict.mjs'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

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

  it('calls a cancelled run with zero jobs red: someone cancelled it, so a re-run would undo that', () => {
    expect(verdict({ conclusion: 'cancelled' }, 0)).toBe('red')
  })

  it('calls a failed run with jobs red', () => {
    expect(verdict({ conclusion: 'failure' }, 3)).toBe('red')
  })

  // A newer push to the same branch cancels the older run (concurrency in ci.yml, #569): that is superseded, not red.
  it('calls a cancelled run superseded when its branch has a newer head, with zero jobs', () => {
    expect(verdict({ conclusion: 'cancelled', headSha: A }, 0, B)).toBe('superseded')
  })

  it('calls a cancelled run superseded when its branch has a newer head, with jobs', () => {
    expect(verdict({ conclusion: 'cancelled', headSha: A }, 3, B)).toBe('superseded')
  })

  it('calls a cancelled run red when its branch is gone or unknown: nobody pushed over it', () => {
    expect(verdict({ conclusion: 'cancelled', headSha: A }, 0, null)).toBe('red')
  })

  it('calls a cancelled run red when its own commit is still the head of the branch: it was cancelled by hand', () => {
    expect(verdict({ conclusion: 'cancelled', headSha: A }, 0, A)).toBe('red')
  })

  it('calls a cancelled run red when the newer head is an empty string', () => {
    expect(verdict({ conclusion: 'cancelled', headSha: A }, 0, '')).toBe('red')
  })

  it('calls a failed run with jobs red even when its branch has a newer head: only a cancelled run is superseded', () => {
    expect(verdict({ conclusion: 'failure', headSha: A }, 3, B)).toBe('red')
  })

  it('calls a failed run with zero jobs a start failure even when its branch has a newer head', () => {
    expect(verdict({ conclusion: 'failure', headSha: A }, 0, B)).toBe('start-failure')
  })

  it('calls a successful run green even when its branch has a newer head', () => {
    expect(verdict({ conclusion: 'success', headSha: A }, 3, B)).toBe('green')
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

  it('reports a cancelled run with a newer branch head as superseded', () => {
    expect(rerunDecision({ conclusion: 'cancelled', headSha: A, attempt: 1 }, 0, false, B)).toBe('superseded')
  })

  it('reports a superseded run as superseded whether or not a re-run happened', () => {
    expect(rerunDecision({ conclusion: 'cancelled', headSha: A, attempt: 2 }, 0, true, B)).toBe('superseded')
  })

  it('reports a cancelled run without a newer branch head as red', () => {
    expect(rerunDecision({ conclusion: 'cancelled', headSha: A, attempt: 1 }, 0, false, null)).toBe('red')
  })

  it('still re-runs a start failure when its branch has a newer head', () => {
    expect(rerunDecision({ conclusion: 'failure', headSha: A, attempt: 1 }, 0, false, B)).toBe('rerun')
  })
})
