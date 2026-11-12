import { describe, expect, it } from 'vitest'
import { prDecision } from '../../scripts/pr-verdict.mjs'

// scripts/ci-wait.mjs --pr <n> waits for a PR's merge and decides from the PR and the check of its head (#565).
const open = { state: 'open', merged: false, mergeCommit: null, draft: false, autoMerge: true, mergeableState: 'blocked' }
const mergedPr = { ...open, state: 'closed', merged: true, mergeCommit: 'b364d78c2e809ecf29f3428f650c01b04321f786' }

describe('scripts/pr-verdict.mjs prDecision', () => {
  it('reports a merged PR with its merge commit', () => {
    expect(prDecision(mergedPr, 'none')).toEqual({ kind: 'merged', commit: 'b364d78c2e809ecf29f3428f650c01b04321f786' })
  })

  it('reports a merged PR even when the last check of its head was red', () => {
    expect(prDecision(mergedPr, 'red')).toEqual({ kind: 'merged', commit: 'b364d78c2e809ecf29f3428f650c01b04321f786' })
  })

  it('reports a merged PR without a reported merge commit', () => {
    expect(prDecision({ ...mergedPr, mergeCommit: null }, 'none')).toEqual({ kind: 'merged', commit: null })
  })

  it('reports a closed PR that was not merged', () => {
    expect(prDecision({ ...open, state: 'closed' }, 'green')).toEqual({ kind: 'closed' })
  })

  it('reports a closed PR even while a check is still running', () => {
    expect(prDecision({ ...open, state: 'closed' }, 'running')).toEqual({ kind: 'closed' })
  })

  it('reports a failed check as red', () => {
    expect(prDecision(open, 'red')).toEqual({ kind: 'red' })
  })

  it('reports a red check before a draft that is behind its base', () => {
    expect(prDecision({ ...open, draft: true, mergeableState: 'behind' }, 'red')).toEqual({ kind: 'red' })
  })

  it('reports a start failure that happened twice', () => {
    expect(prDecision(open, 'twice')).toEqual({ kind: 'twice' })
  })

  it('asks for a re-run after a first start failure', () => {
    expect(prDecision(open, 'rerun')).toEqual({ kind: 'rerun' })
  })

  it('asks for the re-run before it reports the PR as behind its base', () => {
    expect(prDecision({ ...open, mergeableState: 'behind' }, 'rerun')).toEqual({ kind: 'rerun' })
  })

  it('waits for the check while no run exists yet', () => {
    expect(prDecision(open, 'none')).toEqual({ kind: 'waiting', why: 'check' })
  })

  it('waits for the check while a run is still going', () => {
    expect(prDecision(open, 'running')).toEqual({ kind: 'waiting', why: 'check' })
  })

  it('waits for the merge when the check is green and auto-merge is set', () => {
    expect(prDecision({ ...open, mergeableState: 'clean' }, 'green')).toEqual({ kind: 'waiting', why: 'merge' })
  })

  it('waits for someone to merge when the check is green and auto-merge is not set', () => {
    expect(prDecision({ ...open, autoMerge: false, mergeableState: 'clean' }, 'green')).toEqual({ kind: 'waiting', why: 'auto-merge' })
  })

  it('blocks a green draft', () => {
    expect(prDecision({ ...open, draft: true }, 'green')).toEqual({ kind: 'blocked', why: 'draft' })
  })

  it('blocks a draft whose check is still running', () => {
    expect(prDecision({ ...open, draft: true }, 'running')).toEqual({ kind: 'blocked', why: 'draft' })
  })

  it('blocks a PR behind its base while the check is running', () => {
    expect(prDecision({ ...open, mergeableState: 'behind' }, 'running')).toEqual({ kind: 'blocked', why: 'behind' })
  })

  it('blocks a green PR behind its base', () => {
    expect(prDecision({ ...open, mergeableState: 'behind' }, 'green')).toEqual({ kind: 'blocked', why: 'behind' })
  })

  it('blocks a PR that conflicts with its base', () => {
    expect(prDecision({ ...open, mergeableState: 'dirty' }, 'green')).toEqual({ kind: 'blocked', why: 'conflict' })
  })

  it('names the draft before the base it is behind', () => {
    expect(prDecision({ ...open, draft: true, mergeableState: 'behind' }, 'green')).toEqual({ kind: 'blocked', why: 'draft' })
  })

  it.each(['unknown', 'blocked', 'unstable', 'has_hooks', 'clean'])('never blocks on the merge state %s', (mergeableState) => {
    expect(prDecision({ ...open, mergeableState }, 'green')).toEqual({ kind: 'waiting', why: 'merge' })
  })
})
