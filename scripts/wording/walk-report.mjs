// The wording walk's report (#629): counts, keys, state names and file paths only. Never a `rendered` text, a Display name or an Event name,
// because the report is printed, written into results.log and may be posted. Pure: the walk hands in what it counted.

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
  lines.push('', `The mono font is ${input.monoFamily ? `"${input.monoFamily}"` : 'not read'}. The eleven mono uses:`)
  for (const use of input.monoUses) lines.push(`  ${use.site}: ${use.seenIn ? `seen in ${use.seenIn}` : `not seen${use.expectedMissing ? ` (expected: ${use.expectedMissing})` : ''}`}`)
  lines.push(`Mono components without a label in MONO_WHAT: ${input.unlabelled.length ? input.unlabelled.join(', ') : 'none'}`)
  lines.push(`Fixed texts: ${input.fixed.withPicture} with a picture, ${input.fixed.without} without`)
  lines.push(`Keys read but missing from de.json: ${input.missing.length ? input.missing.join(', ') : 'none'}`)
  lines.push(`Untagged text nodes seen (summed over the readings): ${input.untagged}`)
  for (const note of input.notes) lines.push(note)
  return lines
}
