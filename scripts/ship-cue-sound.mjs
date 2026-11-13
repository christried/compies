// Ships a candidate sound as the sound of a cue (#536): copies the candidate's file byte for byte to public/sounds/cues/<cue id>.wav and writes
// that cue's entry in public/sounds/cues/credits.json from the candidate's manifest entry (candidate, source, author, licence: copied, never
// typed). The listening session of 0.13.3 (#535) picks the candidates; the shipped files stay under these names (app/utils/sound-cues.ts).
//
//   node scripts/ship-cue-sound.mjs wheel-windup=holz-ratsche wheel-tick=plastik-klapper ...     <cue id>=<candidate name>, any number of pairs
//
// An operator's own CC0 sound is first added to sound-candidates/ and its manifest as a candidate, then shipped by this script. Only the
// named cues are touched; credits.json is read when it exists and written back in the order of CUE_IDS, so a second run changes nothing.
// Nothing is written when any pair is refused: an unknown cue id, a candidate the manifest does not list, a file that is not a .wav (the
// shipped file is a byte copy, so another format has to be converted first), a licence other than CC0 or generated, a file that is missing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const CANDIDATES = resolve(ROOT, 'sound-candidates')
const SHIPPED = resolve(ROOT, 'public/sounds/cues')
const CREDITS = resolve(SHIPPED, 'credits.json')

const CUE_IDS = [...readFileSync(resolve(ROOT, 'app/utils/sound-cues.ts'), 'utf8').match(/export const CUE_IDS = \[([^\]]*)\]/)[1].matchAll(/'([a-z-]+)'/g)].map(m => m[1])

const pairs = process.argv.slice(2)
if (pairs.length === 0) {
  console.error('usage: node scripts/ship-cue-sound.mjs <cue id>=<candidate name> ...')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(resolve(CANDIDATES, 'manifest.json'), 'utf8'))
const refused = []
const jobs = []
for (const pair of pairs) {
  const at = pair.indexOf('=')
  const id = pair.slice(0, at)
  const name = pair.slice(at + 1)
  const entry = at === -1 ? undefined : manifest.cues?.[id]?.find(candidate => candidate.name === name)
  if (at === -1) refused.push(`${pair}: expected <cue id>=<candidate name>`)
  else if (!CUE_IDS.includes(id)) refused.push(`${pair}: ${id} is not a cue id`)
  else if (!entry) refused.push(`${pair}: the manifest lists no candidate ${name} for ${id}`)
  else if (!entry.file.toLowerCase().endsWith('.wav')) refused.push(`${pair}: ${entry.file} is not a .wav (convert it first, the shipped file is a byte copy)`)
  else if (!['CC0', 'generated'].includes(entry.licence)) refused.push(`${pair}: licence ${entry.licence} is neither CC0 nor generated`)
  else if (!existsSync(resolve(CANDIDATES, entry.file))) refused.push(`${pair}: ${entry.file} is not on disk`)
  else jobs.push({ id, entry })
}
if (refused.length > 0) {
  console.error(`nothing written, ${refused.length} pair(s) refused:\n${refused.map(line => `  ${line}`).join('\n')}`)
  process.exit(1)
}

const credits = existsSync(CREDITS) ? JSON.parse(readFileSync(CREDITS, 'utf8')) : { cues: {} }
for (const { id, entry } of jobs) {
  // Read and write, not copyFileSync: a Windows copy keeps the source's timestamps, and git then takes a changed file for unchanged.
  writeFileSync(resolve(SHIPPED, `${id}.wav`), readFileSync(resolve(CANDIDATES, entry.file)))
  credits.cues[id] = { candidate: entry.name, source: entry.source, author: entry.author ?? null, licence: entry.licence }
  console.log(`${id.padEnd(16)} <- ${entry.name}`)
}
const ordered = { cues: Object.fromEntries(CUE_IDS.filter(id => credits.cues[id]).map(id => [id, credits.cues[id]])) }
writeFileSync(CREDITS, `${JSON.stringify(ordered, null, 2)}\n`)
