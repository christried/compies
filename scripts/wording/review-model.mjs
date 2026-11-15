// The wording review's model (#628, spec #620 § The review page and § The answers file): which steps there are and in what order,
// the filters, resume, and what is new since the last sitting. Pure, no dependency; the page (#631) and the walk (#629) conform to
// the typedefs below. The recording holds no answer and no message text: the message is read from de.json each time, so a text
// reworded since the walk shows today's.

/** @typedef {'host' | 'member' | 'admin' | 'member2' | null} Account null: signed out */
/** @typedef {'text' | 'aria-label' | 'title' | 'alt' | 'placeholder' | 'server'} Via 'server': copy the server reads (calendar file, Share image), the picture is the image */
/** @typedef {'mono' | 'sr-only'} Mark 'mono': the computed font is the mono token; 'sr-only': not painted */
/**
 * One time the walk saw a text on screen.
 * `seq` is one counter over the whole walk, from 1, in the order the walk saw it; `state` is the state's name in the dark-states
 * lists, a stop is `<state>/<stop>`; `box` is in pixels of `picture` (for a label that is only read out, the element it labels);
 * `picture` is a path relative to the recording's folder, the frame is drawn into it; `rendered` is the text as shown, placeholders filled.
 * @typedef {{ seq: number, state: string, account: Account, width: number, box: { x: number, y: number, width: number, height: number }, picture: string, rendered: string, via: Via, marks: Mark[] }} Sighting
 */
/**
 * The walk's file `recording.json` (in `join(OUT, 'wording')`, pictures beside it in `pictures/`), never committed.
 * `messages`: a text that passed through `t`, once per key. `monoElements`: set in the mono font with no message, once per
 * component (the repo path of the .vue file), `what` a short German label without any User's data. `fixed`: texts that never pass
 * `t`, ids `offline.<name>`, `manifest.description`, `changelog.month.<n>`, `changelog.group.<name>`; without sightings it has no
 * picture (file and line say where). `locations`: where code refers to a key the walk never saw, best effort.
 * @typedef {{
 *   version: 1,
 *   recordedAt: string,
 *   commit: string,
 *   messages: { key: string, sightings: Sighting[] }[],
 *   monoElements: { component: string, what: string, sightings: Sighting[] }[],
 *   fixed: { id: string, text: string, file: string, line: number | null, sightings: Sighting[] }[],
 *   locations: Record<string, { file: string, line: number | null }>,
 * }} Recording
 */
/** @typedef {{ groups: { group: string, keys: { key: string, text: string }[] }[] }} Unused #626's wording/unused.json */
/**
 * `id` is the answer's address: the dotted key, `fixed:<id>`, `mono:<component>` or `unused:<group>`. `group` is the top-level group of
 * the key; `mono` and `fest` for the other kinds of text, the group itself for 'unused'. `text` is the message today or the fixed text,
 * null for mono and unused. `keys` is for 'unused' only. `what` is the label of a mono element, else null.
 * @typedef {{
 *   id: string,
 *   kind: 'message' | 'mono' | 'fixed' | 'unused',
 *   section: 'walk' | 'unpictured' | 'legal' | 'unused',
 *   group: string,
 *   text: string | null,
 *   what: string | null,
 *   keys: { key: string, text: string }[],
 *   sightings: Sighting[],
 *   marks: Mark[],
 *   where: { file: string, line: number | null } | null,
 * }} Step
 */
/** @typedef {'mono' | 'sr-only' | 'new' | 'open' | 'alternatives'} Filter */
/** @typedef {import('./answers.mjs').AnswersFile} AnswersFile */

const MARKS = /** @type {const} */ (['mono', 'sr-only'])
const ACCOUNTS = ['host', 'member', 'admin', 'member2']
const VIAS = ['text', 'aria-label', 'title', 'alt', 'placeholder', 'server']
const MONO_PREFIX = 'mono:'
const FIXED_PREFIX = 'fixed:'

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param {unknown} value */
const isNumber = value => typeof value === 'number' && Number.isFinite(value)

/**
 * What is wrong with a recording, as sentences naming where; empty is valid. Never throws, so the walk (#629) can check what it writes.
 * @param {unknown} value
 * @returns {string[]}
 */
export function checkRecording(value) {
  /** @type {string[]} */
  const problems = []
  if (!isRecord(value)) return ['Die Aufnahme ist kein Objekt']

  /**
   * @param {string} where
   * @param {Record<string, unknown>} object
   * @param {string} field
   */
  const needText = (where, object, field) => {
    if (typeof object[field] !== 'string') problems.push(`${where}${field}: kein Text`)
  }
  /**
   * @param {string} where
   * @param {unknown} sightings
   */
  const checkSightings = (where, sightings) => {
    if (!Array.isArray(sightings)) {
      problems.push(`${where}sightings: keine Liste`)
      return
    }
    sightings.forEach((sighting, i) => {
      const at = `${where}sightings[${i}].`
      if (!isRecord(sighting)) {
        problems.push(`${at.slice(0, -1)}: kein Objekt`)
        return
      }
      if (!Number.isInteger(sighting.seq) || /** @type {number} */ (sighting.seq) < 1) problems.push(`${at}seq: keine Zahl ab 1`)
      needText(at, sighting, 'state')
      if (sighting.account !== null && !ACCOUNTS.includes(/** @type {string} */ (sighting.account))) problems.push(`${at}account: nicht ${ACCOUNTS.join(', ')} oder null`)
      if (!isNumber(sighting.width)) problems.push(`${at}width: keine Zahl`)
      const box = sighting.box
      if (!isRecord(box) || !['x', 'y', 'width', 'height'].every(side => isNumber(box[side]))) problems.push(`${at}box: braucht x, y, width und height als Zahlen`)
      needText(at, sighting, 'picture')
      needText(at, sighting, 'rendered')
      if (!VIAS.includes(/** @type {string} */ (sighting.via))) problems.push(`${at}via: nicht ${VIAS.join(', ')}`)
      if (!Array.isArray(sighting.marks) || !sighting.marks.every(mark => MARKS.includes(mark))) problems.push(`${at}marks: nur ${MARKS.join(' und ')} erlaubt`)
    })
  }
  /**
   * @param {string} field
   * @param {(item: Record<string, unknown>, where: string) => void} checkItem
   */
  const checkList = (field, checkItem) => {
    const list = value[field]
    if (!Array.isArray(list)) {
      problems.push(`${field}: keine Liste`)
      return
    }
    list.forEach((item, i) => {
      if (isRecord(item)) checkItem(item, `${field}[${i}].`)
      else problems.push(`${field}[${i}]: kein Objekt`)
    })
  }

  if (value.version !== 1) problems.push('version: muss 1 sein')
  needText('', value, 'recordedAt')
  needText('', value, 'commit')
  checkList('messages', (item, where) => {
    needText(where, item, 'key')
    checkSightings(where, item.sightings)
  })
  checkList('monoElements', (item, where) => {
    needText(where, item, 'component')
    needText(where, item, 'what')
    checkSightings(where, item.sightings)
  })
  checkList('fixed', (item, where) => {
    needText(where, item, 'id')
    needText(where, item, 'text')
    needText(where, item, 'file')
    if (item.line !== null && !isNumber(item.line)) problems.push(`${where}line: keine Zahl oder null`)
    checkSightings(where, item.sightings)
  })
  if (!isRecord(value.locations)) problems.push('locations: kein Objekt')
  else {
    for (const [key, location] of Object.entries(value.locations)) {
      if (!isRecord(location) || typeof location.file !== 'string' || (location.line !== null && !isNumber(location.line))) {
        problems.push(`locations.${key}: braucht file (Text) und line (Zahl oder null)`)
      }
    }
  }
  return problems
}

/** @param {string} key */
const groupOf = key => key.split('.')[0] ?? key

/**
 * @param {Sighting[]} sightings
 * @returns {Sighting[]}
 */
const bySeq = sightings => [...sightings].sort((a, b) => a.seq - b.seq)

/**
 * @param {Sighting[]} sightings
 * @returns {Mark[]}
 */
const marksOf = sightings => MARKS.filter(mark => sightings.some(sighting => sighting.marks.includes(mark)))

/**
 * Entries of one id merged into one, the sightings together; the ids that came twice are returned too.
 * @template {{ sightings: Sighting[] }} T
 * @param {T[]} entries
 * @param {(entry: T) => string} idOf
 * @returns {{ merged: Map<string, T>, doubled: string[] }}
 */
function mergeById(entries, idOf) {
  /** @type {Map<string, T>} */
  const merged = new Map()
  /** @type {string[]} */
  const doubled = []
  for (const entry of entries) {
    const id = idOf(entry)
    const have = merged.get(id)
    if (have) {
      doubled.push(id)
      have.sightings = [...have.sightings, ...entry.sightings]
    }
    else merged.set(id, { ...entry, sightings: [...entry.sightings] })
  }
  return { merged, doubled }
}

/**
 * The steps of the review, in order (spec § The review page): the walk by each text's first sighting, then the texts without a picture
 * by group and the fixed ones by id, then the legal texts, then one step per group of unused texts. A problem is a sentence, never thrown.
 * @param {{ messages: { key: string, text: string }[], recording: Recording | null, unused: Unused | null }} input
 *   `messages` is `flattenMessages(de)`; `unused` is #626's unused.json, keyed like `flattenMessages` (`wheel.placeholders.0`)
 * @returns {{ steps: Step[], problems: string[] }}
 */
export function stepsOf({ messages, recording, unused }) {
  /** @type {string[]} */
  const problems = []
  const textOf = new Map(messages.map(({ key, text }) => [key, text]))
  const isLegal = (/** @type {string} */ key) => key.startsWith('legal.')
  const locations = recording?.locations ?? {}

  /** @type {Map<string, Sighting[]>} */
  const seen = new Map()
  const recordedMessages = (recording?.messages ?? []).filter((entry) => {
    if (textOf.has(entry.key)) return true
    problems.push(`Aufgenommener Schlüssel ${entry.key} fehlt in de.json: sein Schritt entfällt`)
    return false
  })
  const messageEntries = mergeById(recordedMessages, entry => entry.key)
  for (const key of messageEntries.doubled) problems.push(`Schlüssel ${key} ist zweimal aufgenommen: die Sichtungen sind zusammengelegt`)
  for (const [key, entry] of messageEntries.merged) seen.set(key, bySeq(entry.sightings))
  const pictured = (/** @type {string} */ key) => (seen.get(key)?.length ?? 0) > 0

  /** @type {{ group: string, keys: { key: string, text: string }[] }[]} */
  const unusedGroups = []
  const unusedKeys = new Set()
  for (const { group, keys } of unused?.groups ?? []) {
    /** @type {{ key: string, text: string }[]} */
    const kept = []
    for (const { key } of keys) {
      const text = textOf.get(key)
      if (text === undefined) problems.push(`Ungenutzter Schlüssel ${key} fehlt in de.json: ignoriert`)
      else if (pictured(key)) problems.push(`Schlüssel ${key} ist aufgenommen und als ungenutzt gelistet: er bleibt ein Bildschritt`)
      else kept.push({ key, text })
    }
    for (const { key } of kept) unusedKeys.add(key)
    if (kept.length > 0) unusedGroups.push({ group, keys: kept })
  }

  /**
   * @param {string} key
   * @param {'walk' | 'unpictured' | 'legal'} section
   * @returns {Step}
   */
  const messageStep = (key, section) => {
    const sightings = seen.get(key) ?? []
    return {
      id: key,
      kind: 'message',
      section,
      group: groupOf(key),
      text: textOf.get(key) ?? null,
      what: null,
      keys: [],
      sightings,
      marks: marksOf(sightings),
      where: Object.hasOwn(locations, key) ? (locations[key] ?? null) : null,
    }
  }

  const monoEntries = mergeById(recording?.monoElements ?? [], entry => entry.component)
  for (const component of monoEntries.doubled) problems.push(`Mono-Element ${component} ist zweimal aufgenommen: die Sichtungen sind zusammengelegt`)
  const fixedEntries = mergeById(recording?.fixed ?? [], entry => entry.id)
  for (const id of fixedEntries.doubled) problems.push(`Fester Text ${id} ist zweimal aufgenommen: die Sichtungen sind zusammengelegt`)

  /** @param {{ component: string, what: string, sightings: Sighting[] }} entry @returns {Step} */
  const monoStep = (entry) => {
    const sightings = bySeq(entry.sightings)
    return {
      id: `${MONO_PREFIX}${entry.component}`,
      kind: 'mono',
      section: sightings.length > 0 ? 'walk' : 'unpictured',
      group: 'mono',
      text: null,
      what: entry.what,
      keys: [],
      sightings,
      // A mono element is set in the mono font by definition, even when no sighting could measure it.
      marks: MARKS.filter(mark => mark === 'mono' || marksOf(sightings).includes(mark)),
      where: null,
    }
  }
  /** @param {{ id: string, text: string, file: string, line: number | null, sightings: Sighting[] }} entry @returns {Step} */
  const fixedStep = (entry) => {
    const sightings = bySeq(entry.sightings)
    return {
      id: `${FIXED_PREFIX}${entry.id}`,
      kind: 'fixed',
      section: sightings.length > 0 ? 'walk' : 'unpictured',
      group: 'fest',
      text: entry.text,
      what: null,
      keys: [],
      sightings,
      marks: marksOf(sightings),
      where: { file: entry.file, line: entry.line },
    }
  }

  // The walk: a stable sort by the first sighting, so a tie keeps de.json order (messages first, then mono elements, then fixed texts).
  const walk = [
    ...messages.filter(({ key }) => !isLegal(key) && pictured(key)).map(({ key }) => messageStep(key, 'walk')),
    ...[...monoEntries.merged.values()].map(monoStep).filter(step => step.section === 'walk'),
    ...[...fixedEntries.merged.values()].map(fixedStep).filter(step => step.section === 'walk'),
  ].sort((a, b) => (a.sightings[0]?.seq ?? 0) - (b.sightings[0]?.seq ?? 0))

  const unpictured = [
    ...messages.filter(({ key }) => !isLegal(key) && !pictured(key) && !unusedKeys.has(key)).map(({ key }) => messageStep(key, 'unpictured')),
    ...[...fixedEntries.merged.values()].map(fixedStep).filter(step => step.section === 'unpictured').sort((a, b) => Number(a.id > b.id) - Number(a.id < b.id)),
    ...[...monoEntries.merged.values()].map(monoStep).filter(step => step.section === 'unpictured'),
  ]

  const legal = messages.filter(({ key }) => isLegal(key) && !unusedKeys.has(key)).map(({ key }) => messageStep(key, 'legal'))

  /** @type {Step[]} */
  const unusedSteps = unusedGroups.map(({ group, keys }) => ({
    id: `unused:${group}`,
    kind: 'unused',
    section: 'unused',
    group,
    text: null,
    what: null,
    keys,
    sightings: [],
    marks: [],
    where: null,
  }))

  return { steps: [...walk, ...unpictured, ...legal, ...unusedSteps], problems }
}

/**
 * The sighting whose picture the page shows: the first one, or, while the mono or the screen-reader filter is on, the first that
 * carries that mark (a step's marks are a union, its first sighting need not be the mono one). Null without sightings.
 * @param {Step} step
 * @param {Filter[]} filters
 * @returns {Sighting | null}
 */
export function sightingToShow(step, filters) {
  const wanted = MARKS.find(mark => filters.includes(mark))
  if (wanted) {
    const marked = step.sightings.find(sighting => sighting.marks.includes(wanted))
    if (marked) return marked
  }
  return step.sightings[0] ?? null
}

/**
 * The answer's entry of a text step, if the file has one.
 * @param {Step} step
 * @param {AnswersFile} file
 */
function textEntry(step, file) {
  if (step.kind === 'message') return Object.hasOwn(file.texts, step.id) ? file.texts[step.id] : undefined
  if (step.kind === 'fixed') {
    const id = step.id.slice(FIXED_PREFIX.length)
    return Object.hasOwn(file.fixed, id) ? file.fixed[id] : undefined
  }
  return undefined
}

/**
 * Whether a text is new since the last sitting (spec § The answers file): the baseline, the newest answers file other than the one being
 * filled (null when there is none, then every text is new), does not hold its key, or its text today equals neither the entry's text as
 * swept nor its replacement. An entry that is only a comment still counts as held. Mono elements and unused groups are not texts.
 * @param {Step} step
 * @param {AnswersFile | null} baseline
 */
export function isNewSince(step, baseline) {
  if (step.kind !== 'message' && step.kind !== 'fixed') return false
  if (!baseline) return true
  const entry = textEntry(step, baseline)
  if (!entry) return true
  return step.text !== entry.text && step.text !== entry.replacement
}

/**
 * A text is answered when its answer is not null (a comment alone is not); a mono element when its entry exists; an unused group when its entry exists.
 * @param {Step} step
 * @param {AnswersFile} answers
 */
export function isAnswered(step, answers) {
  if (step.kind === 'mono') return Object.hasOwn(answers.mono, step.id.slice(MONO_PREFIX.length))
  if (step.kind === 'unused') return Object.hasOwn(answers.unused, step.group)
  return (textEntry(step, answers)?.answer ?? null) !== null
}

/**
 * The steps that pass every filter (AND, an empty list passes all), order kept.
 * @param {Step[]} steps
 * @param {Filter[]} filters
 * @param {{ answers: AnswersFile, baseline: AnswersFile | null }} context
 * @returns {Step[]}
 */
export function filterSteps(steps, filters, { answers, baseline }) {
  /** @type {Record<Filter, (step: Step) => boolean>} */
  const tests = {
    'mono': step => step.marks.includes('mono'),
    'sr-only': step => step.marks.includes('sr-only'),
    'new': step => isNewSince(step, baseline),
    'open': step => !isAnswered(step, answers),
    'alternatives': step => textEntry(step, answers)?.answer === 'alternativen',
  }
  return steps.filter(step => filters.every(filter => tests[filter](step)))
}

/**
 * How far the file is: resume opens at `firstOpen`, an index into `steps` (-1 when none is open).
 * @param {Step[]} steps
 * @param {AnswersFile} answers
 * @returns {{ total: number, done: number, left: number, firstOpen: number }}
 */
export function progressOf(steps, answers) {
  const done = steps.filter(step => isAnswered(step, answers)).length
  return { total: steps.length, done, left: steps.length - done, firstOpen: steps.findIndex(step => !isAnswered(step, answers)) }
}
