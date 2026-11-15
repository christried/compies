// A translated text that carries its message key in invisible characters (#627, spec #620 § Telling the texts apart), so a script that
// reads a dev-server page back learns which message each text came from. Pure and import-free, with erasable syntax only, so the app
// (`~~/shared/key-tag`) and a node script (scripts/wording/read-keys.mjs, Node runs a .ts file natively) import the same file.
//
// The characters are U+2060 (word joiner) as the frame and U+2062 / U+2063 (invisible times / separator) as the bits 0 / 1: zero width,
// painted as nothing, no line-break opportunity (U+200B would add one). Plane 14 Tag characters came first and were measured in Chrome:
// a prefix of them added one letter-spacing to the element of a tagged text (browser check m627 B4), these add none.
//
// A tagged text is: FRAME, the key as bits (7 per ASCII character, most significant first), FRAME, the text, FRAME. A FRAME followed by a bit
// opens a tag and reads the key up to the next FRAME; any other FRAME closes the innermost open tag. So tags nest (`t('a', { x: t('b') })`)
// and follow each other (`${t('a')} ${t('b')}`).

export interface Tag {
  key: string
  /** The visible text of the tag, inner tags stripped. */
  text: string
  /** UTF-16 indexes into the raw string around the visible text, so a Range over `[from, to]` in a DOM text node measures it. */
  from: number
  to: number
  /** The raw string ended before the tag closed (code sliced the string): `to` is its end. */
  partial: boolean
}

const FRAME = '⁠'
const BITS = ['⁢', '⁣']
const TAG_CHARACTERS = /[⁠⁢⁣]/g
const ASCII_KEY = /^[A-Za-z0-9._-]{1,128}$/

export function tagKey(key: string, text: string): string {
  if (typeof text !== 'string' || text === '' || typeof key !== 'string' || !ASCII_KEY.test(key)) return text
  const bits = Array.from(key, char => char.charCodeAt(0).toString(2).padStart(7, '0')).join('').replaceAll('0', BITS[0]!).replaceAll('1', BITS[1]!)
  return `${FRAME}${bits}${FRAME}${text}${FRAME}`
}

export function stripTags(raw: string): string {
  return raw.replace(TAG_CHARACTERS, '')
}

/** The key the bits spell, or null when they are not whole 7-bit characters of the alphabet the encoder accepts. */
function keyOf(bits: string): string | null {
  if (bits.length === 0 || bits.length % 7 !== 0) return null
  let key = ''
  for (let at = 0; at < bits.length; at += 7) key += String.fromCharCode(Number.parseInt(bits.slice(at, at + 7).replaceAll(BITS[0]!, '0').replaceAll(BITS[1]!, '1'), 2))
  return ASCII_KEY.test(key) ? key : null
}

export function decodeTags(raw: string): { text: string, tags: Tag[] } {
  const tags: Tag[] = []
  // A tag whose key did not decode still takes its close, so the tags around it stay balanced.
  const open: Array<Tag | null> = []
  let index = 0
  while (index < raw.length) {
    if (raw[index] !== FRAME) {
      index++
      continue
    }
    if (!BITS.includes(raw[index + 1] ?? '')) {
      const tag = open.pop()
      if (tag) {
        tag.to = index
        tag.partial = false
      }
      index++
      continue
    }
    let end = index + 1
    while (BITS.includes(raw[end] ?? '')) end++
    // A key that never ends (a cut string) is dropped.
    if (raw[end] !== FRAME) {
      index = end
      continue
    }
    const key = keyOf(raw.slice(index + 1, end))
    if (key === null) open.push(null)
    else {
      const tag: Tag = { key, text: '', from: end + 1, to: raw.length, partial: true }
      tags.push(tag)
      open.push(tag)
    }
    index = end + 1
  }
  for (const tag of tags) tag.text = stripTags(raw.slice(tag.from, tag.to))
  return { text: stripTags(raw), tags }
}
