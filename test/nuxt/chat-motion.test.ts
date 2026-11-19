import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatRise } from '~/utils/motion'
import { motion } from './motion'

// A new Message of the Chat (#761, 02-components § ChatPanel: „new message `y 8→0, fade` `dur-base`“). `Element.animate` is a stub that records each call.

const OUT = 'cubic-bezier(.16,1,.3,1)'

interface Call { keyframes: Keyframe[], options: KeyframeAnimationOptions }
let calls: Call[]
const realAnimate = Element.prototype.animate

beforeEach(() => {
  calls = []
  Element.prototype.animate = function (keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ keyframes, options })
    return { finished: Promise.resolve(), cancel() {} }
  } as unknown as typeof Element.prototype.animate
})

afterEach(() => {
  Element.prototype.animate = realAnimate
  vi.restoreAllMocks()
})

describe('the rise of a Message', () => {
  it('moves 8 px up into place and fades in, 220 ms on --cp-ease-out, at full motion', () => {
    motion('full')
    const animation = chatRise(document.createElement('div'))

    expect(animation).toBeDefined()
    expect(calls).toHaveLength(1)
    const { keyframes, options } = calls[0]!
    expect(keyframes).toEqual([
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ])
    expect(options.duration).toBe(220)
    expect(options.easing).toBe(OUT)
    expect(options.fill).toBe('both')
  })

  it('fades only under reduced motion, in the same time and on the same curve', () => {
    motion('reduced')
    chatRise(document.createElement('div'))

    expect(calls).toHaveLength(1)
    const { keyframes, options } = calls[0]!
    expect(keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(keyframes.some(frame => 'transform' in frame)).toBe(false)
    expect(options.duration).toBe(220)
    expect(options.easing).toBe(OUT)
  })

  it('does nothing where an element cannot animate', () => {
    motion('full')
    const element = document.createElement('div') as unknown as { animate?: unknown }
    element.animate = undefined

    expect(chatRise(element as unknown as Element)).toBeUndefined()
    expect(calls).toHaveLength(0)
  })
})
