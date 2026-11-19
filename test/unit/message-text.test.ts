import { describe, expect, it } from 'vitest'
import { MESSAGE_MAX, normaliseMessageLineBreaks, parseMessageText } from '../../shared/message-text'

const ok = (text: string) => ({ ok: true, text })
const refused = (error: 'invalid_value' | 'invalid_message') => ({ ok: false, error })

// The one line-break rule the composer and the parser share (#848, review S7).
describe('normaliseMessageLineBreaks', () => {
  it.each([
    ['LF', 'a\nb'],
    ['CR', 'a\rb'],
    ['VT', 'a\vb'],
    ['FF', 'a\fb'],
    ['NEL', 'a\u0085b'],
    ['LS (U+2028)', `a${String.fromCharCode(0x2028)}b`],
    ['PS (U+2029)', `a${String.fromCharCode(0x2029)}b`],
  ])('turns %s into one space', (_name, raw) => {
    expect(normaliseMessageLineBreaks(raw)).toBe('a b')
  })

  it('turns CRLF into one space, not two, and every other break into one each', () => {
    expect(normaliseMessageLineBreaks('a\r\nb')).toBe('a b')
    expect(normaliseMessageLineBreaks('a\n\r\nb')).toBe('a  b')
  })

  it('leaves a tab, runs of spaces and the ends as typed: trimming is the parser\'s', () => {
    expect(normaliseMessageLineBreaks(' a\t b  \n')).toBe(' a\t b   ')
  })
})

describe('parseMessageText', () => {
  it('refuses a text of nothing but spaces and line breaks as empty', () => {
    for (const raw of ['', '   ', '\n', '\r\n']) expect(parseMessageText(raw)).toEqual(refused('invalid_message'))
  })

  it('allows 1 and exactly 500 characters and refuses 501', () => {
    expect(MESSAGE_MAX).toBe(500)
    expect(parseMessageText('a')).toEqual(ok('a'))
    expect(parseMessageText('a'.repeat(500))).toEqual(ok('a'.repeat(500)))
    expect(parseMessageText('a'.repeat(501))).toEqual(refused('invalid_message'))
  })

  it('counts an emoji, a flag and a family sequence as one character each', () => {
    for (const emoji of ['👍🏽', '🇩🇪', '👨‍👩‍👧']) {
      expect(parseMessageText(emoji.repeat(500))).toEqual(ok(emoji.repeat(500)))
      expect(parseMessageText(emoji.repeat(501))).toEqual(refused('invalid_message'))
    }
  })

  it('turns every line break into one space', () => {
    for (const raw of ['a\nb', 'a\r\nb', 'a\rb', 'a b', 'a\u0085b', 'a\vb', 'a\fb', 'a\u2028b', 'a\u2029b']) expect(parseMessageText(raw)).toEqual(ok('a b'))
  })

  it('keeps runs of spaces and a tab, and trims the ends', () => {
    expect(parseMessageText('a\n\nb')).toEqual(ok('a  b'))
    expect(parseMessageText('a   b')).toEqual(ok('a   b'))
    expect(parseMessageText('a\tb')).toEqual(ok('a\tb'))
    expect(parseMessageText('  hi  ')).toEqual(ok('hi'))
  })

  it('counts after the line breaks and the ends are normalised', () => {
    expect(parseMessageText(`  ${'a'.repeat(500)}\n  `)).toEqual(ok('a'.repeat(500)))
  })

  it('refuses a NUL and anything that is no string as invalid_value', () => {
    for (const raw of ['a\u0000b', undefined, null, 5, {}]) expect(parseMessageText(raw)).toEqual(refused('invalid_value'))
  })
})
