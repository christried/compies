import { describe, expect, it } from 'vitest'
import { groupMessages, markDeleted, mergeMessages, splitMessageText } from '~/utils/chat'
import type { DeletedMessage, LiveMessage, Message } from '~~/shared/chat'

// The Chat's pure rules (#761, spec #719 § A): the Messages of one writer within two minutes of each other sit under one name line, and a page read again merges into
// what is held by id. The start is a fixed instant; `at` is an ISO string of milliseconds, as the server writes it.
const START = Date.parse('2026-11-19T20:00:00.000Z')

function live(id: string, writerId: string, secondsAfterStart: number, text = id): LiveMessage {
  return { id, writerId, text, at: new Date(START + secondsAfterStart * 1000).toISOString() }
}

function gone(id: string, writerId: string, secondsAfterStart: number, deletedBy: DeletedMessage['deletedBy'] = 'host'): DeletedMessage {
  return { id, writerId, text: null, at: new Date(START + secondsAfterStart * 1000).toISOString(), deletedBy }
}

const ids = (messages: readonly Message[]) => messages.map(message => message.id)

describe('groupMessages', () => {
  it('has no group for no Message and one group of one for one', () => {
    expect(groupMessages([])).toEqual([])
    expect(groupMessages([live('a', 'u1', 0)])).toEqual([{ writerId: 'u1', messages: [live('a', 'u1', 0)] }])
  })

  it('puts two Messages of one writer 119 s and 120 s apart in one group, and 121 s apart in two', () => {
    expect(groupMessages([live('a', 'u1', 0), live('b', 'u1', 119)])).toHaveLength(1)
    expect(groupMessages([live('a', 'u1', 0), live('b', 'u1', 120)])).toHaveLength(1)
    expect(groupMessages([live('a', 'u1', 0), live('b', 'u1', 121)])).toHaveLength(2)
  })

  it('measures from the previous Message, not from the first of the group', () => {
    const groups = groupMessages([live('a', 'u1', 0), live('b', 'u1', 100), live('c', 'u1', 200), live('d', 'u1', 321)])
    expect(groups.map(group => ids(group.messages))).toEqual([['a', 'b', 'c'], ['d']])
  })

  it('starts a new group when another writer wrote between, so A, B, A are three groups', () => {
    const groups = groupMessages([live('a', 'u1', 0), live('b', 'u2', 10), live('c', 'u1', 20)])
    expect(groups.map(group => group.writerId)).toEqual(['u1', 'u2', 'u1'])
  })

  it('starts a new group for the same writer after a gap', () => {
    const groups = groupMessages([live('a', 'u1', 0), live('b', 'u1', 30), live('c', 'u1', 400)])
    expect(groups.map(group => ids(group.messages))).toEqual([['a', 'b'], ['c']])
  })

  it('keeps a deleted Message in its group, where it was written', () => {
    const groups = groupMessages([live('a', 'u1', 0), gone('b', 'u1', 60), live('c', 'u1', 90)])
    expect(groups).toHaveLength(1)
    expect(ids(groups[0]!.messages)).toEqual(['a', 'b', 'c'])
  })
})

describe('mergeMessages', () => {
  it('adds a Message the list does not hold and sorts by time', () => {
    const merged = mergeMessages([live('b', 'u1', 20)], [live('c', 'u1', 30), live('a', 'u1', 10)])
    expect(ids(merged)).toEqual(['a', 'b', 'c'])
  })

  it('sorts two Messages of one millisecond by id', () => {
    const merged = mergeMessages([], [live('b', 'u1', 5), live('a', 'u2', 5)])
    expect(ids(merged)).toEqual(['a', 'b'])
  })

  it('replaces a held live Message with the deleted one an incoming page carries', () => {
    const merged = mergeMessages([live('a', 'u1', 0, 'hello')], [gone('a', 'u1', 0, 'writer')])
    expect(merged).toEqual([gone('a', 'u1', 0, 'writer')])
  })

  it('keeps a held deleted Message when a stale page brings the live one', () => {
    const merged = mergeMessages([gone('a', 'u1', 0)], [live('a', 'u1', 0, 'hello')])
    expect(merged).toEqual([gone('a', 'u1', 0)])
  })

  it('keeps the held Message when the same id arrives live again', () => {
    const held = live('a', 'u1', 0, 'first')
    const merged = mergeMessages([held], [live('a', 'u1', 0, 'other')])
    expect(merged).toEqual([held])
  })

  it('does not change by merging the same page twice, and does not touch its arguments', () => {
    const page = [live('a', 'u1', 0), gone('b', 'u2', 10), live('c', 'u1', 20)]
    const once = mergeMessages([], page)
    const twice = mergeMessages(once, page)
    expect(twice).toEqual(once)
    expect(ids(once)).toEqual(['a', 'b', 'c'])
    expect(page).toHaveLength(3)
  })
})

// A Message deleted while shown (#763): `chat.deleted` and the delete's answer turn a live Message into its line, in place.
describe('markDeleted', () => {
  it('replaces a live Message with its line, keeping its writer and its time', () => {
    const marked = markDeleted([live('a', 'u1', 0, 'hello')], 'a', 'writer')
    expect(marked).toEqual([gone('a', 'u1', 0, 'writer')])
  })

  it('keeps every other Message and the order', () => {
    const marked = markDeleted([live('a', 'u1', 0), live('b', 'u2', 10), live('c', 'u1', 20)], 'b', 'host')
    expect(marked).toEqual([live('a', 'u1', 0), gone('b', 'u2', 10, 'host'), live('c', 'u1', 20)])
  })

  it('leaves the list as it is for an id it does not hold', () => {
    const held = [live('a', 'u1', 0)]
    expect(markDeleted(held, 'zzz', 'host')).toEqual(held)
    expect(markDeleted([], 'a', 'host')).toEqual([])
  })

  it('keeps the first deleter of a Message that is already deleted', () => {
    expect(markDeleted([gone('a', 'u1', 0, 'host')], 'a', 'writer')).toEqual([gone('a', 'u1', 0, 'host')])
  })

  it('does not change its argument', () => {
    const held = [live('a', 'u1', 0, 'hello'), live('b', 'u1', 5)]
    markDeleted(held, 'a', 'writer')
    expect(held).toEqual([live('a', 'u1', 0, 'hello'), live('b', 'u1', 5)])
  })
})

// The links of a Message (#762): an http or https address is a link, everything else is text, and the pieces joined give the text back.
const LINKS_TEXT_CASES = [
  '',
  'hallo Welt',
  'https://x.de/a ist da',
  'schau https://x.de/a da',
  'schau https://x.de/a',
  'https://x.de/a.',
  'https://x.de/a, dann',
  '(https://x.de/a)',
  '[https://x.de/a]',
  'https://de.wikipedia.org/wiki/Foo_(Bar)',
  'erst https://x.de/a und https://y.de/b.',
  'javascript:alert(1) ftp://x.de mailto:a@x.de',
  'https:// https://. https:/x.de',
  '"https://x.de/"><b>',
  'HTTP://X.DE/A',
  `https://x.de/${'a'.repeat(480 - 'https://x.de/'.length)}`,
]

describe('splitMessageText', () => {
  it('has no piece for an empty text, and one plain piece for a text without an address', () => {
    expect(splitMessageText('')).toEqual([])
    expect(splitMessageText('hallo Welt')).toEqual([{ text: 'hallo Welt' }])
  })

  it('links an address at the start, in the middle and at the end', () => {
    expect(splitMessageText('https://x.de/a ist da')).toEqual([{ text: 'https://x.de/a', href: 'https://x.de/a' }, { text: ' ist da' }])
    expect(splitMessageText('schau https://x.de/a da')).toEqual([{ text: 'schau ' }, { text: 'https://x.de/a', href: 'https://x.de/a' }, { text: ' da' }])
    expect(splitMessageText('schau https://x.de/a')).toEqual([{ text: 'schau ' }, { text: 'https://x.de/a', href: 'https://x.de/a' }])
  })

  it('keeps a trailing full stop or comma out of the link, as text', () => {
    expect(splitMessageText('https://x.de/a.')).toEqual([{ text: 'https://x.de/a', href: 'https://x.de/a' }, { text: '.' }])
    expect(splitMessageText('https://x.de/a, dann')).toEqual([{ text: 'https://x.de/a', href: 'https://x.de/a' }, { text: ', dann' }])
  })

  it('shows the brackets around an address as text and links the address', () => {
    expect(splitMessageText('(https://x.de/a)')).toEqual([{ text: '(' }, { text: 'https://x.de/a', href: 'https://x.de/a' }, { text: ')' }])
    expect(splitMessageText('[https://x.de/a]')).toEqual([{ text: '[' }, { text: 'https://x.de/a', href: 'https://x.de/a' }, { text: ']' }])
  })

  it('keeps a closing bracket that belongs to the address', () => {
    const address = 'https://de.wikipedia.org/wiki/Foo_(Bar)'
    expect(splitMessageText(address)).toEqual([{ text: address, href: address }])
  })

  it('links two addresses in one text, in order', () => {
    expect(splitMessageText('erst https://x.de/a und https://y.de/b.')).toEqual([
      { text: 'erst ' },
      { text: 'https://x.de/a', href: 'https://x.de/a' },
      { text: ' und ' },
      { text: 'https://y.de/b', href: 'https://y.de/b' },
      { text: '.' },
    ])
  })

  it('links no javascript:, ftp: or mailto: address', () => {
    expect(splitMessageText('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }])
    expect(splitMessageText('ftp://x.de')).toEqual([{ text: 'ftp://x.de' }])
    expect(splitMessageText('mailto:a@x.de')).toEqual([{ text: 'mailto:a@x.de' }])
  })

  it('links no bare scheme', () => {
    expect(splitMessageText('https://')).toEqual([{ text: 'https://' }])
    expect(splitMessageText('https://.')).toEqual([{ text: 'https://.' }])
    expect(splitMessageText('https:/x.de')).toEqual([{ text: 'https:/x.de' }])
  })

  it('ends an address at a quote or a tag, and shows what follows as text', () => {
    expect(splitMessageText('"https://x.de/"><b>')).toEqual([{ text: '"' }, { text: 'https://x.de/', href: 'https://x.de/' }, { text: '"><b>' }])
  })

  it('links an upper-case scheme, with the address as typed and the parsed address as href', () => {
    expect(splitMessageText('HTTP://X.DE/A')).toEqual([{ text: 'HTTP://X.DE/A', href: 'http://x.de/A' }])
  })

  it('keeps a 480-character address whole, in one link', () => {
    const address = `https://x.de/${'a'.repeat(480 - 'https://x.de/'.length)}`
    expect(splitMessageText(address)).toEqual([{ text: address, href: address }])
  })

  it('gives back the text it was given, joined, for every case', () => {
    for (const text of LINKS_TEXT_CASES) {
      expect(splitMessageText(text).map(piece => piece.text).join('')).toBe(text)
    }
  })
})
