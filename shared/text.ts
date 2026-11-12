// How long a text is for the name rules (#76): in characters as the User sees them (grapheme clusters), so 👍🏽,
// 🇩🇪 and 👨‍👩‍👧 each count as one. Shared by the server's rules and the form fields, so both agree at the limit.

const graphemes = new Intl.Segmenter('de', { granularity: 'grapheme' })

/** `text` as the characters a User sees, one string each (#546: the one segmenter, the Share image breaks names with it too). */
export function graphemesOf(text: string): string[] {
  return [...graphemes.segment(text)].map(part => part.segment)
}

/** The number of characters a User sees in `text`. */
export function characterCount(text: string): number {
  return graphemesOf(text).length
}

/** `text` cut to at most `max` characters as characterCount counts them. */
export function cutToCharacters(text: string, max: number): string {
  return graphemesOf(text).slice(0, max).join('')
}
