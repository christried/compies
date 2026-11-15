// A translated text that carries its message key in invisible characters (#627, spec #620 § Telling the texts apart), so a script that
// reads a dev-server page back learns which message each text came from. The characters are Unicode Tag characters: zero width, painted
// as nothing, and no line-break opportunity (U+200B would add one). Pure and import-free, with erasable syntax only, so the app
// (`~~/shared/key-tag`) and a node script (scripts/wording/read-keys.mjs, Node runs a .ts file natively) import the same file.
//
// A tagged text is: OPEN, the key as tag characters (code point + 0xE0000), CLOSE, the text, CLOSE. The first CLOSE after OPEN ends the
// key, a CLOSE outside a key ends the innermost open tag. So tags nest (`t('a', { x: t('b') })`) and follow each other (`${t('a')} ${t('b')}`).

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

const OPEN = 0xE0001
const CLOSE = 0xE007F
const OFFSET = 0xE0000
const TAG_CHARACTERS = /[\u{E0000}-\u{E007F}]/gu
const ASCII_KEY = /^[A-Za-z0-9._-]{1,128}$/

export function tagKey(key: string, text: string): string {
  if (typeof text !== 'string' || text === '' || typeof key !== 'string' || !ASCII_KEY.test(key)) return text
  const close = String.fromCodePoint(CLOSE)
  const encoded = Array.from(key, char => String.fromCodePoint(char.codePointAt(0)! + OFFSET)).join('')
  return `${String.fromCodePoint(OPEN)}${encoded}${close}${text}${close}`
}

export function stripTags(raw: string): string {
  return raw.replace(TAG_CHARACTERS, '')
}

export function decodeTags(raw: string): { text: string, tags: Tag[] } {
  const tags: Tag[] = []
  const open: Tag[] = []
  let index = 0
  while (index < raw.length) {
    const code = raw.codePointAt(index)!
    const width = code > 0xFFFF ? 2 : 1
    if (code === OPEN) {
      // Read the key up to its terminator; a key that never ends (cut string) is dropped and the character that broke it is read again.
      let end = index + width
      let key = ''
      for (;;) {
        const next = raw.codePointAt(end)
        if (next === undefined || next < OFFSET + 0x20 || next > CLOSE || next === OPEN) {
          end = -1
          break
        }
        end += 2
        if (next === CLOSE) break
        key += String.fromCodePoint(next - OFFSET)
      }
      if (end === -1) {
        index += width
        continue
      }
      const tag: Tag = { key, text: '', from: end, to: raw.length, partial: true }
      tags.push(tag)
      open.push(tag)
      index = end
      continue
    }
    if (code === CLOSE) {
      const tag = open.pop()
      if (tag) {
        tag.to = index
        tag.partial = false
      }
    }
    index += width
  }
  for (const tag of tags) tag.text = stripTags(raw.slice(tag.from, tag.to))
  return { text: stripTags(raw), tags }
}
