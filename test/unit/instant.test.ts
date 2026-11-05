import { describe, expect, it } from 'vitest'
import { msOf } from '../../shared/instant'

// One home for an instant as the rules receive it (#261, Standards N8, Quality Q13): epoch ms, a Date (the server's rows)
// or an ISO string (the Event read). The same instant gives the same ms however it arrives.

describe('msOf', () => {
  it('reads epoch ms as they are', () => {
    expect(msOf(1000)).toBe(1000)
  })

  it('reads a Date as its ms', () => {
    expect(msOf(new Date(1000))).toBe(1000)
  })

  it('reads an ISO string as its ms', () => {
    expect(msOf('1970-01-01T00:00:01.000Z')).toBe(1000)
  })

  it('gives the same ms for the same instant however it is given', () => {
    const at = Date.parse('2090-10-30T10:00:07.500Z')
    expect(msOf(at)).toBe(msOf(new Date(at)))
    expect(msOf(at)).toBe(msOf('2090-10-30T10:00:07.500Z'))
  })
})
