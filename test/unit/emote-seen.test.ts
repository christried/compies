import { describe, expect, it } from 'vitest'
import { emoteSeen, type EmoteSight } from '../../app/utils/emote-seen'

// The rule of #769 (spec #719 § C): an arrived Emote is drawn only where the Game board is seen. A pure decision over facts the page reads from the browser.

const view = { width: 1000, height: 700 }
const sight = (over: Partial<EmoteSight> = {}): EmoteSight => ({ covered: false, hidden: false, box: { left: 100, top: 100, right: 144, bottom: 144 }, view, ...over })
const boxAt = (left: number, top: number) => ({ left, top, right: left + 44, bottom: top + 44 })

describe('emoteSeen', () => {
  it('is true for a box inside the window', () => {
    expect(emoteSeen(sight())).toBe(true)
  })

  it('is true for a box half out of the window on each side', () => {
    expect(emoteSeen(sight({ box: boxAt(-22, 100) }))).toBe(true)
    expect(emoteSeen(sight({ box: boxAt(view.width - 22, 100) }))).toBe(true)
    expect(emoteSeen(sight({ box: boxAt(100, -22) }))).toBe(true)
    expect(emoteSeen(sight({ box: boxAt(100, view.height - 22) }))).toBe(true)
  })

  it('is false while a cover is up', () => {
    expect(emoteSeen(sight({ covered: true }))).toBe(false)
  })

  it('is false while the tab is hidden', () => {
    expect(emoteSeen(sight({ hidden: true }))).toBe(false)
  })

  it('is false for a box with no size: an element with no layout', () => {
    expect(emoteSeen(sight({ box: { left: 100, top: 100, right: 100, bottom: 100 } }))).toBe(false)
    expect(emoteSeen(sight({ box: { left: 100, top: 100, right: 144, bottom: 100 } }))).toBe(false)
    expect(emoteSeen(sight({ box: { left: 100, top: 100, right: 100, bottom: 144 } }))).toBe(false)
  })

  it('is false for a box wholly above, below, left or right of the window', () => {
    expect(emoteSeen(sight({ box: boxAt(100, -200) }))).toBe(false)
    expect(emoteSeen(sight({ box: boxAt(100, view.height + 200) }))).toBe(false)
    expect(emoteSeen(sight({ box: boxAt(-200, 100) }))).toBe(false)
    expect(emoteSeen(sight({ box: boxAt(view.width + 200, 100) }))).toBe(false)
  })

  it('is false for a box that only touches an edge of the window', () => {
    expect(emoteSeen(sight({ box: boxAt(100, view.height) }))).toBe(false)
    expect(emoteSeen(sight({ box: boxAt(-44, 100) }))).toBe(false)
    expect(emoteSeen(sight({ box: boxAt(100, -44) }))).toBe(false)
    expect(emoteSeen(sight({ box: boxAt(view.width, 100) }))).toBe(false)
  })

  it('lets a cover and a hidden tab win over a box that is inside', () => {
    expect(emoteSeen(sight({ covered: true, hidden: true }))).toBe(false)
    expect(emoteSeen(sight({ covered: true, box: boxAt(500, 300) }))).toBe(false)
    expect(emoteSeen(sight({ hidden: true, box: boxAt(500, 300) }))).toBe(false)
  })
})
