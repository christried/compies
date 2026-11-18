// The wording walk's report (#629): counts, keys, state names and file paths only. Never a `rendered` text, a Display name or an Event name,
// because the report is printed, written into results.log and may be posted. Pure: the walk hands in what it counted.

import { isNewSince } from './review-model.mjs'

/** @typedef {import('./recording.mjs').Reading} Reading */
/**
 * One use of the mono font in the app code: `component` is its repo path; it is seen when an untagged mono item of the component was recorded
 * (`entry`, matched on the element's local name when `element` or `notElement` is set), or a message of `keys` carries the mono mark.
 * @typedef {{ site: string, component: string, entry?: boolean, element?: string, notElement?: string, keys?: string[], expectedMissing?: string }} MonoUse
 */

/**
 * The first state each mono use was seen in, or null.
 * @param {MonoUse[]} uses
 * @param {Reading[]} readings
 * @returns {{ site: string, seenIn: string | null, expectedMissing?: string }[]}
 */
export function monoUseSightings(uses, readings) {
  return uses.map((use) => {
    const seen = readings.find(reading => reading.items.some((item) => {
      if (use.entry) {
        return item.key === null && item.fixedId === undefined && item.component === use.component
          && (use.element === undefined || item.element === use.element) && (use.notElement === undefined || item.element !== use.notElement)
      }
      return item.key !== null && (use.keys ?? []).includes(item.key) && item.marks.includes('mono') && item.component === use.component
    }))
    return { site: use.site, seenIn: seen ? seen.state : null, ...(use.expectedMissing ? { expectedMissing: use.expectedMissing } : {}) }
  })
}

/** Why the walk could not picture a text it read: what `pictureScript` skipped it for. */
const SKIPPED = { notPainted: 'screen-reader only, no painted box', covered: 'covered by a layer each time' }

/**
 * Every text that is new since the baseline and has no picture, with the reason (#810): the check that a walk's states reach the new texts.
 * A `message` or `fixed` step of the section `unpictured` that `isNewSince` calls new (a `legal` one is left out: it is no walk text), and
 * each key of an unused group (it has no step of its own; its text is in the group's step) that is new. The reason is what the walk
 * knows: it read the text and could not picture it (`skipped`), no code refers to it (an unused group), else no state reached it, with
 * the `file:line` of its first reference when the recording has one. Keys and file paths only, never a rendered text.
 * @param {{
 *   steps: import('./review-model.mjs').Step[],
 *   baseline: import('./answers.mjs').AnswersFile | null,
 *   skipped: Map<string, 'notPainted' | 'covered'>,
 * }} input
 * @returns {{ id: string, reason: string }[]}
 */
export function withoutPicture({ steps, baseline, skipped }) {
  /** @type {{ id: string, reason: string }[]} */
  const found = []
  for (const step of steps) {
    if (step.kind === 'unused') {
      for (const { key, text } of step.keys) {
        if (!key.startsWith('legal.') && isNewSince({ id: key, kind: 'message', text }, baseline)) found.push({ id: key, reason: 'unused: no code refers to it' })
      }
      continue
    }
    if (step.section !== 'unpictured' || !isNewSince(step, baseline)) continue
    const why = skipped.get(step.id)
    if (why) found.push({ id: step.id, reason: SKIPPED[why] })
    else if (step.where) found.push({ id: step.id, reason: `not reached by any state, referenced at ${step.where.file}${step.where.line === null ? '' : `:${step.where.line}`}` })
    else found.push({ id: step.id, reason: 'not reached by any state, no reference found' })
  }
  return found
}

/** @param {number} bytes */
const megabytes = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/**
 * The report's lines.
 * @param {{
 *   run: string, commit: string, seconds: number, partial: boolean,
 *   statesRead: number, unreached: string[], readings: number,
 *   sightings: number, dropped: number, covered: number, notPainted: number,
 *   pictures: { count: number, bytes: number, folder: string },
 *   steps: { id: string, kind: string, section: string, group: string }[], stepProblems: string[], unusedNote: string | null,
 *   monoUses: ReturnType<typeof monoUseSightings>, unlabelled: string[],
 *   fixed: { withPicture: number, without: number },
 *   unpictured: ReturnType<typeof withoutPicture>,
 *   missing: string[], untagged: number, monoFamily: string | null,
 *   notes: string[],
 * }} input
 * @returns {string[]}
 */
export function reportOf(input) {
  const lines = [
    `Wording walk ${input.run} on ${input.commit}${input.partial ? ' (partial recording)' : ''}, ${input.seconds} s`,
    `states read ${input.statesRead}, not reached ${input.unreached.length}${input.unreached.length ? `: ${input.unreached.join(', ')}` : ''}`,
    `readings ${input.readings}, sightings kept ${input.sightings}, dropped over the cap ${input.dropped}, covered ${input.covered}, not painted ${input.notPainted}`,
    `pictures ${input.pictures.count}, ${megabytes(input.pictures.bytes)} in ${input.pictures.folder}`,
    '',
    'Steps of the review, per group (with a picture / without):',
  ]
  /** @type {Map<string, { withPicture: number, without: number }>} */
  const groups = new Map()
  let unusedSteps = 0
  for (const step of input.steps) {
    if (step.kind === 'unused') {
      unusedSteps++
      continue
    }
    const entry = groups.get(step.group) ?? { withPicture: 0, without: 0 }
    if (step.section === 'walk') entry.withPicture++
    else entry.without++
    groups.set(step.group, entry)
  }
  for (const [group, entry] of groups) lines.push(`  ${group.padEnd(16)}  with picture ${entry.withPicture}  without ${entry.without}`)
  const withPicture = [...groups.values()].reduce((sum, entry) => sum + entry.withPicture, 0)
  const without = [...groups.values()].reduce((sum, entry) => sum + entry.without, 0)
  lines.push(`  total             with picture ${withPicture}  without ${without}  (and ${unusedSteps} steps of unused groups)`)
  if (input.unusedNote) lines.push(`  ${input.unusedNote}`)
  for (const problem of input.stepProblems) lines.push(`  problem: ${problem}`)
  lines.push('', `New texts without a picture (${input.unpictured.length})${input.unpictured.length ? ':' : ': none'}`)
  for (const entry of input.unpictured) lines.push(`  ${entry.id}  ${entry.reason}`)
  lines.push('', `The mono font is ${input.monoFamily ? `"${input.monoFamily}"` : 'not read'}. The ${input.monoUses.length} mono uses:`)
  for (const use of input.monoUses) lines.push(`  ${use.site}: ${use.seenIn ? `seen in ${use.seenIn}` : `not seen${use.expectedMissing ? ` (expected: ${use.expectedMissing})` : ''}`}`)
  lines.push(`Mono components without a label in MONO_WHAT: ${input.unlabelled.length ? input.unlabelled.join(', ') : 'none'}`)
  lines.push(`Fixed texts: ${input.fixed.withPicture} with a picture, ${input.fixed.without} without`)
  lines.push(`Keys read but missing from de.json: ${input.missing.length ? input.missing.join(', ') : 'none'}`)
  lines.push(`Untagged text nodes seen (summed over the readings): ${input.untagged}`)
  for (const note of input.notes) lines.push(note)
  return lines
}

/**
 * Whether the walk's base URL is the local dev server: http, the loopback name and a port, nothing after it. The walk makes a Host and
 * Events and signs in through /api/dev/sign-in, so it never runs against staging or production (spec #620: Hell only, the local database).
 * @param {string} base
 */
export function isLocalBase(base) {
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(base)
}
