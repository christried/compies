import { describe, expect, it } from 'vitest'
import { drawSpin } from '../../server/domain/wheel'

// The server's draw of a spin (#229, spec #218 § Drawing, Hidden wheel on the wire): uniform over the games left, an offset
// that keeps the pointer off the slice edges, and placeholder labels shuffled for that spin. The source of randomness is
// passed in, so the tests script it.

/** A source of randomness that answers from a script, and records what it was asked. */
function scripted(...answers: number[]) {
  const asked: number[] = []
  const randomInt = (n: number) => {
    asked.push(n)
    return answers[asked.length - 1] ?? 0
  }
  return { randomInt, asked }
}

const left = ['halo', 'kart', 'pong', 'schach']

describe('drawSpin', () => {
  it('asks the source for one of the games left, so the draw is as uniform as the source', () => {
    const source = scripted(2, 0)

    const spin = drawSpin(left, null, source.randomInt)

    expect(source.asked[0]).toBe(4)
    expect(spin.resultIndex).toBe(2)
    expect(spin.sliceGameIds[spin.resultIndex]).toBe('pong')
  })

  it('lays the wheel out in the order of the games left', () => {
    expect(drawSpin(left, null, scripted(0, 0).randomInt).sliceGameIds).toEqual(left)
  })

  it('keeps the pointer inside the slice: the offset is from 0.2 up to, not including, 0.8', () => {
    const lowest = drawSpin(left, null, scripted(0, 0).randomInt).resultOffset
    const highest = drawSpin(left, null, (n: number) => n - 1).resultOffset

    expect(lowest).toBe(0.2)
    expect(highest).toBeGreaterThan(0.79)
    expect(highest).toBeLessThan(0.8)
  })

  it('has no labels on a visible wheel: the clients take the names from the Event read', () => {
    expect(drawSpin(left, null, scripted(0, 0).randomInt).sliceLabels).toBeNull()
  })

  it('labels a Hidden wheel with the placeholders, shuffled, one for each slice and none twice', () => {
    const placeholders = ['A', 'B', 'C', 'D', 'E']
    // The source always answers 0: the shuffle then has a known result (Fisher-Yates from the end).
    const spin = drawSpin(left, placeholders, () => 0)

    expect(spin.sliceLabels).toHaveLength(4)
    expect(new Set(spin.sliceLabels).size).toBe(4)
    expect(spin.sliceLabels!.every(label => placeholders.includes(label))).toBe(true)
  })

  it('shuffles the placeholders with the source: a different source gives another order', () => {
    const placeholders = ['A', 'B', 'C', 'D']
    const first = drawSpin(left, placeholders, () => 0).sliceLabels
    const second = drawSpin(left, placeholders, n => n - 1).sliceLabels

    expect(first).not.toEqual(second)
  })

  it('fills the slices past the placeholders with ???', () => {
    const spin = drawSpin(left, ['A', 'B'], () => 0)

    expect(spin.sliceLabels!.slice(0, 2).sort()).toEqual(['A', 'B'])
    expect(spin.sliceLabels!.slice(2)).toEqual(['???', '???'])
  })
})
