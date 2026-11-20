// The wording walk (#629, spec #620 § The walk): drives headless Chrome through every state of the dark check's lists as the dev Users in Hell, on a dev server
// started with the key tags, and records where each text stands: state, account, width, box and a picture with a frame around it.
//
//   COMPIES_SLOT=2 node scripts/browser/serve.mjs start <run> --wording      (run_in_background)
//   COMPIES_SLOT=2 node scripts/wording/walk.mjs [--run=<run>] [--only=<state>,…] [--section=<id>,…] [--width=390|1440]
//
// `--run` (default `walk`) is the `results(run)` folder and the `serve.mjs` run name; the Events the walk makes are named `W<run> …` and deleted at the end.
// It writes `recording.json`, `report.md` and `pictures/<seq>.jpg` to `<tmp>/compies-browser/wording/` (never into the repo: they hold the dev Users' data),
// then prints and logs the report. The recording's shape is `Recording` of review-model.mjs, which `checkRecording` checks before it is written. The exit code is 1
// on any FAIL line, also for a problem of the recording. A partial run (`--only`, `--section`, `--width`) writes a recording of what it read, and says so.
// The states come from `scripts/browser/states.mjs` (the dark check's lists, and `walk-states-*.mjs` files of #630), in the order of `walk-order.mjs`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeAll, colorScheme, launchAll, OUT, sleep } from '../browser/chrome.mjs'
import { api, BASE, eventView, ok, open, results } from '../browser/kit.mjs'
import { HEIGHTS, loadStates, makeData, settle } from '../browser/states.mjs'
import de from '../../i18n/locales/de.json' with { type: 'json' }
import { decodeTags } from '../../shared/key-tag.ts'
import { readBaseline } from './baseline.mjs'
import { flattenMessages } from './messages.mjs'
import { findCandidates, measureCandidates, rowsFrom } from './read-keys.mjs'
import { assemble, budgetId, createBudget, selectItems, wheelPlaceholderKeys } from './recording.mjs'
import { checkRecording, stepsOf } from './review-model.mjs'
import { firstReferences } from './unused-scan.mjs'
import { orderStates, sectionOf } from './walk-order.mjs'
import { CLEAR_FRAME, DESCRIBE, pictureScript, untaggedScript } from './walk-page.mjs'
import { isLocalBase, monoUseSightings, reportOf, withoutPicture } from './walk-report.mjs'
import { fixedTexts, locationOf, MONTH_PATTERN } from './where.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const ROOT_SLASHED = `${ROOT.replaceAll('\\', '/')}/`
const FOLDER = join(OUT, 'wording')
const PICTURES = join(FOLDER, 'pictures')

const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')).map(([key, value]) => [key, value ?? true]))
const run = typeof args.run === 'string' ? args.run : 'walk'
const only = typeof args.only === 'string' ? args.only.split(',') : null
const sections = typeof args.section === 'string' ? args.section.split(',') : null
const onlyWidth = args.width ? Number(args.width) : null
const partial = Boolean(only || sections || onlyWidth)

// The walk makes a Host and Events and signs in as a dev account, so it runs against the local dev server only (BASE_URL may name staging):
// refused before anything is wiped or opened.
if (!isLocalBase(BASE)) {
  console.error(`Der Walk läuft nur gegen den lokalen Dev-Server (http://localhost:<port>), nicht gegen ${BASE}: BASE_URL entfernen, COMPIES_SLOT=2 node scripts/wording/walk.mjs`)
  process.exit(1)
}

/** Which components get a mono entry whatever the walk sees, and what the review calls them (a component not here is labelled by its file name and reported). No User's data in a label. */
const MONO_WHAT = {
  'app/components/ChangelogInline.vue': 'Changelog: Code und Ausgabe-Chip',
  'app/components/ClipPreview.vue': 'Clip-Zeiten',
  'app/components/InviteLinkCard.vue': 'Einladungslink',
  'app/components/RichNotesToolbar.vue': 'Tastenkürzel im Tipp der Notizen-Werkzeugleiste',
}

/** The eleven uses of `font-mono` in app/ (`grep -rn "font-mono" app --include=*.vue`) and how each is recorded; the report says where each was seen. */
const MONO_USES = [
  { site: 'ChangelogInline.vue:39 code', component: 'app/components/ChangelogInline.vue', entry: true, element: 'code' },
  { site: 'ChangelogInline.vue:48 issue chip', component: 'app/components/ChangelogInline.vue', entry: true, notElement: 'code' },
  { site: 'ChatPanel.vue common.counter', component: 'app/components/ChatPanel.vue', keys: ['common.counter'] },
  { site: 'ClipPreview.vue:122 times', component: 'app/components/ClipPreview.vue', entry: true },
  { site: 'InviteLinkCard.vue:37 input', component: 'app/components/InviteLinkCard.vue', entry: true },
  { site: 'GameImageField.vue:310 gameEdit.imageRatio', component: 'app/components/GameImageField.vue', keys: ['gameEdit.imageRatio'] },
  { site: 'NoteEditor.vue:113 common.counter', component: 'app/components/NoteEditor.vue', keys: ['common.counter'] },
  { site: 'RichNotesToolbar.vue:158 shortcut', component: 'app/components/RichNotesToolbar.vue', entry: true, element: 'span' },
  { site: 'TeamNameBuilder.vue:222 common.counter', component: 'app/components/TeamNameBuilder.vue', keys: ['common.counter'] },
  { site: 'TextField.vue:125 common.counter', component: 'app/components/TextField.vue', keys: ['common.counter'] },
  { site: 'StagingBadge.vue:12 staging.badge', component: 'app/components/StagingBadge.vue', keys: ['staging.badge'], expectedMissing: 'the badge renders on a staged server only (stage.ts), and the dev server is not started staged' },
]

/**
 * The server-drawn pictures: a row per picture whose copy the server reads, so #630 can add rows. `keys(ctx)` names the messages the picture shows,
 * and the picture is the `element`, framed, in the stop of the states. The Share image's keys depend on the Event: they would come from running
 * `shareImageModel` over a copy whose every leaf is its own key, and Node cannot import `shared/share-image.ts` (extensionless imports), so no key is claimed (decided on #629, O2).
 * The Hidden wheel's placeholders (#810) are server-drawn too: a spin's labels reach the Member as plain strings, so no key tag carries them. They are read from the
 * Member's own view of the Event, never the Host's: nothing of the pool's real names may reach the recording (`CODING_STANDARDS.md` § Secrecy). Before the stop all 30
 * labels are placeholders; a late read gives fewer, because the result slice shows the game.
 */
const SERVER_SIGHTINGS = [
  { stop: 'teilen', states: /^fertig(-gleichstand)?-(host|spieler)$/, element: '[role=dialog] img[src^="blob:"]', kind: 'img', keys: async () => /** @type {string[]} */ ([]) },
  {
    stop: 'dreht',
    states: /^rad-platzhalter-spieler$/,
    element: '[data-testid="wheel-disc"]',
    kind: 'disc',
    keys: async ctx => wheelPlaceholderKeys((await eventView(ctx.tabs.member, ctx.event.slug)).wheel?.spin?.labels ?? [], de.wheel.placeholders),
  },
]

const OFFLINE_STATES = ['offline']
const CHANGELOG_STATES = ['neuigkeiten', 'was-ist-neu']

const SOURCE_FOLDERS = ['app', 'server', 'shared']
/** @param {string} dir @returns {string[]} The files `unused.mjs` reads. */
function walkFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walkFiles(path)
    return /\.(vue|ts|js|mjs)$/.test(entry.name) ? [path] : []
  })
}

const messageList = flattenMessages(de)
const messageKeys = new Set(messageList.map(message => message.key))
const FIXED = fixedTexts({
  offline: readFileSync(join(ROOT, 'public/offline.html'), 'utf8'),
  nuxtConfig: readFileSync(join(ROOT, 'nuxt.config.ts'), 'utf8'),
  utilsChangelog: readFileSync(join(ROOT, 'app/utils/changelog.ts'), 'utf8'),
  sharedChangelog: readFileSync(join(ROOT, 'shared/changelog.ts'), 'utf8'),
})

/** The fixed texts a state may show: exact lines, and release dates by their month. */
function wantedFor(stateName) {
  const exact = FIXED.filter(entry => (OFFLINE_STATES.includes(stateName) && entry.id.startsWith('offline.')) || (CHANGELOG_STATES.includes(stateName) && entry.id.startsWith('changelog.group.')))
  const months = CHANGELOG_STATES.includes(stateName) ? FIXED.filter(entry => entry.id.startsWith('changelog.month.')) : []
  return { exact: exact.map(entry => [entry.id, entry.text]), months: months.map(entry => [entry.id, MONTH_PATTERN(entry.text).source]) }
}

/** Vue's `__file` as a repo-relative path with forward slashes (the dev build gives an absolute one). */
function repoPath(file) {
  if (!file) return null
  const slashed = file.replaceAll('\\', '/').replace(/\?.*$/, '')
  return slashed.startsWith(ROOT_SLASHED) ? slashed.slice(ROOT_SLASHED.length) : slashed
}

const git = (...params) => {
  try {
    return execFileSync('git', params, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  }
  catch {
    return 'unknown'
  }
}

class NoKeys extends Error {}

const { states, cleanups } = await loadStates({ extra: 'walk-states-' })
const chosen = orderStates(states).filter(state => (!only || only.includes(state.name)) && (!sections || sections.includes(sectionOf(state))))
if (!chosen.length) throw new Error(`No state matches ${[only && `--only=${only}`, sections && `--section=${sections}`].filter(Boolean).join(' ')}; the states are ${states.map(state => state.name).join(', ')}`)

const log = results(run)
const started = Date.now()

// A full or a partial run both start from an empty folder: recording.json and pictures/ always belong together.
mkdirSync(FOLDER, { recursive: true })
rmSync(PICTURES, { recursive: true, force: true })
rmSync(join(FOLDER, 'recording.json'), { force: true })
mkdirSync(PICTURES, { recursive: true })
if (partial) log.note(`partial recording: ${[only && `--only=${only.join(',')}`, sections && `--section=${sections.join(',')}`, onlyWidth && `--width=${onlyWidth}`].filter(Boolean).join(' ')}`)
log.note('decided on #629 (O2): shared/share-image.ts cannot be imported by Node (extensionless imports), so the Share image\'s keys are not claimed: fertig-*/teilen has no `server` sighting')

/** What the walk has kept, and what it counted on the way. */
const readings = []
const budget = createBudget()
const counts = { covered: 0, notPainted: 0, untagged: 0 }
const missing = new Set()
/** The keys the walk read and could not picture, and why (`pictureScript`'s `skip`): the report's reason for a new text without a picture. */
const skipped = new Map()
const unreached = new Set()
const readStates = new Set()
let seq = 0
let monoFamily = null
let firstReading = true
const notes = []

const snapshot = () => ({ seq, readings: readings.length, counts: { ...counts }, missing: new Set(missing), skipped: new Map(skipped), budget: budget.snapshot() })
function restore(mark) {
  seq = mark.seq
  readings.length = mark.readings
  Object.assign(counts, mark.counts)
  missing.clear()
  for (const key of mark.missing) missing.add(key)
  skipped.clear()
  for (const [key, why] of mark.skipped) skipped.set(key, why)
  budget.restore(mark.budget)
}

/**
 * The Rundgang covers a Member's Event page, so it may be on the page only in a state that asked for it (`tour: true`, #810): a plain dev sign-in marks it seen, and this
 * is the check that no state of the walk is covered by it. A state without the flag whose page has the layer, or with the flag whose page lacks it, is not reached.
 */
async function checkRundgang(tab, state) {
  const covered = await tab.evaluate(`!!document.querySelector('[data-tour-layer]')`)
  if (covered && !state.tour) throw new Error('the Rundgang covers this page')
  if (!covered && state.tour) throw new Error('the Rundgang is not on the page')
}

/** The pictures of a reading's kept items, the budget applied per key. A skip is counted, and kept by key for the report. */
async function pictureItems(tab, kept) {
  const pictured = []
  // One picture serves every key of a server sighting (the 30 placeholders on one disc): one shot per element, written under each key's own `seq`.
  const shots = new Map()
  for (const item of kept) {
    const id = budgetId(item)
    if (budget.full(id)) {
      budget.drop()
      continue
    }
    const shared = item.via === 'server' ? item.target.selector : null
    let taken = shared ? shots.get(shared) : undefined
    if (!taken) {
      const placed = await tab.evaluate(pictureScript(item.target))
      if (placed.skip) taken = { skip: placed.skip }
      else {
        const shot = await tab.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 })
        taken = { box: placed.box, data: Buffer.from(shot.result.data, 'base64') }
      }
      if (shared) shots.set(shared, taken)
    }
    if (taken.skip) {
      counts[taken.skip]++
      if (item.key !== null && !skipped.has(item.key)) skipped.set(item.key, taken.skip)
      continue
    }
    seq++
    writeFileSync(join(PICTURES, `${seq}.jpg`), taken.data)
    budget.use(id)
    const rest = { ...item }
    delete rest.target
    pictured.push({ ...rest, box: taken.box, picture: `pictures/${seq}.jpg` })
  }
  return pictured
}

/**
 * The server-drawn pictures of a stop (`SERVER_SIGHTINGS`): the keys the server's copy gives, each with the picture of its element. Read before anything else of a
 * reading, since the Hidden wheel's placeholders last 6 s on the shortest spin.
 */
async function serverItemsOf(ctx, state, name) {
  const items = []
  for (const server of SERVER_SIGHTINGS) {
    if (!name.endsWith(`/${server.stop}`) || !server.states.test(state.name)) continue
    for (const key of await server.keys(ctx)) items.push({ key, via: 'server', rendered: '', marks: [], component: null, element: server.kind, target: { selector: server.element } })
  }
  return items
}

/**
 * One reading of the page as it stands (a state's page, or one of its stops): rows, marks, pictures. `serverOnly` (a stop's flag) reads the server sightings and nothing
 * else: the page was read before the stop, and the stop's time is short.
 */
async function readPage(ctx, state, name, { serverOnly = false } = {}) {
  const { tab } = ctx
  await checkRundgang(tab, state)
  const pictured = []
  const server = selectItems(await serverItemsOf(ctx, state, name), messageKeys)
  for (const key of server.missing) missing.add(key)
  if (server.kept.length) {
    pictured.push(...await pictureItems(tab, server.kept))
    await tab.evaluate(CLEAR_FRAME)
  }
  if (!serverOnly) pictured.push(...await readItems(ctx, state))
  // A layer that came while the page was read covers what the pictures show: the same check, once more, for the states that did not ask for it.
  if (!state.tour) await checkRundgang(tab, state)
  readings.push({ state: name, account: state.group === 'signed-out' ? null : state.account, width: ctx.width, items: pictured })
}

/** The page's own texts: rows by their key tags, the mono elements and fixed texts, each with its picture. */
async function readItems(ctx, state) {
  const { tab } = ctx
  await settle(tab)
  await sleep(400)
  const { candidates, untagged } = await findCandidates(tab)
  counts.untagged += untagged
  if (firstReading) {
    if (!candidates.length) throw new NoKeys('no keys: start the dev server with --wording (node scripts/browser/serve.mjs start <run> --wording)')
    firstReading = false
  }
  const boxes = await measureCandidates(tab, candidates)
  const rows = rowsFrom(candidates, boxes)
  // `rowsFrom` makes one row per tag of each candidate, in order: the same walk gives each row its candidate and its span in the raw text.
  const spans = candidates.flatMap(candidate => decodeTags(candidate.raw).tags.map(tag => ({ i: candidate.i, from: tag.from, to: tag.to })))
  const described = candidates.length ? await tab.evaluate(DESCRIBE) : { family: monoFamily, items: [] }
  monoFamily = described.family || monoFamily
  const extra = await tab.evaluate(untaggedScript(wantedFor(state.name)))

  const items = []
  rows.forEach((row, n) => {
    const span = spans[n]
    const description = described.items[span.i] ?? { mono: false, srOnly: false, component: null }
    const via = row.kind
    const marks = []
    if (description.mono && (via === 'text' || via === 'placeholder')) marks.push('mono')
    if (via === 'aria-label' || via === 'alt' || (via === 'text' && description.srOnly)) marks.push('sr-only')
    if (row.box === null && !marks.includes('sr-only')) {
      counts.notPainted++
      if (!skipped.has(row.key)) skipped.set(row.key, 'notPainted')
      return
    }
    items.push({
      key: row.key, via, rendered: row.text.slice(0, 2000), marks, component: repoPath(description.component), element: row.element,
      target: { list: 'nodes', i: span.i, ...(via === 'text' ? { from: span.from, to: span.to } : {}), ...(via === 'text' && description.srOnly ? { labelled: true } : {}) },
    })
  })
  for (const entry of extra.mono) items.push({ key: null, via: 'text', rendered: entry.text, marks: ['mono'], component: repoPath(entry.component), element: entry.element, target: { list: 'extra', i: entry.ref } })
  for (const entry of extra.fixed) items.push({ key: null, fixedId: entry.id, via: 'text', rendered: entry.text, marks: [], component: null, element: 'text', target: { list: 'extra', i: entry.ref } })

  const { kept, missing: unknown } = selectItems(items, messageKeys)
  for (const key of unknown) missing.add(key)
  const pictured = await pictureItems(tab, kept)
  await tab.evaluate(CLEAR_FRAME)
  return pictured
}

/** One state at one width, as `dark.mjs`'s `readState` reads it: the page, then each stop. Returns the FAIL lines instead of logging them, so a read that is repeated leaves none. */
async function readState(state, ctx) {
  const fails = []
  const where = `[${state.group}/${state.name} ${ctx.width}]`
  try {
    await state.open(ctx)
    await readPage(ctx, state, state.name)
  }
  catch (error) {
    if (error instanceof NoKeys) throw error
    return [[`${where} state not reached`, String(error.message).slice(0, 200)]]
  }
  for (const stop of state.stops ?? []) {
    if (stop.widths && !stop.widths.includes(ctx.width)) continue
    try {
      await stop.go(ctx)
      await readPage(ctx, state, `${state.name}/${stop.name}`, { serverOnly: stop.serverOnly })
    }
    catch (error) {
      if (error instanceof NoKeys) throw error
      fails.push([`[${state.group}/${state.name}/${stop.name} ${ctx.width}] state not reached`, String(error.message).slice(0, 200)])
    }
  }
  return fails
}

/** A state that ends while it is read (the Veto window, the Clip) is read once more from `open`; a second end is the FAIL line. */
async function walkState(state, ctx) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const mark = snapshot()
    let fails
    let ended = null
    try {
      fails = await readState(state, ctx)
      if (state.stillHolds) {
        try {
          await state.stillHolds(ctx)
        }
        catch (error) {
          ended = String(error.message).slice(0, 200)
        }
      }
    }
    finally {
      try {
        await state.after?.(ctx)
      }
      catch (error) {
        log.note(`[${state.group}/${state.name} ${ctx.width}] after failed: ${String(error.message).slice(0, 150)}`)
      }
    }
    if (ended && attempt === 1) {
      restore(mark)
      log.note(`[${state.group}/${state.name} ${ctx.width}] did not hold while it was read, read again`)
      continue
    }
    if (ended) fails.push([`[${state.group}/${state.name} ${ctx.width}] did not hold while it was read`, ended])
    for (const [label, detail] of fails) log.check(label, false, detail)
    if (fails.some(([label]) => label.endsWith('state not reached'))) unreached.add(state.name)
    readStates.add(state.name)
    log.note(`[${state.group}/${state.name} ${ctx.width}] readings ${readings.length - mark.readings}, pictures ${seq - mark.seq}`)
    return
  }
}

const tabs = await launchAll(['host', 'member', 'admin'])
let data = null

let problems = []
try {
  for (const tab of Object.values(tabs)) await colorScheme(tab, 'light')
  await open(tabs.host, '/', 1440, 900)
  data = await makeData(tabs.host, { name: `W${run}` })
  for (const state of chosen) {
    for (const width of (state.widths ?? [390, 1440]).filter(value => !onlyWidth || value === onlyWidth)) {
      // The Dev Users stay on Hell: every sign-in passes `appearance: 'light'`, and the walk reads that one Appearance only.
      const ctx = { tab: tabs[state.account], tabs, width, height: HEIGHTS[width] ?? 900, appearance: 'light', data, signOut() {} }
      await walkState(state, ctx)
    }
  }
  finish()
}
catch (error) {
  if (!(error instanceof NoKeys)) throw error
  log.check('the page carries message keys', false, error.message)
  console.log(error.message)
}
finally {
  for (const cleanup of cleanups) {
    try {
      await cleanup({ tabs, data })
    }
    catch (error) {
      log.note(`cleanup failed: ${String(error.message).slice(0, 150)}`)
    }
  }
  try {
    if (data) {
      await api(tabs.host, 'POST', `/api/e/${data.slug}/sessions/end`)
      await api(tabs.host, 'DELETE', `/api/e/${data.slug}`)
    }
    const { events } = await ok(api(tabs.host, 'GET', '/api/e'), 'GET /api/e')
    const left = events.filter(event => event.name === `W${run}` || event.name.startsWith(`W${run} `))
    log.check(`no Event of the run W${run} is left on the dev database`, left.length === 0, `${left.length} left, ${events.length} Events listed for the Dev Host`)
  }
  catch (error) {
    log.check('no Event of the run is left on the dev database', false, `could not check: ${String(error.message).slice(0, 150)}`)
  }
  for (const tab of Object.values(tabs)) notes.push(`${tab.account}: ${tab.errors.length} page errors`)
  closeAll(tabs)
}
for (const note of notes) log.note(note)
process.exitCode = log.failed || problems.length ? 1 : 0

/** The recording, from what was read: checked, written, and reported. Runs while the browsers are still up, before the Event of the run is deleted and checked. */
function finish() {
  const seconds = Math.round((Date.now() - started) / 1000)
  const seen = new Set(readings.flatMap(reading => reading.items.flatMap(item => (item.key ? [item.key] : []))))
  const references = firstReferences(SOURCE_FOLDERS.flatMap(folder => walkFiles(join(ROOT, folder))).map(file => ({ file: file.replaceAll('\\', '/').slice(ROOT_SLASHED.length), text: readFileSync(file, 'utf8') })))
  const locations = {}
  for (const { key } of messageList) {
    if (seen.has(key)) continue
    const place = locationOf(key, references)
    if (place) locations[key] = { file: place.file, line: place.line }
  }
  const made = assemble({ readings, fixed: FIXED, mono: MONO_WHAT, locations, commit: git('rev-parse', '--short', 'HEAD'), recordedAt: new Date().toISOString() })
  problems = checkRecording(made)
  for (const problem of problems) log.check('the recording is valid', false, problem)
  // The pictures a sighting names are the files that are there, and numbered as `seq` says.
  const all = [...made.messages, ...made.monoElements, ...made.fixed].flatMap(entry => entry.sightings)
  const named = new Set(all.map(sighting => sighting.picture))
  const wrong = all.filter(sighting => sighting.picture !== `pictures/${sighting.seq}.jpg` || !existsSync(join(FOLDER, sighting.picture)))
  log.check('every sighting has its picture, named by its seq', wrong.length === 0, `${all.length} sightings, ${wrong.length} wrong`)
  for (const file of readdirSync(PICTURES)) if (!named.has(`pictures/${file}`)) rmSync(join(PICTURES, file))
  writeFileSync(join(FOLDER, 'recording.json'), `${JSON.stringify(made, null, 2)}\n`)

  const unusedFile = join(FOLDER, 'unused.json')
  const { steps, problems: stepProblems } = stepsOf({ messages: messageList, recording: made, unused: existsSync(unusedFile) ? JSON.parse(readFileSync(unusedFile, 'utf8')) : null })
  // „Neu“ as the review's filter says it: against every answers file git tracks, merged (#810). No file: every text is new.
  const baseline = readBaseline(join(ROOT, 'docs/reviews'), { except: null })
  const bytes = all.reduce((sum, sighting) => sum + statSync(join(FOLDER, sighting.picture)).size, 0)
  const report = reportOf({
    run, commit: made.commit, seconds, partial, statesRead: readStates.size, unreached: [...unreached], readings: readings.length,
    sightings: all.length, dropped: budget.dropped, covered: counts.covered, notPainted: counts.notPainted,
    pictures: { count: all.length, bytes, folder: PICTURES.replaceAll('\\', '/') },
    steps, stepProblems, unusedNote: existsSync(unusedFile) ? null : 'unused.json is not there (node scripts/wording/unused.mjs): the unused groups are not in these counts',
    monoUses: monoUseSightings(MONO_USES, readings), unlabelled: made.monoElements.filter(entry => !(entry.component in MONO_WHAT)).map(entry => entry.component),
    fixed: { withPicture: made.fixed.filter(entry => entry.sightings.length).length, without: made.fixed.filter(entry => !entry.sightings.length).length },
    unpictured: withoutPicture({ steps, baseline: baseline.answers, skipped }),
    missing: [...missing], untagged: counts.untagged, monoFamily,
    notes: [
      `Locations for ${Object.keys(locations).length} of ${messageList.length - seen.size} keys without a sighting.`,
      `New texts are those the baseline does not hold, unchanged: ${baseline.name ?? 'no answers file is tracked, so every text is new'}.`,
    ],
  })
  for (const line of report) log.note(line)
  writeFileSync(join(FOLDER, 'report.md'), `${report.join('\n')}\n`)
  return made
}
