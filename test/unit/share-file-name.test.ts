import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import type { Translate } from '../../app/utils/settings-summary'
import { shareFileName, shareImageCopy } from '../../app/utils/share-image'

/** vue-i18n's `t` for the cases the adapter needs: named values and „einzahl | mehrzahl“ by the plural argument. */
const t: Translate = (key, named = {}, plural) => {
  const message = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de)
  if (typeof message !== 'string') throw new Error(`No copy for ${key}`)
  const forms = message.split(' | ')
  const form = forms.length > 1 ? forms[plural === 1 ? 0 : 1]! : message
  return form.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name] ?? (name === 'n' ? plural : '')))
}

// The picture's copy as the app hands it to the model (#313): the sheet cannot import de.json (the i18n module compiles it), so it asks `t`
// for each string and keeps the placeholders and the plural forms for the model to fill. It must come out as the file says.
describe('shareImageCopy', () => {
  it('equals the strings of de.json the model reads, placeholders and plural forms included', () => {
    const copy = shareImageCopy(t)

    expect(copy.share.image).toEqual(de.share.image)
    expect(copy.team).toEqual({ defaultName: de.team.defaultName, colors: de.team.colors })
  })
})

// The name the Share image downloads and shares under (#313): the Event's slug and the format, nothing of the Event's name or a Player's.
describe('shareFileName', () => {
  it('names the wide format Querformat', () => {
    expect(shareFileName('freitags-zocken-k7q2', 'wide')).toBe('freitags-zocken-k7q2-querformat.png')
  })

  it('names the square format Quadrat', () => {
    expect(shareFileName('freitags-zocken-k7q2', 'square')).toBe('freitags-zocken-k7q2-quadrat.png')
  })
})
