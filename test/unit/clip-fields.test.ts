import { describe, expect, it } from 'vitest'
import { editClipField, openClipFields, type ClipFields } from '../../app/utils/clip-fields'

// The three clip fields of the game form (#508): the two the Host edited last hold, the third follows.
// Written as Start / Ende / Länge, `held` after it.

/** Opens a new game and applies the edits in order. */
function after(...edits: Array<['start' | 'end' | 'length', string]>): ClipFields {
  return edits.reduce((fields, [field, text]) => editClipField(fields, field, text), openClipFields())
}

function texts(fields: ClipFields) {
  return [fields.start.text, fields.end.text, fields.length.text]
}

describe('opening', () => {
  it('opens a new game with 0:00 / 0:30 / 30, Länge and Start held', () => {
    const fields = openClipFields()
    expect(texts(fields)).toEqual(['0:00', '0:30', '30'])
    expect(fields.held).toEqual(['length', 'start'])
    expect(fields.start).toMatchObject({ seconds: 0, error: null })
    expect(fields.end).toMatchObject({ seconds: 30, error: null })
    expect(fields.length).toMatchObject({ seconds: 30, error: null })
  })

  it('opens a stored game as stored, Ende worked out', () => {
    const fields = openClipFields({ clipStart: 72, clipLength: 30 })
    expect(texts(fields)).toEqual(['1:12', '1:42', '30'])
    expect(fields.end).toMatchObject({ seconds: 102, error: null })
  })

  it('opens the longest clip at the latest start with Ende 12:01:59', () => {
    const fields = openClipFields({ clipStart: 43_199, clipLength: 120 })
    expect(fields.end).toMatchObject({ text: '12:01:59', seconds: 43_319, error: null })
    expect(fields.start).toMatchObject({ seconds: 43_199, error: null })
  })

  it('opens a stored length under 10 s with Länge in error and Ende still worked out', () => {
    const fields = openClipFields({ clipStart: 60, clipLength: 5 })
    expect(fields.length).toMatchObject({ text: '5', seconds: null, error: 'invalid' })
    expect(fields.end).toMatchObject({ text: '1:05', seconds: 65, error: null })
  })
})

describe('each pair held, the third following', () => {
  it('Ende edited: Länge follows', () => {
    const fields = after(['end', '2:00'])
    expect(texts(fields)).toEqual(['0:00', '2:00', '120'])
    expect(fields.held).toEqual(['start', 'end'])
  })

  it('Ende then Länge: Start follows (the ticket example)', () => {
    const fields = after(['end', '2:00'], ['length', '60'])
    expect(texts(fields)).toEqual(['1:00', '2:00', '60'])
    expect(fields.start).toMatchObject({ seconds: 60, error: null })
    expect(fields.held).toEqual(['end', 'length'])
  })

  it('editing the follower makes the field edited longest ago follow', () => {
    const fields = after(['end', '2:00'], ['length', '60'], ['start', '0:10'])
    expect(texts(fields)).toEqual(['0:10', '1:10', '60'])
    expect(fields.held).toEqual(['length', 'start'])
  })

  it('Länge then Start: Ende follows', () => {
    const fields = after(['length', '45'], ['start', '1:00'])
    expect(texts(fields)).toEqual(['1:00', '1:45', '45'])
    expect(fields.held).toEqual(['length', 'start'])
  })

  it('Länge again, then Ende: Start, edited longest ago, follows', () => {
    const afterLength = after(['length', '45'], ['start', '1:00'], ['length', '60'])
    expect(texts(afterLength)).toEqual(['1:00', '2:00', '60'])
    expect(afterLength.held).toEqual(['start', 'length'])
    const afterEnd = editClipField(afterLength, 'end', '3:00')
    expect(texts(afterEnd)).toEqual(['2:00', '3:00', '60'])
    expect(afterEnd.held).toEqual(['length', 'end'])
  })

  it('Länge then Ende: Start follows', () => {
    const fields = after(['length', '45'], ['end', '3:00'])
    expect(texts(fields)).toEqual(['2:15', '3:00', '45'])
    expect(fields.held).toEqual(['length', 'end'])
  })

  it('editing the newer held field keeps held', () => {
    const fields = after(['end', '2:00'], ['end', '1:00'])
    expect(fields.held).toEqual(['start', 'end'])
    expect(texts(fields)).toEqual(['0:00', '1:00', '60'])
  })

  it.each([
    ['3665'],
    ['61:05'],
    ['1:01:05'],
  ])('reads Ende %j as 65 s after a start of 3600', (text) => {
    const fields = editClipField(openClipFields({ clipStart: 3600, clipLength: 30 }), 'end', text)
    expect(fields.length).toMatchObject({ text: '65', seconds: 65, error: null })
    expect(fields.end.text).toBe(text)
  })

  it.each([
    ['90', 90],
    ['1:30', 90],
  ])('reads Start %j as %i s', (text, seconds) => {
    const fields = editClipField(openClipFields(), 'start', text)
    expect(fields.start).toMatchObject({ text, seconds, error: null })
  })

  it('refuses 0:90 as a Start (seconds above 59 after a colon)', () => {
    expect(editClipField(openClipFields(), 'start', '0:90').start).toMatchObject({ seconds: null, error: 'invalid' })
  })

  it('takes the latest start and works Ende out to 12:00:29', () => {
    expect(editClipField(openClipFields(), 'start', '11:59:59').end).toMatchObject({ text: '12:00:29', seconds: 43_229, error: null })
  })

  it('takes Ende up to 12:01:59 and no further', () => {
    expect(after(['end', '12:01:59']).end).toMatchObject({ seconds: 43_319, error: null })
    expect(after(['end', '12:02:00']).end).toMatchObject({ seconds: null, error: 'invalid' })
  })
})

describe('the errors', () => {
  it('Ende before Start: Länge shows end_before_start', () => {
    const fields = editClipField(openClipFields({ clipStart: 120, clipLength: 30 }), 'end', '1:00')
    expect(fields.length).toMatchObject({ text: '', seconds: null, error: 'end_before_start' })
    expect(fields.start).toMatchObject({ text: '2:00', error: null })
    expect(fields.end).toMatchObject({ text: '1:00', error: null })
  })

  it.each([
    ['0:09', '9', null, 'invalid'],
    ['0:10', '10', 10, null],
    ['2:00', '120', 120, null],
    ['2:01', '121', null, 'invalid'],
    ['0:00', '0', null, 'invalid'],
  ])('Ende %s from Start 0:00 gives Länge %s', (text, lengthText, seconds, error) => {
    expect(after(['end', text]).length).toMatchObject({ text: lengthText, seconds, error })
  })

  it('Ende and Länge giving a Start before 0:00: Start shows start_before_zero', () => {
    const fields = after(['end', '0:20'], ['length', '60'])
    expect(fields.start).toMatchObject({ text: '', seconds: null, error: 'start_before_zero' })
    expect(fields.end.error).toBeNull()
    expect(fields.length.error).toBeNull()
  })

  it('Ende 1:00 and Länge 60 give Start 0:00 exactly', () => {
    expect(after(['end', '1:00'], ['length', '60']).start).toMatchObject({ text: '0:00', seconds: 0, error: null })
  })

  it('Ende 12:01:59 and Länge 10 give a Start above 11:59:59: invalid', () => {
    expect(after(['end', '12:01:59'], ['length', '10']).start).toMatchObject({ text: '', seconds: null, error: 'invalid' })
  })

  it('a cleared follower keeps its text and holds nothing until the pair is valid', () => {
    const cleared = after(['end', ''])
    expect(cleared.end).toMatchObject({ text: '', seconds: null, error: 'invalid' })
    expect(cleared.held).toEqual(['start', 'end'])
    expect(cleared.length).toMatchObject({ text: '30', seconds: null, error: null })
    expect(editClipField(cleared, 'end', '2:00').length).toMatchObject({ text: '120', seconds: 120, error: null })
  })

  it('an unparsable held field shows its own error and leaves the follower stale', () => {
    const fields = after(['start', 'bald'])
    expect(fields.start).toMatchObject({ text: 'bald', seconds: null, error: 'invalid' })
    expect(fields.end).toMatchObject({ text: '0:30', seconds: null, error: null })
    expect(fields.held).toEqual(['length', 'start'])
  })

  it('an emptied Länge is invalid and Ende stays stale', () => {
    const fields = after(['length', ''])
    expect(fields.length).toMatchObject({ seconds: null, error: 'invalid' })
    expect(fields.end).toMatchObject({ text: '0:30', seconds: null, error: null })
  })

  it('Länge takes seconds only: 1:30 is invalid', () => {
    expect(after(['length', '1:30']).length).toMatchObject({ seconds: null, error: 'invalid' })
  })
})

describe('editing', () => {
  it('keeps the typed text as it is', () => {
    expect(after(['start', '90']).start.text).toBe('90')
  })

  it('counts an invalid edit as the last one', () => {
    expect(after(['end', 'x']).held).toEqual(['start', 'end'])
  })

  it('returns a new object and leaves its argument unchanged', () => {
    const before = openClipFields()
    const snapshot = structuredClone(before)
    Object.freeze(before)
    const next = editClipField(before, 'end', '2:00')
    expect(next).not.toBe(before)
    expect(before).toEqual(snapshot)
  })
})
