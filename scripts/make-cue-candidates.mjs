// Writes the sound candidates for the listening session of 0.13.3 (#535): three to four clearly different ideas for each of the
// cue ids of app/utils/cue-ids.ts, synthesised here (no downloaded file, no dependency, nothing that needs a credit), and the manifest the
// listening page (#534) reads. The cue world is compibert-sound.md: cartoony, dry and short, tabletop toys and a cheap arcade, never casino
// or orchestral. Nothing here has been heard while writing it: every recipe reasons from the physics of the sound it names (attack, decay,
// spectrum, pitch movement), and the operator's ear decides in the session.
//
//   node scripts/make-cue-candidates.mjs     writes sound-candidates/<cue id>/<name>.wav and sound-candidates/manifest.json, then checks them
//
// Four families of ideas, so a cue's candidates differ in kind and not in settings:
//   holz-/spielzeug-  tabletop toys: modal synthesis (struck bars and blocks are a few damped sines at inharmonic ratios) plus short noise
//                     bursts for the strike, wooden blocks, tiles, glockenspiel bars, a woodblock ratchet;
//   chip-             a cheap arcade: square and pulse waves, triangle, a noise channel, stepped arpeggios, pitch slides, bit crushing;
//   filz-/papier-     soft and dry: filtered noise (paper, felt, a zipper), low rounded thumps, no sharp edge;
//   and one more idea per cue where the cue invites it (a roller shutter, a cork, a toy tom, a seal ring, a gong ...).
//
// Format as the shipped cue files have (app/utils/sound-cues.ts): 16-bit PCM, mono, 44.1 kHz WAV, peak at
// -1 dBFS (the cue's relative volume is the player's gain, CUE_VOLUME, not the file's), a short fade in and out, no DC offset, no silence at
// the start (a cue is scheduled to the millisecond: the transient sits in the first 5 ms, except where a candidate is a swell by nature, which
// says so with `swell`). Length: at most the doc's length for the cue. Deterministic: seeded noise per candidate, no Math.random, so a rerun
// gives the same bytes.
//
// After writing, the script reads every file back and fails loudly when one breaks the format, the length, the level, the onset, the DC rule,
// or when a manifest entry would fail the rules of `candidatesOf` in app/dev/listening-model.ts (#534).
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PEAK, RATE, TAU, clamp, fnv, frames, seeded } from './cue-kit.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(ROOT, 'sound-candidates')

// ---- the contract: cue ids and lengths come from the repo, so a drift fails here ------------------------------------------------------

// Both are leaf files Node can import as they are (type stripping, as bake-compibert.mjs does): the ids (#828) and the lengths (#740). Their
// types keep the tables in step with the ids (typecheck), and test/unit/cue-lengths.test.ts holds the lengths against compibert-sound.md.
const { CUE_IDS } = await import('../app/utils/cue-ids.ts')
const { CUE_LENGTHS } = await import('../app/utils/cue-lengths.ts')
/** The longest a cue's file may be, per cue id, in ms. */
const MAX_MS = {}
for (const id of CUE_IDS) MAX_MS[id] = CUE_LENGTHS[id].ms

// ---- the recipes: one file per moment in scripts/cue-recipes/, found by listing the folder, so a new moment adds a file and no line here ----

const RECIPES = {}
/** The recipe file each cue's recipes come from, for a candidate's source (#828). */
const RECIPE_FILE = {}
const recipeFolder = resolve(ROOT, 'scripts/cue-recipes')
for (const file of readdirSync(recipeFolder).filter(name => name.endsWith('.mjs')).sort()) {
  const recipes = (await import(pathToFileURL(resolve(recipeFolder, file)).href)).default
  for (const id of Object.keys(recipes)) {
    if (RECIPES[id]) throw new Error(`${id}: recipes in two files (${file} and ${RECIPE_FILE[id]})`)
    RECIPES[id] = recipes[id]
    RECIPE_FILE[id] = file
  }
}

// ---- rendering ---------------------------------------------------------------------------------------------------------------------------

/** Trims or pads to the recipe's length, takes out the DC offset, fades in and out, and scales to PEAK. */
function render(raw, { ms, swell = false, fadeOut = 0.004 }) {
  const seconds = ms / 1000
  const count = frames(seconds)
  const samples = new Float64Array(count)
  for (let i = 0; i < count && i < raw.length; i++) samples[i] = raw[i]
  // DC: a one-pole high-pass, 20 Hz (120 Hz for a 20-40 ms tick, which has nothing to say below 200 Hz and needs the offset gone within a
  // few ms). Not the file's mean: a pulse wave with a skewed duty has an offset that dies with its envelope, and subtracting a global mean
  // would leave a flat step where the sound has faded out.
  const pole = 1 - TAU * (ms < 100 ? 120 : 20) / RATE
  let previous = 0
  let blocked = 0
  for (let i = 0; i < count; i++) {
    blocked = samples[i] - previous + pole * blocked
    previous = samples[i]
    samples[i] = blocked
  }
  const fadeIn = swell ? 0.003 : 0.0005
  let top = 0
  for (let i = 0; i < count; i++) {
    const t = i / RATE
    samples[i] *= Math.sin(Math.PI / 2 * clamp(t / fadeIn, 0, 1)) * Math.sin(Math.PI / 2 * clamp((seconds - t) / fadeOut, 0, 1))
    top = Math.max(top, Math.abs(samples[i]))
  }
  return samples.map(x => (x / top) * PEAK)
}

/** A 16-bit PCM mono WAV file of the samples. */
function wav(samples) {
  const bytes = Buffer.alloc(44 + samples.length * 2)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(36 + samples.length * 2, 4)
  bytes.write('WAVE', 8, 'ascii')
  bytes.write('fmt ', 12, 'ascii')
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(RATE, 24)
  bytes.writeUInt32LE(RATE * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36, 'ascii')
  bytes.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((sample, i) => bytes.writeInt16LE(Math.round(sample * 32_767), 44 + i * 2))
  return bytes
}

// ---- write -----------------------------------------------------------------------------------------------------------------------------

const manifest = { cues: {} }
for (const id of CUE_IDS) {
  const recipes = RECIPES[id]
  if (!recipes || recipes.length < 3) throw new Error(`${id}: fewer than three recipes`)
  manifest.cues[id] = []
  for (const recipe of recipes) {
    const file = `${id}/${recipe.name}.wav`
    const path = resolve(OUT, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, wav(render(recipe.make(seeded(fnv(file))), recipe)))
    manifest.cues[id].push({
      name: recipe.name,
      file,
      source: `scripts/cue-recipes/${RECIPE_FILE[id]}, Rezept ${recipe.name}`,
      author: null,
      licence: 'generated',
      note: recipe.note,
    })
  }
}
for (const id of Object.keys(RECIPES)) if (!CUE_IDS.includes(id)) throw new Error(`${id}: a recipe for no cue id`)
// The cues sorted by id, as in credits.json (scripts/ship-cue-sound.mjs): tickets that add different cue groups then write different
// places of the file, where in CUE_IDS order every new group landed at the end and conflicted at every merge of 0.17 (#833).
const sorted = { ...manifest, cues: Object.fromEntries(Object.keys(manifest.cues).sort().map(id => [id, manifest.cues[id]])) }
writeFileSync(resolve(OUT, 'manifest.json'), `${JSON.stringify(sorted, null, 2)}\n`)

// ---- check what was written ----------------------------------------------------------------------------------------------------------

const problems = []
const fail = (where, message) => problems.push(`${where}: ${message}`)

/** The format, length, level, onset and DC rules of one file; returns the numbers for the report line. */
function inspect(where, path, id, swell) {
  if (!existsSync(path)) return fail(where, 'file missing')
  const bytes = readFileSync(path)
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.toString('ascii', 12, 16) !== 'fmt '
    || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== RATE || bytes.readUInt16LE(34) !== 16
    || bytes.toString('ascii', 36, 40) !== 'data' || bytes.readUInt32LE(40) !== bytes.length - 44) return fail(where, 'not a 16-bit PCM mono 44.1 kHz WAV')
  const count = (bytes.length - 44) / 2
  const sample = i => bytes.readInt16LE(44 + i * 2) / 32_768
  const ms = (count / RATE) * 1000
  let top = 0
  let sum = 0
  for (let i = 0; i < count; i++) {
    top = Math.max(top, Math.abs(sample(i)))
    sum += sample(i)
  }
  const peakDb = 20 * Math.log10(top)
  if (ms > MAX_MS[id] + 1e-6) fail(where, `${ms.toFixed(1)} ms is longer than the ${MAX_MS[id]} ms of cue-lengths.ts`)
  if (Math.abs(peakDb + 1) > 0.5) fail(where, `peak ${peakDb.toFixed(2)} dBFS is not within 0.5 dB of -1`)
  if (Math.abs(sum / count) > 0.01 * top) fail(where, `DC offset ${(sum / count).toFixed(4)}`)
  // Onset: a cue is scheduled to the millisecond. A transient reaches 30 % of the peak in 5 ms; a swell must at least be audible (10 %) in 10 ms.
  const window = frames(swell ? 0.01 : 0.005)
  let early = 0
  for (let i = 0; i < window; i++) early = Math.max(early, Math.abs(sample(i)))
  if (early < (swell ? 0.1 : 0.3) * top) fail(where, `no onset: ${(early / top * 100).toFixed(0)} % of the peak in the first ${swell ? 10 : 5} ms`)
  if (Math.abs(sample(count - 1)) > 0.02 * top) fail(where, 'the file ends on a non-zero sample (a click)')
  // A flat stretch off zero (a crushed tail that fell below the first bit step, minus the mean) is a DC step the global mean does not show.
  let run = 0
  for (let i = 1; i < count; i++) {
    run = bytes.readInt16LE(44 + i * 2) === bytes.readInt16LE(44 + (i - 1) * 2) && Math.abs(sample(i)) > 0.005 ? run + 1 : 0
    if (run > frames(0.012)) {
      fail(where, `a flat stretch off zero at ${((i / RATE) * 1000).toFixed(0)} ms (DC step)`)
      break
    }
  }
  return { ms, peakDb }
}

// The rules of `candidatesOf` (app/dev/listening-model.ts, #534): a known cue id, name/file/source/licence present, licence CC0 or generated,
// the file in the cue's own folder with extension wav/ogg/mp3, a name that is unique within its cue.
const text = value => typeof value === 'string' && value.trim() !== ''
const onDisk = JSON.parse(readFileSync(resolve(OUT, 'manifest.json'), 'utf8'))
for (const [cue, entries] of Object.entries(onDisk.cues)) {
  if (!CUE_IDS.includes(cue)) fail(cue, 'not a cue id')
  const names = new Set()
  for (const entry of entries) {
    const where = `${cue}/${entry.name}`
    if (![entry.name, entry.file, entry.source, entry.licence].every(text)) fail(where, 'name, file, source or licence missing')
    if (!['CC0', 'generated'].includes(entry.licence)) fail(where, `licence ${entry.licence}`)
    if (!entry.file.startsWith(`${cue}/`) || entry.file.indexOf('/', cue.length + 1) !== -1) fail(where, 'file is not in the cue folder')
    if (!['wav', 'ogg', 'mp3'].includes(entry.file.slice(entry.file.lastIndexOf('.') + 1).toLowerCase())) fail(where, 'extension')
    if (names.has(entry.name)) fail(where, 'duplicate name')
    names.add(entry.name)
    if (entry.author !== null || !text(entry.note)) fail(where, 'author must be null and a note is required')
    const swell = RECIPES[cue].find(recipe => recipe.name === entry.name)?.swell ?? false
    const result = inspect(where, resolve(OUT, entry.file), cue, swell)
    if (result) console.log(`${cue.padEnd(16)} ${entry.name.padEnd(20)} ${result.ms.toFixed(0).padStart(5)} ms  ${result.peakDb.toFixed(2)} dBFS`)
  }
  if (entries.length < 3) fail(cue, 'fewer than three candidates')
}
for (const id of CUE_IDS) if (!onDisk.cues[id]) fail(id, 'no candidates in the manifest')

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n${problems.map(problem => `  ${problem}`).join('\n')}`)
  process.exit(1)
}
console.log(`\nwrote and checked ${Object.values(onDisk.cues).flat().length} candidates for ${CUE_IDS.length} cues in ${OUT}`)
