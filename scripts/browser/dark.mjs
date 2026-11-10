// The Dunkel-Check (#407, spec #398 § Dark in the app): measures every state of every `dark-states-*.mjs` file in Dunkel
// and in System on a dark device, and writes one verdict per colour pairing: text 4.5:1 (3:1 large), a control's edge
// 3:1, a focus ring 3:1, a surface that differs from what it sits on, and that Dunkel and System are the same page.
//
//   node scripts/browser/dark.mjs [--run=<name>] [--only=<state>,…] [--width=390|1440] [--base=<ref>]
//
// `BASE_URL` as in every check; `--run` (default `dark`) is the results folder, the name of the `serve.mjs` run too.
// FAIL lines are the product: the exit code is 1 on any, and the findings are what #409 is split from. Beside
// `results.log` and the screenshots the folder gets `findings.json` and `report.md`, rewritten after every state.
//
// A state file exports `STATES`, a list of:
//
//   State = { name, group,                   // `group` names the file's area: 'signed-out', 'app', …
//             account: 'host' | 'member' | 'admin', signedOut?: true,
//             static?: true,                 // committed content only: every text may be named in the log
//             widths?: number[],             // default [390, 1440]
//             appearances?: ('dark' | 'system')[],   // default both
//             open(ctx): Promise<void>,
//             stops?: { name, widths?, go(ctx): Promise<void> }[] }   // further states on the same page load, in order
//   ctx = { tab, width, height, appearance, data, signOut(how) }     // 390 × 844 and 1440 × 900
//   data = { slug, invitePath, game, longGame }                      // made once by this runner
//
// `open` signs in (`open`, `openSignedOut`) with `ctx.appearance` and loads the page; a `signedOut` state reports how its
// sign-out went through `ctx.signOut`. A state that cannot be reached throws, and is one FAIL line. Personal data: the
// log, findings.json and report.md reach a public issue, so a text is named only when `label()` says so.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { closeAll, colorScheme, launchAll } from './chrome.mjs'
import { cut, judgeBox, judgeRing, judgeSurface, judgeText, label, lines, same } from './contrast.mjs'
import { READ, READ_RINGS } from './dark-read.mjs'
import { api, createEvent, createGame, eventView, ok, open, pressKey, results } from './kit.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GAME_NAME_MAX = 60
const HEIGHTS = { 390: 844, 1440: 900 }
const SCHEMES = { dark: 'light', system: 'dark' } // the device's scheme per pass: Dunkel must not lean on the device

const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')).map(([key, value]) => [key, value ?? true]))
const run = typeof args.run === 'string' ? args.run : 'dark'
const only = typeof args.only === 'string' ? args.only.split(',') : null
const onlyWidth = args.width ? Number(args.width) : null
const baseRef = typeof args.base === 'string' ? args.base : 'origin/spec/398-profil'

const git = (...params) => {
  try {
    return execFileSync('git', ['-C', HERE, ...params], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  }
  catch {
    return 'unknown'
  }
}

// The committed copy: a text of the page is named in the log only when it is one of these (placeholders as wildcards).
const flatten = (value, out = []) => {
  if (typeof value === 'string') out.push(value)
  else if (value && typeof value === 'object') Object.values(value).forEach(inner => flatten(inner, out))
  return out
}
const COPY = flatten(JSON.parse(readFileSync(join(HERE, '../../i18n/locales/de.json'), 'utf8')))

const states = []
for (const file of readdirSync(HERE).filter(name => /^dark-states-.*\.mjs$/.test(name)).sort()) {
  states.push(...(await import(pathToFileURL(join(HERE, file)).href)).STATES)
}
const chosen = states.filter(state => !only || only.includes(state.name))
if (!chosen.length) throw new Error(`No state matches --only=${only}; the states are ${states.map(state => state.name).join(', ')}`)

const log = results(run)
const started = Date.now()
const take = (name, prefix = '') => `${prefix}${name}`.replace(/[^\w-]+/g, '-')

/** The summary the run writes: per state its counts, every FAIL and SKIP line, and the totals. */
const findings = { sha: git('rev-parse', '--short', 'HEAD'), base: git('rev-parse', '--short', baseRef), run, startedAt: new Date(started).toISOString(), seconds: 0, states: {}, lines: [] }
const signOuts = new Set()
const pageErrors = []

const stat = (state) => {
  const key = state.name
  return findings.states[key] ??= { group: state.group, pass: 0, fail: 0, skip: 0, excluded: 0, shots: [] }
}

/** The lines of two Appearances that are the same finding become one line of `'both'`. */
function mergedLines() {
  const merged = new Map()
  for (const line of findings.lines) {
    const { appearance, ...rest } = line
    const id = JSON.stringify(rest)
    const known = merged.get(id)
    if (known && known.appearance !== appearance) known.appearance = 'both'
    else if (!known) merged.set(id, { ...line })
  }
  return [...merged.values()]
}

function writeSummary() {
  findings.seconds = Math.round((Date.now() - started) / 1000)
  const lineList = mergedLines()
  writeFileSync(join(log.dir, 'findings.json'), `${JSON.stringify({ ...findings, lines: lineList }, null, 2)}\n`)
  const rows = Object.entries(findings.states)
  const total = key => rows.reduce((sum, [, row]) => sum + row[key], 0)
  const where = line => `${line.state} ${line.width} ${line.appearance}`
  const describe = line => `${line.kind} ${line.role} ${line.texts.join(', ')} ×${line.count}: ${line.fg ?? 'no colour'} on ${line.bg}${line.ratio === null ? '' : ` ${cut(line.ratio)}:1`}${line.need ? `, needs ${line.need}:1` : ''}${line.why && line.why !== 'contrast' ? ` (${line.why})` : ''}`
  const groups = [...new Set(lineList.filter(line => line.outcome === 'fail').map(line => line.group))]
  const report = [
    '# Dunkel-Check',
    '',
    `Tested ${findings.sha} against ${findings.base} (run \`${run}\`), took ${duration(findings.seconds)}.`,
    '',
    '| state | PASS | FAIL | SKIP |',
    '|---|---|---|---|',
    ...rows.map(([name, row]) => `| ${name} | ${row.pass} | ${row.fail} | ${row.skip} |`),
    `| total | ${total('pass')} | ${total('fail')} | ${total('skip')} |`,
    '',
    `Screenshots: \`<tmp>/compies-browser/${run}/\``,
    '',
    '## FAIL',
    ...(groups.length ? groups.flatMap(group => [`### ${group}`, ...lineList.filter(line => line.outcome === 'fail' && line.group === group).map(line => `- ${where(line)}: ${describe(line)}`)]) : ['None.']),
    '',
    '## Texts skipped on a picture',
    ...(lineList.filter(line => line.outcome === 'skip' && line.why === 'picture' && line.kind === 'text').map(line => `- ${where(line)}: ${line.role} ${line.texts.join(', ')} ×${line.count}`)),
  ]
  writeFileSync(join(log.dir, 'report.md'), `${report.join('\n')}\n`)
}

function duration(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const caption = line => `${line.kind} ${line.role} ${line.texts.join(', ')} ×${line.count}`
const detail = (line) => {
  if (line.outcome === 'skip') return line.why === 'inactive' ? 'on an inactive control' : 'on a picture or gradient'
  if (line.why === 'no-ring') return `no visible focus ring, on ${line.bg}`
  if (line.why === 'same-as-behind') return `fill ${line.fg ?? 'none'}, border and shadow all look like ${line.bg}`
  if (line.need === null) return `${line.fg ?? 'no fill'} on ${line.bg}${line.ratio === null ? '' : ` ${cut(line.ratio)}:1`}, differs from what is behind`
  return `${line.fg} on ${line.bg} ${cut(line.ratio)}:1, needs ${line.need}:1`
}

/**
 * Waits for fonts and for every animation with a finite run to end, at most 3 s. Before that the page is scrolled through
 * once: what lands when it comes into view (the stamp on Neuigkeiten) starts then, not in the middle of the reading,
 * where it would show in one reading and not in the other.
 */
const settle = tab => tab.evaluate(`(async () => {
  await document.fonts.ready
  for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(200, innerHeight / 2)) {
    scrollTo(0, y)
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  scrollTo(0, 0)
  await new Promise(resolve => setTimeout(resolve, 700))
  const end = Date.now() + 3000
  while (Date.now() < end && document.getAnimations().some(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().iterations ?? 1))) await new Promise(resolve => setTimeout(resolve, 100))
})()`)

/** What one reading of one state turned into: the counts and the items `same` compares. */
const readings = new Map()

/** Reads, shoots and judges one page: `where` is the log prefix, `name` the state or stop. Returns false when the page is not dark. */
async function measure({ tab, state, name, width, appearance, first }) {
  const where = `[${state.group}/${name} ${width} ${appearance}]`
  await settle(tab)
  const reading = await tab.evaluate(READ)
  if (first) {
    const dark = reading.scheme === 'dark' && (reading.theme === appearance || (reading.theme === null && state.name === 'offline'))
    log.check(`${where} draws dark`, dark, `data-theme ${reading.theme}, color-scheme ${reading.scheme}`)
    if (!dark) {
      stat(state).fail++
      return false
    }
  }
  const overlay = reading.surfaces.some(surface => surface.kind === 'dialog' || surface.kind === 'menu')
  const file = await log.shot(tab, take(`${name}-${width}-${appearance}`), overlay ? undefined : 'body')
  stat(state).shots.push(file.split(/[\\/]/).pop())
  await pressKey(tab, 'Tab')
  const { rings, unseen: ringsUnseen } = await tab.evaluate(READ_RINGS)

  const named = raw => label(raw.text, COPY, state.static === true)
  const kinds = [
    ['text', reading.texts, judgeText],
    ['border', reading.boxes, judgeBox],
    ['ring', rings, judgeRing],
    ['surface', reading.surfaces, judgeSurface],
  ]
  for (const [kind, raws, judge] of kinds) {
    const verdicts = raws.map(judge)
    for (const line of lines(kind, raws, verdicts, named)) {
      const stats = stat(state)
      stats[line.outcome] += line.count
      const text = `${where} ${caption(line)}`
      if (line.outcome === 'skip') log.skip(text, detail(line))
      else log.check(text, line.outcome === 'pass', detail(line))
      if (line.outcome !== 'pass') findings.lines.push({ ...line, state: name, group: state.group, width, appearance })
    }
  }
  stat(state).excluded += reading.excluded
  const lost = [...reading.unseen, ...ringsUnseen]
  if (lost.length) log.note(`${where} ${lost.length} elements could not be brought into view and were not read: ${lost.slice(0, 3).join(' ; ')}`)
  const items = [
    ...reading.texts.map(raw => ({ kind: 'text', ...raw })),
    ...reading.boxes.map(raw => ({ kind: 'box', ...raw })),
    ...reading.surfaces.map(raw => ({ kind: 'surface', ...raw })),
    ...rings.map(raw => ({ kind: 'ring', ...raw })),
  ]
  readings.set(`${name}|${width}|${appearance}`, { items, state })
  return true
}

/** The games and the Event every state may need, as the Dev Host: reused when the dev database has them. */
async function makeData(host) {
  const games = (await ok(api(host, 'GET', '/api/games'), 'GET /api/games')).games
  const gameNamed = async (name, fields = {}) => games.find(game => game.name === name) ?? await createGame(host, { name, playersMin: 1, playersMax: 8, ...fields })
  const game = await gameNamed('R011 Dunkel-Check Spiel')
  const longGame = await gameNamed(`R011${'W'.repeat(GAME_NAME_MAX - 4)}`)
  const home = await ok(api(host, 'GET', '/api/e'), 'GET /api/e')
  const known = home.events.find(event => event.name === 'R011 Dunkel-Check')
  const slug = known?.slug ?? (await createEvent(host, { name: 'R011 Dunkel-Check', pool: [game.id, longGame.id] })).slug
  const { inviteUrl } = await eventView(host, slug)
  return { slug, invitePath: new URL(inviteUrl, 'http://x').pathname, game, longGame }
}

const tabs = await launchAll(['host', 'member', 'admin'])
try {
  await open(tabs.host, '/', 1440, 900)
  const data = await makeData(tabs.host)
  const passes = ['dark', 'system']
  for (const appearance of passes) {
    for (const tab of Object.values(tabs)) await colorScheme(tab, SCHEMES[appearance])
    for (const state of chosen) {
      if (state.appearances && !state.appearances.includes(appearance)) continue
      stat(state)
      for (const width of (state.widths ?? [390, 1440]).filter(value => !onlyWidth || value === onlyWidth)) {
        const tab = tabs[state.account]
        const ctx = { tab, width, height: HEIGHTS[width] ?? 900, appearance, data, signOut: how => signOuts.add(how) }
        try {
          await state.open(ctx)
          // The SSR page of a production build is visible before it hydrates (README).
          if ((process.env.BASE_URL ?? '').includes(':3001')) await new Promise(resolve => setTimeout(resolve, 4000))
          if (!await measure({ tab, state, name: state.name, width, appearance, first: true })) continue
        }
        catch (error) {
          log.check(`[${state.group}/${state.name} ${width} ${appearance}] state not reached`, false, String(error.message).slice(0, 200))
          stat(state).fail++
          continue
        }
        for (const stop of state.stops ?? []) {
          if (stop.widths && !stop.widths.includes(width)) continue
          try {
            await stop.go(ctx)
            await measure({ tab, state, name: `${state.name}/${stop.name}`, width, appearance, first: false })
          }
          catch (error) {
            log.check(`[${state.group}/${state.name}/${stop.name} ${width} ${appearance}] state not reached`, false, String(error.message).slice(0, 200))
            stat(state).fail++
          }
        }
        writeSummary()
      }
    }
  }

  // A state with one Appearance only (the offline page follows the device, #398) has nothing to compare.
  for (const state of chosen.filter(entry => entry.appearances?.length === 1)) log.skip(`[${state.group}/${state.name}] Dunkel = System`, 'this page has one Appearance only')
  // Dunkel against System: the same page, element by element.
  for (const [id, dark] of readings) {
    const [name, width, appearance] = id.split('|')
    if (appearance !== 'dark') continue
    const where = `[${dark.state.group}/${name} ${width} dark/system]`
    const twin = readings.get(`${name}|${width}|system`)
    if (!twin) continue
    const differences = same(dark.items, twin.items)
    if (!differences.length) {
      log.check(`${where} Dunkel = System (${dark.items.length} elements)`, true)
      continue
    }
    const byChange = new Map()
    for (const difference of differences) {
      const id = JSON.stringify([difference.what, difference.dark, difference.system])
      byChange.set(id, [...(byChange.get(id) ?? []), difference])
    }
    for (const group of byChange.values()) {
      const texts = group.slice(0, 3).map(difference => label(difference.text, COPY, dark.state.static === true)).join(', ')
      log.check(`${where} Dunkel = System: ${group[0].what} ×${group.length} ${texts}`, false, `Dunkel ${group[0].dark}, System ${group[0].system}`)
      findings.lines.push({
        outcome: 'fail', why: null, fg: group[0].dark, bg: group[0].system, ratio: null, need: null, kind: `same-${group[0].what}`, role: group[0].role,
        texts: group.slice(0, 3).map(difference => label(difference.text, COPY, dark.state.static === true)), count: group.length, keys: group.map(difference => difference.key),
        state: name, group: dark.state.group, width: Number(width), appearance: 'both',
      })
      stat(dark.state).fail++
    }
  }
}
finally {
  // Light again for the next check: the dev Users were on Dunkel or System during the run.
  for (const tab of Object.values(tabs)) {
    try {
      await colorScheme(tab, 'light')
      await open(tab, '/impressum', 1440, 900)
    }
    catch (error) {
      log.note(`could not sign ${tab.account} in light again: ${String(error.message).slice(0, 100)}`)
    }
    pageErrors.push([tab.account, tab.errors.length])
  }
  closeAll(tabs)
}
for (const [account, count] of pageErrors) log.note(`${account}: ${count} page errors`)
log.note(`sign-out went by ${[...signOuts].join(' and ') || 'nothing (no signed-out state ran)'}`)
findings.seconds = Math.round((Date.now() - started) / 1000)
log.note(`took ${duration(findings.seconds)}`)
writeSummary()
process.exitCode = log.failed ? 1 : 0
