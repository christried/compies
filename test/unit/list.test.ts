import { describe, expect, it } from 'vitest'
import { joinNames } from '../../app/utils/list'

// The German list of names (#274): „A“, „A und B“, „A, B und C“; the one home of the Intl.ListFormat expression.
describe('joinNames', () => {
  it('reads one name as it is', () => {
    expect(joinNames(['Rot'])).toBe('Rot')
  })

  it('joins two names with „und“', () => {
    expect(joinNames(['Rot', 'Blau'])).toBe('Rot und Blau')
  })

  it('joins three names with a comma and „und“', () => {
    expect(joinNames(['Rot', 'Blau', 'Grün'])).toBe('Rot, Blau und Grün')
  })

  it('reads no names as an empty text', () => {
    expect(joinNames([])).toBe('')
  })
})
