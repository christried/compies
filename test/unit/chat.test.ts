import { describe, expect, it } from 'vitest'
import { groupMessages, mergeMessages } from '~/utils/chat'
import type { DeletedMessage, LiveMessage, Message } from '~~/shared/chat'

// The Chat's pure rules (#761, spec #719 § A): the Messages of one writer within two minutes of each other sit under one name line, and a page read again merges into
// what is held by id. The start is a fixed instant; `at` is an ISO string of milliseconds, as the server writes it.
const START = Date.parse('2026-11-19T20:00:00.000Z')

function live(id: string, writerId: string, secondsAfterStart: number, text = id): LiveMessage {
  return { id, writerId, text, at: new Date(START + secondsAfterStart * 1000).toISOString() }
}

function gone(id: string, writerId: string, secondsAfterStart: number, deletedBy: DeletedMessage['deletedBy'] = 'host'): DeletedMessage {
  return { id, writerId, text: null, at: new Date(START + secondsAfterStart * 1000).toISOString(), deletedBy }
}

const ids = (messages: readonly Message[]) => messages.map(message => message.id)

describe('groupMessages', () => {
  it('has no group for no Message and one group of one for one', () => {
    expect(groupMessages([])).toEqual([])
    expect(groupMessages([live('a', 'u1', 0)])).toEqual([{ writerId: 'u1', messages: [live('a', 'u1', 0)] }])
  })

  it('puts two Messages of one writer 119 s and 120 s apart in one group, and 121 s apart in two', () => {
    expect(groupMessages([live('a', 'u1', 0), live('b', 'u1', 119)])).toHaveLength(1)
    expect(groupMessages([live('a', 'u1', 0), live('b', 'u1', 120)])).toHaveLength(1)
    expect(groupMessages([live('a', 'u1', 0), live('b', 'u1', 121)])).toHaveLength(2)
  })

  it('measures from the previous Message, not from the first of the group', () => {
    const groups = groupMessages([live('a', 'u1', 0), live('b', 'u1', 100), live('c', 'u1', 200), live('d', 'u1', 321)])
    expect(groups.map(group => ids(group.messages))).toEqual([['a', 'b', 'c'], ['d']])
  })

  it('starts a new group when another writer wrote between, so A, B, A are three groups', () => {
    const groups = groupMessages([live('a', 'u1', 0), live('b', 'u2', 10), live('c', 'u1', 20)])
    expect(groups.map(group => group.writerId)).toEqual(['u1', 'u2', 'u1'])
  })

  it('starts a new group for the same writer after a gap', () => {
    const groups = groupMessages([live('a', 'u1', 0), live('b', 'u1', 30), live('c', 'u1', 400)])
    expect(groups.map(group => ids(group.messages))).toEqual([['a', 'b'], ['c']])
  })

  it('keeps a deleted Message in its group, where it was written', () => {
    const groups = groupMessages([live('a', 'u1', 0), gone('b', 'u1', 60), live('c', 'u1', 90)])
    expect(groups).toHaveLength(1)
    expect(ids(groups[0]!.messages)).toEqual(['a', 'b', 'c'])
  })
})

describe('mergeMessages', () => {
  it('adds a Message the list does not hold and sorts by time', () => {
    const merged = mergeMessages([live('b', 'u1', 20)], [live('c', 'u1', 30), live('a', 'u1', 10)])
    expect(ids(merged)).toEqual(['a', 'b', 'c'])
  })

  it('sorts two Messages of one millisecond by id', () => {
    const merged = mergeMessages([], [live('b', 'u1', 5), live('a', 'u2', 5)])
    expect(ids(merged)).toEqual(['a', 'b'])
  })

  it('replaces a held live Message with the deleted one an incoming page carries', () => {
    const merged = mergeMessages([live('a', 'u1', 0, 'hello')], [gone('a', 'u1', 0, 'writer')])
    expect(merged).toEqual([gone('a', 'u1', 0, 'writer')])
  })

  it('keeps a held deleted Message when a stale page brings the live one', () => {
    const merged = mergeMessages([gone('a', 'u1', 0)], [live('a', 'u1', 0, 'hello')])
    expect(merged).toEqual([gone('a', 'u1', 0)])
  })

  it('keeps the held Message when the same id arrives live again', () => {
    const held = live('a', 'u1', 0, 'first')
    const merged = mergeMessages([held], [live('a', 'u1', 0, 'other')])
    expect(merged).toEqual([held])
  })

  it('does not change by merging the same page twice, and does not touch its arguments', () => {
    const page = [live('a', 'u1', 0), gone('b', 'u2', 10), live('c', 'u1', 20)]
    const once = mergeMessages([], page)
    const twice = mergeMessages(once, page)
    expect(twice).toEqual(once)
    expect(ids(once)).toEqual(['a', 'b', 'c'])
    expect(page).toHaveLength(3)
  })
})
