import source from '~~/CHANGELOG.md?raw'
import { parseChangelog } from '~~/shared/changelog'

// The Releases for Neuigkeiten (#80, 09-neuigkeiten). CHANGELOG.md is bundled in at build time, so
// the page has no loading or not-found state. [Unreleased] stays out: only `RELEASES` is exported.
export const RELEASES = parseChangelog(source).releases

// Duden abbreviations (09 § ReleaseCard), fixed here so server and browser format alike.
const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.']

/** A Release date as „2. Nov. 2026“, from its ISO date. */
export function formatReleaseDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return `${day}. ${MONTHS[month! - 1]} ${year}`
}
