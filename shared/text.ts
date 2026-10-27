// How long a text is for the name rules (#76): in characters as the User sees them (grapheme clusters), so 👍🏽,
// 🇩🇪 and 👨‍👩‍👧 each count as one. Shared by the server's rules and the form fields, so both agree at the limit.

const graphemes = new Intl.Segmenter('de', { granularity: 'grapheme' })

/** The number of characters a User sees in `text`. */
export function characterCount(text: string): number {
  return [...graphemes.segment(text)].length
}

/** `text` cut to at most `max` characters as characterCount counts them. */
export function cutToCharacters(text: string, max: number): string {
  return [...graphemes.segment(text)].slice(0, max).map(part => part.segment).join('')
}
