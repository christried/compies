import {
  CLIP_END_MAX, CLIP_LENGTH_DEFAULT, CLIP_START_MAX, clipTime, isClipLength, parseClipLength, parseClipTime,
} from '~~/shared/game'

// The three clip fields of the game form (#508, spec #501, GLOSSARY: Clip): Start, Ende and Länge. Of the three, the
// two the Host edited last hold, and the third follows at once. Only the start and the length are stored: Ende
// exists in the form alone, so this rule lives here and not in shared/ (CODING_STANDARDS § One home), and the bounds
// and parsers it reads stay in shared/game.ts.

export type ClipField = 'start' | 'end' | 'length'
/** Why a field is wrong. `invalid`: the text is no time or no length (an empty text too), or a result that no field can hold. */
export type ClipFieldError = 'invalid' | 'start_before_zero' | 'end_before_start'
export interface ClipFieldState {
  /** What the field shows: the Host's text as typed for a held field, the worked-out value for the follower. */
  text: string
  /** The field's value in seconds; null when it has an error, or when it follows and cannot be worked out. */
  seconds: number | null
  error: ClipFieldError | null
}
export interface ClipFields {
  start: ClipFieldState
  end: ClipFieldState
  length: ClipFieldState
  /** The two fields that hold, the one edited longest ago first. The third follows. */
  held: readonly [ClipField, ClipField]
}

const FIELDS: readonly ClipField[] = ['start', 'end', 'length']

function read(field: ClipField, text: string): number | null {
  if (field === 'length') return parseClipLength(text)
  return parseClipTime(text, field === 'end' ? CLIP_END_MAX : CLIP_START_MAX)
}

/** The follower from the two held fields, both valid. */
function follow(field: ClipField, start: number, end: number, length: number): ClipFieldState {
  if (field === 'end') return { text: clipTime(start + length), seconds: start + length, error: null }
  if (field === 'start') {
    const value = end - length
    if (value < 0) return { text: '', seconds: null, error: 'start_before_zero' }
    if (value > CLIP_START_MAX) return { text: '', seconds: null, error: 'invalid' }
    return { text: clipTime(value), seconds: value, error: null }
  }
  const value = end - start
  if (value < 0) return { text: '', seconds: null, error: 'end_before_start' }
  if (!isClipLength(value)) return { text: String(value), seconds: null, error: 'invalid' }
  return { text: String(value), seconds: value, error: null }
}

/** Reads the two held fields and works the third out; a held field with an error leaves the follower as it is. */
function settle(fields: ClipFields): ClipFields {
  const follower = FIELDS.find(field => !fields.held.includes(field))!
  const next = { ...fields }
  for (const field of fields.held) {
    const seconds = read(field, fields[field].text)
    next[field] = { text: fields[field].text, seconds, error: seconds === null ? 'invalid' : null }
  }
  if (fields.held.some(field => next[field].seconds === null)) {
    next[follower] = { text: fields[follower].text, seconds: null, error: null }
    return next
  }
  next[follower] = follow(follower, next.start.seconds!, next.end.seconds!, next.length.seconds!)
  return next
}

/** The fields as the form opens: a new game gets 0:00 and 30 s; an existing one its stored start and length, so nothing changes until the Host edits (story 26). */
export function openClipFields(game?: { clipStart: number, clipLength: number }): ClipFields {
  const start = game?.clipStart ?? 0
  const length = game?.clipLength ?? CLIP_LENGTH_DEFAULT
  return {
    start: { text: clipTime(start), seconds: start, error: null },
    end: { text: clipTime(start + length), seconds: start + length, error: null },
    // A stored length outside 10 to 120 (a 5 to 9 s row from before #507) opens in error: the Host sets one before saving.
    length: { text: String(length), seconds: isClipLength(length) ? length : null, error: isClipLength(length) ? null : 'invalid' },
    // Start counts as edited last, so a first edit of Ende makes Länge follow.
    held: ['length', 'start'],
  }
}

/** The Host typed `text` into `field`: it holds now, and the held field edited longest ago follows unless it is the one edited. */
export function editClipField(fields: ClipFields, field: ClipField, text: string): ClipFields {
  const held = field === fields.held[1] ? fields.held : [fields.held[1], field] as const
  return settle({ ...fields, [field]: { text, seconds: null, error: null }, held })
}
