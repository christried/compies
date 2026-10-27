import { describe, expect, it } from 'vitest'
import { noteRows } from '../../app/utils/notes'

const members = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cem' }]

describe('noteRows', () => {
  it('lists the Notes in the Members\' order, marking the viewer\'s own', () => {
    const votes = [
      { userId: 'c', value: 'no' as const, note: 'lass 14:30 anfangen' },
      { userId: 'a', value: 'maybe' as const, note: 'bis 20:30' },
      { userId: 'b', value: 'yes' as const, note: null },
    ]

    expect(noteRows(votes, members, 'c')).toEqual([
      { userId: 'a', name: 'Anna', isMe: false, value: 'maybe', note: 'bis 20:30' },
      { userId: 'c', name: 'Cem', isMe: true, value: 'no', note: 'lass 14:30 anfangen' },
    ])
  })

  it('is empty without Notes', () => {
    expect(noteRows([{ userId: 'a', value: 'yes', note: null }], members, 'a')).toEqual([])
  })
})
