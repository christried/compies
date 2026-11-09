import { formatPriceAmount, type GamePrice, type PriceSource } from '~~/shared/game'
import { berlinYear, formatShortDay } from './berlin-time'
import type { Translate } from './settings-summary'

// The words of a game's Price (#337, GLOSSARY: Price; #332 S3: UI copy lives in de.json, not in shared/game.ts, which keeps
// the data rules). Pure, with vue-i18n's `t` passed in, like describe-game.ts.

/** The German name of a source („Steam“, „Epic Games Store“); Free-to-play and Abo are the whole Price line when they have no amount. */
export function priceSourceLabel(source: PriceSource, t: Translate): string {
  return t(`price.source.${source}`)
}

/**
 * The Price line of a game (#337, UI): „19,99 € bei Steam · Stand 3. Nov.“, „Free-to-play · Stand 3. Nov.“, „Abo · Stand 3. Nov.“.
 * The year follows the day only when the day is not in the current Berlin year. `now` is a parameter, so tests never read the clock.
 */
export function priceLine(price: GamePrice, now: Date, t: Translate): string {
  const { cents, source, checkedAt } = price
  const label = priceSourceLabel(source, t)
  // Free-to-play and Abo carry no amount: their label is the whole offer.
  const offer = cents === null ? label : t('price.offer', { amount: formatPriceAmount(cents), source: label })
  const checked = new Date(checkedAt)
  const year = berlinYear(checked) === berlinYear(now) ? '' : ` ${berlinYear(checked)}`
  return t('price.line', { offer, day: `${formatShortDay(checked)}${year}` })
}
