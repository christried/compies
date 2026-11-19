import { describe, expect, it } from 'vitest'
import { EMOTE_IDS, isEmoteId, judgeEmote } from '../../shared/emote'

// The room's two Emote rules (#767, spec #719 § C): one Emote per Member every 2000 ms, and at most three a second carry a sound.
const NOW = 1_000_000

describe('judgeEmote: one Emote per Member every two seconds', () => {
  it('allows an Emote when there are no earlier ones', () => {
    expect(judgeEmote({ member: [], sounded: [] }, NOW)).toEqual({ allowed: true, sound: true })
  })

  it('refuses an Emote 1999 ms after the Member\'s last, and allows it exactly 2000 ms after', () => {
    expect(judgeEmote({ member: [NOW - 1999], sounded: [] }, NOW)).toEqual({ allowed: false })
    expect(judgeEmote({ member: [NOW - 2000], sounded: [] }, NOW)).toEqual({ allowed: true, sound: true })
  })

  it('ignores the Member\'s Emotes older than two seconds, whatever is in the list', () => {
    expect(judgeEmote({ member: [NOW - 9000, NOW - 5000, NOW - 2001], sounded: [] }, NOW)).toEqual({ allowed: true, sound: true })
  })

  it('refuses when any of the Member\'s times is inside the window', () => {
    expect(judgeEmote({ member: [NOW - 9000, NOW - 500], sounded: [] }, NOW)).toEqual({ allowed: false })
  })

  it('makes a Member wait when a time lies in the future (the clock stepped back)', () => {
    expect(judgeEmote({ member: [NOW + 5000], sounded: [] }, NOW)).toEqual({ allowed: false })
  })

  it('gives a refused Emote no sound field', () => {
    expect(judgeEmote({ member: [NOW - 10], sounded: [] }, NOW)).not.toHaveProperty('sound')
  })
})

describe('judgeEmote: at most three sounds a second', () => {
  it('gives the first, second and third Emote of an instant a sound', () => {
    for (const earlier of [0, 1, 2]) {
      expect(judgeEmote({ member: [], sounded: Array.from({ length: earlier }, () => NOW) }, NOW)).toEqual({ allowed: true, sound: true })
    }
  })

  it('lets the fourth Emote of an instant pass without a sound', () => {
    expect(judgeEmote({ member: [], sounded: [NOW, NOW, NOW] }, NOW)).toEqual({ allowed: true, sound: false })
  })

  it('still silences an Emote 999 ms after three sounds, and gives one a sound exactly 1000 ms after', () => {
    expect(judgeEmote({ member: [], sounded: [NOW - 999, NOW - 999, NOW - 999] }, NOW)).toEqual({ allowed: true, sound: false })
    expect(judgeEmote({ member: [], sounded: [NOW - 1000, NOW - 1000, NOW - 1000] }, NOW)).toEqual({ allowed: true, sound: true })
  })

  it('counts only the sounds inside the second', () => {
    expect(judgeEmote({ member: [], sounded: [NOW - 5000, NOW - 3000, NOW - 1000, NOW - 400, NOW - 100] }, NOW)).toEqual({ allowed: true, sound: true })
    expect(judgeEmote({ member: [], sounded: [NOW - 5000, NOW - 900, NOW - 400, NOW - 100] }, NOW)).toEqual({ allowed: true, sound: false })
  })

  it('judges the sound of an allowed Emote only: a Member inside their two seconds gets none', () => {
    expect(judgeEmote({ member: [NOW - 1], sounded: [NOW, NOW, NOW] }, NOW)).toEqual({ allowed: false })
  })
})

describe('the Emote ids', () => {
  it('are the four of the locale, in this order', () => {
    expect([...EMOTE_IDS]).toEqual(['clap', 'tears', 'angry', 'roar'])
  })

  it('recognises each id and nothing else', () => {
    for (const id of EMOTE_IDS) expect(isEmoteId(id)).toBe(true)
    for (const other of ['', 'Clap', 'zap', 42, null, undefined, {}, ['clap'], 'constructor', '__proto__']) expect(isEmoteId(other)).toBe(false)
  })
})
