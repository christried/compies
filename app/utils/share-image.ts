import type { ShareFormat, ShareImageCopy } from '~~/shared/share-image'
import type { Translate } from './settings-summary'

/** The file name of a downloaded or shared Share image (#313): the Event's slug and the format, nothing else. */
export function shareFileName(slug: string, format: ShareFormat): string {
  return `${slug}-${format === 'wide' ? 'querformat' : 'quadrat'}.png`
}

/** Both forms of an „einzahl | mehrzahl“ message, with `{n}` left in place: the model picks and fills (shared/share-image.ts). */
function forms(t: Translate, key: string): string {
  return `${t(key, { n: '{n}' }, 1)} | ${t(key, { n: '{n}' }, 2)}`
}

/**
 * The strings of the picture for the model (`shareImageModel`), from the app's `t`. The model fills the placeholders and picks the plural
 * forms itself, as it does on the server (which has the file); here the placeholders are handed back as they stand, so `t` needs no values.
 * The sheet cannot import `de.json`: the i18n module compiles the locale files. share-file-name.test.ts holds this equal to the file.
 */
export function shareImageCopy(t: Translate): ShareImageCopy {
  const keep = (key: string, ...names: string[]) => t(key, Object.fromEntries(names.map(name => [name, `{${name}}`])))
  return {
    share: {
      image: {
        winner: t('share.image.winner'),
        standings: t('share.image.standings'),
        parties: keep('share.image.parties', 'n'),
        points: forms(t, 'share.image.points'),
        pointsLabel: forms(t, 'share.image.pointsLabel'),
        games: forms(t, 'share.image.games'),
        more: keep('share.image.more', 'n'),
        moreParties: keep('share.image.moreParties', 'n'),
        datesMany: keep('share.image.datesMany', 'first', 'last', 'n'),
        brand: t('share.image.brand'),
        alt: keep('share.image.alt', 'winner', 'event', 'points'),
        altPlace: keep('share.image.altPlace', 'rank', 'name'),
        gameTied: keep('share.image.gameTied', 'n'),
        tiedLegend: t('share.image.tiedLegend'),
        tie: {
          each: t('share.image.tie.each'),
          label: keep('share.image.tie.label', 'k'),
          labelBoth: t('share.image.tie.labelBoth'),
          labelAll: keep('share.image.tie.labelAll', 'k'),
          alt: keep('share.image.tie.alt', 'event', 'names', 'points'),
          altAll: keep('share.image.tie.altAll', 'event', 'who', 'points', 'names'),
          whoBoth: t('share.image.tie.whoBoth'),
          whoAll: keep('share.image.tie.whoAll', 'k'),
        },
      },
    },
    team: {
      defaultName: keep('team.defaultName', 'color'),
      colors: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [String(index + 1), t(`team.colors.${index + 1}`)])),
    },
  }
}
