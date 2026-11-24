import { describe, expect, it } from 'vitest'
import { shownPerson } from '../../app/utils/shown-person'
import type { Translate } from '../../app/utils/settings-summary'
import de from '../../i18n/locales/de.json'

// What a viewer is shown of a person (#915, ADR 0020): a Deleted User reads „Gelöschtes Konto“ with no picture, the same for everyone.

const t: Translate = (key) => {
  const message = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de)
  if (typeof message !== 'string') throw new Error(`No copy for ${key}`)
  return message
}

describe('shownPerson', () => {
  it('shows a Deleted User as „Gelöschtes Konto“ without a picture', () => {
    expect(shownPerson({ name: '', image: null, deleted: true }, t)).toEqual({ name: 'Gelöschtes Konto', image: null, deleted: true })
  })

  it('does not trust a name or a picture that came with the mark', () => {
    expect(shownPerson({ name: 'Dom', image: 'https://example.com/dom.png', deleted: true }, t)).toEqual({ name: 'Gelöschtes Konto', image: null, deleted: true })
  })

  it('passes the name and the picture of a person who is not deleted', () => {
    expect(shownPerson({ name: 'Dom', image: 'https://example.com/dom.png' }, t)).toEqual({ name: 'Dom', image: 'https://example.com/dom.png', deleted: false })
    expect(shownPerson({ name: 'Dom', image: 'https://example.com/dom.png', deleted: undefined }, t)).toEqual({ name: 'Dom', image: 'https://example.com/dom.png', deleted: false })
    expect(shownPerson({ name: 'Dom', deleted: false }, t)).toEqual({ name: 'Dom', image: null, deleted: false })
  })
})
