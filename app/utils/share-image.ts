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
        winsOne: t('share.image.winsOne'),
        winsMany: t('share.image.winsMany'),
        points: forms(t, 'share.image.points'),
        pts: forms(t, 'share.image.pts'),
        people: keep('share.image.people', 'n'),
        person: t('share.image.person'),
        games: forms(t, 'share.image.games'),
        moreGames: keep('share.image.moreGames', 'n'),
        moreParty: t('share.image.moreParty'),
        moreParties: keep('share.image.moreParties', 'n'),
        brand: t('share.image.brand'),
        alt: keep('share.image.alt', 'winner', 'event', 'points'),
        altMany: keep('share.image.altMany', 'winner', 'event', 'points'),
        altPlace: keep('share.image.altPlace', 'rank', 'name', 'points'),
      },
    },
    team: {
      defaultName: keep('team.defaultName', 'color'),
      colors: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [String(index + 1), t(`team.colors.${index + 1}`)])),
    },
  }
}
