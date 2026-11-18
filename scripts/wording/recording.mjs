// What the wording walk makes of what it read (#629, spec #620 § The walk): the items of each reading in, #628's `Recording` out. Pure and without
// Chrome, so it is unit-tested; scripts/wording/walk.mjs does what needs a browser (the page scripts, the pictures) and calls these.
import { stepId } from './answers.mjs'

/** @typedef {import('./review-model.mjs').Sighting} Sighting */
/** @typedef {import('./review-model.mjs').Recording} Recording */
/** @typedef {import('./review-model.mjs').Account} Account */
/** @typedef {{ x: number, y: number, width: number, height: number }} Box */
/**
 * One text the walk saw in one reading, after its picture was taken. `key` is null for what has no message: an untagged mono element
 * (`component`, `element`) or a fixed text (`fixedId`). `component` is the repo path of the .vue file the element was made by, when known.
 * @typedef {{ key: string | null, via: import('./review-model.mjs').Via, rendered: string, box: Box, picture: string, marks: import('./review-model.mjs').Mark[], component: string | null, element: string, fixedId?: string }} Item
 */
/** @typedef {{ state: string, account: Account, width: number, items: Item[] }} Reading */

/** At most this many sightings per key (and per mono component) over a walk: the first six in walk order (#629 O3). */
export const SIGHTINGS_PER_KEY = 6

/**
 * What an item counts under for the cap of `SIGHTINGS_PER_KEY`: its key, `fixed:<id>` or `mono:<component>`. A message's mono use counts per component
 * and its screen-reader use apart from its plain ones, so the first six plain sightings of a key (`common.counter` in a form) do not hide the mono
 * use in another component, which the review's mono filter and B3 look for.
 * @param {Item} item
 */
export function budgetId(item) {
  const id = idOf(item)
  if (item.key === null) return id
  return `${id}${item.marks.includes('mono') ? `|mono|${item.component}` : ''}${item.marks.includes('sr-only') ? '|sr-only' : ''}`
}

/**
 * What an item is called in a reading: its key, `fixed:<id>` or `mono:<component>`.
 * @param {Item} item
 */
function idOf(item) {
  if (item.fixedId !== undefined) return stepId('fixed', item.fixedId)
  if (item.key === null) return stepId('mono', item.component ?? item.element)
  return item.key
}

/**
 * One item per `(key, via, marks)` in a reading, the first in document order (Home shows `mvp.home.hostYou` 278 times); one mono item per
 * `(component, element)`.
 * @template {{ key: string | null, via: string, marks: string[], component?: string | null, element?: string, fixedId?: string }} T
 * @param {T[]} items
 * @returns {T[]}
 */
export function dedupeItems(items) {
  const seen = new Set()
  return items.filter((item) => {
    const same = item.key === null && item.fixedId === undefined
      ? `${stepId('mono', String(item.component))}|${item.element}`
      : `${idOf(/** @type {Item} */ (item))}|${item.via}|${item.marks.join(',')}`
    if (seen.has(same)) return false
    seen.add(same)
    return true
  })
}

/**
 * The items of a reading that deserve a picture: deduplicated, and without a key de.json does not have (the page was built from other
 * copy, or a key is built wrongly): those are left out and named, so the report counts them.
 * @template {{ key: string | null, via: string, marks: string[], component?: string | null, element?: string, fixedId?: string }} T
 * @param {T[]} items
 * @param {Set<string>} messageKeys
 * @returns {{ kept: T[], missing: string[] }}
 */
export function selectItems(items, messageKeys) {
  const missing = new Set()
  const kept = dedupeItems(items).filter((item) => {
    if (item.key === null || messageKeys.has(item.key)) return true
    missing.add(item.key)
    return false
  })
  return { kept, missing: [...missing] }
}

/**
 * How many sightings of each key the walk keeps. `full(id)` asks, `use(id)` takes one, `drop(id)` counts a sighting that was left out for it.
 * `snapshot` and `restore` take a state's uses back when the state is read again.
 * @param {number} [limit]
 */
export function createBudget(limit = SIGHTINGS_PER_KEY) {
  /** @type {Map<string, number>} */
  let used = new Map()
  let dropped = 0
  return {
    full: (/** @type {string} */ id) => (used.get(id) ?? 0) >= limit,
    use(/** @type {string} */ id) { used.set(id, (used.get(id) ?? 0) + 1) },
    drop() { dropped++ },
    get dropped() { return dropped },
    snapshot: () => ({ used: new Map(used), dropped }),
    restore(/** @type {{ used: Map<string, number>, dropped: number }} */ snapshot) {
      used = new Map(snapshot.used)
      dropped = snapshot.dropped
    },
  }
}

/**
 * The keys of the Hidden wheel's placeholders a spin shows (#810). They are drawn by the server (`WHEEL_PLACEHOLDERS`, `wheel.placeholders.<i>`) and reach
 * the page as plain strings in the Member's `wheel.spin.labels`, so no key tag carries them: a label equal to `placeholders[i]` gives `wheel.placeholders.<i>`,
 * once, in label order. The „???“ of a wheel at rest, a game's real name and any other string give nothing.
 * @param {string[]} labels the wheel's labels as the Member reads them
 * @param {string[]} placeholders `de.wheel.placeholders`
 * @returns {string[]}
 */
export function wheelPlaceholderKeys(labels, placeholders) {
  const keys = labels.flatMap((label) => {
    const index = placeholders.indexOf(label)
    return index === -1 ? [] : [`wheel.placeholders.${index}`]
  })
  return [...new Set(keys)]
}

/** @param {string} component */
const fileName = component => component.split('/').at(-1) ?? component

/**
 * The recording of the walk. `readings` are the readings in walk order, each with the items whose pictures were taken (in the order they were taken:
 * `seq` is one counter over them). `fixed` is the fixed table (`fixedTexts` of where.mjs): every entry is listed, with sightings when an item
 * carries its `fixedId`. `mono` maps the components that always get an entry to their label; an untagged mono item of another component gets one
 * labelled by its file name. `locations` is for the keys the walk never saw.
 * @param {{
 *   readings: Reading[],
 *   fixed: { id: string, text: string, file: string, line: number | null }[],
 *   mono: Record<string, string>,
 *   locations: Recording['locations'],
 *   commit: string,
 *   recordedAt: string,
 * }} input
 * @returns {Recording}
 */
export function assemble({ readings, fixed, mono, locations, commit, recordedAt }) {
  /** @type {Map<string, Sighting[]>} */
  const messages = new Map()
  /** @type {Map<string, { what: string, sightings: Sighting[] }>} */
  const monoEntries = new Map(Object.entries(mono).map(([component, what]) => [component, { what, sightings: [] }]))
  /** @type {Map<string, { id: string, text: string, file: string, line: number | null, sightings: Sighting[] }>} */
  const fixedEntries = new Map(fixed.map(entry => [entry.id, { ...entry, sightings: [] }]))

  let seq = 0
  for (const reading of readings) {
    for (const item of reading.items) {
      /** @type {Sighting} */
      const sighting = {
        seq: ++seq,
        state: reading.state,
        account: reading.account,
        width: reading.width,
        box: item.box,
        picture: item.picture,
        rendered: item.rendered,
        via: item.via,
        marks: item.marks,
      }
      if (item.fixedId !== undefined) {
        const entry = fixedEntries.get(item.fixedId)
        if (!entry) throw new Error(`A sighting names the fixed text ${item.fixedId}, which the table does not have`)
        entry.sightings.push(sighting)
      }
      else if (item.key === null) {
        const component = item.component ?? `unknown/${item.element}`
        const entry = monoEntries.get(component) ?? { what: `Mono-Element in ${fileName(component)}`, sightings: [] }
        entry.sightings.push(sighting)
        monoEntries.set(component, entry)
      }
      else messages.set(item.key, [...(messages.get(item.key) ?? []), sighting])
    }
  }

  return {
    version: 1,
    recordedAt,
    commit,
    messages: [...messages].map(([key, sightings]) => ({ key, sightings })),
    monoElements: [...monoEntries].map(([component, entry]) => ({ component, what: entry.what, sightings: entry.sightings })),
    fixed: [...fixedEntries.values()],
    locations,
  }
}
