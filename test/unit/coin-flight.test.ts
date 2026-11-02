import { describe, expect, it } from 'vitest'
import { coinFinalPose, coinStandPose, flightKeyframes, HEAD_FACE_TRANSFORM, TAIL_FACE_TRANSFORM } from '../../app/utils/coin-flight'

// The coin's end frame (#235, review 0.7 F3): „Kopf!“ shows the Compibert head, „Schwanz!“ the curly tail. A test of the timing alone
// let the faces be swapped, so this one pins the meaning: it composes the landed camera, the coin's spin and each face's own transform
// into one rotation and asks which face looks at the viewer, and whether its picture stands upright and unmirrored.

type Vec = [number, number, number]
type Matrix = [Vec, Vec, Vec]

const IDENTITY: Matrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

/** The rotation matrices of CSS rotateX, rotateY and rotateZ (y runs down the screen, z toward the viewer). */
function rotation(axis: 'X' | 'Y' | 'Z', degrees: number): Matrix {
  const c = Math.cos((degrees * Math.PI) / 180)
  const s = Math.sin((degrees * Math.PI) / 180)
  if (axis === 'X') return [[1, 0, 0], [0, c, -s], [0, s, c]]
  if (axis === 'Y') return [[c, 0, s], [0, 1, 0], [-s, 0, c]]
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]]
}

const multiply = (a: Matrix, b: Matrix): Matrix => a.map(row => [0, 1, 2].map(col => row[0]! * b[0]![col]! + row[1]! * b[1]![col]! + row[2]! * b[2]![col]!)) as Matrix

/** The rotation a CSS transform list stands for, left to right as CSS composes it. Translations move the coin, not its direction. */
function rotationOf(transform: string): Matrix {
  let result = IDENTITY
  for (const [, name, argument] of transform.matchAll(/(\w+)\(([^)]*)\)/g)) {
    if (name!.startsWith('translate')) continue
    const axis = /^rotate([XYZ])$/.exec(name!)?.[1] as 'X' | 'Y' | 'Z' | undefined
    if (!axis) throw new Error(`the test does not know ${name}`)
    result = multiply(result, rotation(axis, Number.parseFloat(argument!)))
  }
  return result
}

const apply = (matrix: Matrix, vector: Vec): Vec => matrix.map(row => row[0]! * vector[0] + row[1]! * vector[1] + row[2]! * vector[2]) as Vec

/** Where a face's front (its normal), its right edge and its top point once the coin has landed, in the viewer's frame (z toward the viewer, y down). */
function faceAfterLanding(tails: boolean, face: string) {
  const pose = coinFinalPose(tails)
  const total = multiply(multiply(rotationOf(pose.camera), rotationOf(pose.spin)), rotationOf(face))
  return { normal: apply(total, [0, 0, 1]), right: apply(total, [1, 0, 0]), top: apply(total, [0, -1, 0]) }
}

const near = (actual: Vec, expected: Vec) => actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 6))

describe('the coin after its landing', () => {
  it('shows the tail face to the viewer for Schwanz, upright and not mirrored, and turns the head face away', () => {
    const tail = faceAfterLanding(true, TAIL_FACE_TRANSFORM)
    near(tail.normal, [0, 0, 1])
    near(tail.right, [1, 0, 0])
    near(tail.top, [0, -1, 0])

    near(faceAfterLanding(true, HEAD_FACE_TRANSFORM).normal, [0, 0, -1])
  })

  it('shows the head face to the viewer for Kopf, upright and not mirrored, and turns the tail face away', () => {
    const head = faceAfterLanding(false, HEAD_FACE_TRANSFORM)
    near(head.normal, [0, 0, 1])
    near(head.right, [1, 0, 0])
    near(head.top, [0, -1, 0])

    near(faceAfterLanding(false, TAIL_FACE_TRANSFORM).normal, [0, 0, -1])
  })

  it('is where the flight ends: the last keyframe of the spin is the final pose', () => {
    for (const tails of [false, true]) {
      const spin = flightKeyframes(tails, { io: 'ease-in-out', out: 'ease-out' }).spin
      expect(spin.at(-1)!.transform).toBe(coinFinalPose(tails).spin)
    }
  })

  it('stands the coin up before the toss', () => {
    expect(coinStandPose.spin).toBe('rotateX(0deg) rotateY(0deg) rotateZ(0deg)')
  })
})
