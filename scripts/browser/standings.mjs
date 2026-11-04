// The browser check of the Standings in motion (#276, spec #272, 04-motion § Leaderboard): the Dev Host enters Results by the API while
// the Dev Member's page is open and watching, and the Member's browser is sampled every frame. Class strings and jsdom proved nothing
// about the rows in 0.8 (the `dur-*` utility also set `animation-duration`, which made Vue's TransitionGroup skip every move, #273), so this
// measures what is drawn: the rows' transforms, the counted numbers, the pills, the stamp, the confetti, the live region.
// Usage: node scripts/browser/standings.mjs [--third] [--only=<name>[,<name>…]]
//   (needs pnpm dev and pnpm dev:realtime; one PASS or FAIL line per check, exit code 1 on any FAIL, screenshots to <tmp>/compies-browser/)
// A run is one Member setup on an Event the script creates: `phone-stage` and `phone-tab` (390 px, the Event view and the „Tabelle“ view),
// `desktop` (1440 px, the stage and the panel's „Tabelle“ tab side by side), each with full motion and with `data-motion="reduced"`, and
// `desktop-media` (1440 px with the OS setting `prefers-reduced-motion: reduce`). `--third` seats the Dev Admin as a third Party.
import { launch, shot, sleep } from './chrome.mjs'
import { api, BASE, clickText, createEvent, createGame, joinEvent, open } from './kit.mjs'

const stamp = Date.now().toString(36)
const third = process.argv.includes('--third')
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',')
const PARTIES = third ? 3 : 2
const TABLE = third ? [5, 2, 0] : [5, 0]

let failed = false
function check(name, passed, detail = '') {
  if (!passed) failed = true
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${passed || !detail ? '' : `  (${detail})`}`)
}
function skip(name, why) {
  console.log(`SKIP  ${name}  (${why})`)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// In the page: a recorder that writes down, every frame, what the Standings (and the Host's blocks and result sheet) look like.

const RECORDER = `(() => {
  if (window.__rec) return
  const rec = window.__rec = { on: false, frames: [], t0: 0, live: [], seen: new Map() }
  const matrix = value => { const m = /matrix\\(([^)]+)\\)/.exec(value); return m ? m[1].split(',').map(Number) : null }
  const ty = el => { const m = matrix(getComputedStyle(el).transform); return m ? m[5] : 0 }
  const region = () => [...document.querySelectorAll('p[role=status][aria-live=polite]')].find(p => !p.closest('[role=dialog]'))
  const where = tr => tr.closest('aside') ? 'panel' : tr.closest('section.shadow-card') ? 'stage' : 'tab'
  const rows = () => [...document.querySelectorAll('tr[data-team]')].map(tr => {
    const box = tr.getBoundingClientRect()
    const table = tr.closest('table').getBoundingClientRect()
    const cell = tr.querySelector('td:last-child')
    const pill = tr.querySelector('[data-delta]')
    const mark = tr.querySelector('[data-stamp]')
    const pm = pill && matrix(getComputedStyle(pill).transform)
    const sm = mark && matrix(getComputedStyle(mark).transform)
    return {
      box: where(tr), team: Number(tr.dataset.team), shown: box.width > 0, ty: ty(tr), top: box.top - table.top,
      rank: tr.querySelector('[data-rank]')?.textContent.trim(),
      digits: cell.querySelector('.font-num [aria-hidden]')?.textContent.trim(),
      say: cell.querySelector('.sr-only')?.textContent.trim(),
      bg: getComputedStyle(tr.querySelector('td')).backgroundColor,
      pill: pill && { text: pill.textContent.trim(), scale: pm ? pm[0] : 1, opacity: Number(getComputedStyle(pill).opacity) },
      stamp: mark && { text: mark.textContent.trim(), a: sm ? sm[0] : 1, b: sm ? sm[1] : 0, opacity: Number(getComputedStyle(mark).opacity) },
    }
  })
  const frame = () => {
    if (!rec.on) return
    const t = performance.now() - rec.t0
    for (const a of document.getAnimations()) {
      if (a.constructor.name !== 'CSSTransition' || a.transitionProperty !== 'transform') continue
      const target = a.effect.target
      const key = (target.closest('tr[data-team]')?.dataset.team ?? target.tagName) + ':' + a.transitionProperty
      if (!rec.seen.has(key)) rec.seen.set(key, { t, tag: target.tagName, team: target.dataset.team ?? null, property: a.transitionProperty, ...a.effect.getTiming() })
    }
    const blocks = document.querySelector('main .mx-auto')
    rec.frames.push({
      t, rows: rows(), confetti: document.querySelectorAll('.layer-confetti span').length, live: region()?.textContent.trim() ?? null,
      stageTop: document.querySelector('main section.shadow-card')?.getBoundingClientRect().top ?? null,
      sheet: [...document.querySelectorAll('ol[aria-label=Platzierung] > li')].map(ty),
      blocks: blocks ? [...blocks.children].map(ty) : [],
    })
    requestAnimationFrame(frame)
  }
  const watch = new MutationObserver(() => {
    const text = region()?.textContent.trim() ?? null
    if (rec.on && text !== rec.last) rec.live.push({ t: performance.now() - rec.t0, text })
    rec.last = text
  })
  watch.observe(document, { subtree: true, childList: true, characterData: true })
  rec.start = () => { rec.frames = []; rec.live = []; rec.seen = new Map(); rec.last = region()?.textContent.trim() ?? null; rec.t0 = performance.now(); rec.on = true; requestAnimationFrame(frame) }
  rec.stop = () => { rec.on = false; return { frames: rec.frames, live: rec.live, transitions: [...rec.seen.values()] } }
  rec.snapshot = () => rows()
  // The flag is a script of its own, added after this one: look for it once the document's first scripts have run.
  setTimeout(() => { if (window.__autoRec && !rec.on) rec.start() }, 0)
})()`

/** Installs the recorder in every document the tab loads from now on (and in the current one). */
async function installRecorder(tab) {
  await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER })
  await tab.evaluate(RECORDER)
}

/** Reloads the tab with the recorder running from the first moment of the document. */
async function reloadRecording(tab, path, width, height, waitFor, motion) {
  const { result } = await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__autoRec = true' })
  await open(tab, path, width, height, waitFor)
  await applyMotion(tab, motion)
  await tab.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: result.identifier })
}

async function applyMotion(tab, motion) {
  if (motion === 'reduced') await tab.evaluate(`document.documentElement.setAttribute('data-motion', 'reduced')`)
  if (motion === 'media') await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Reading the frames

const moving = value => Math.abs(value) > 0.5
const rowsOf = (frames, box) => frames.map(frame => ({ t: frame.t, rows: frame.rows.filter(row => row.box === box && row.shown) }))
const seriesOf = (frames, box, team) => rowsOf(frames, box).flatMap(frame => frame.rows.filter(row => row.team === team).map(row => ({ t: frame.t, ...row })))
const orderOf = rows => rows.slice().sort((a, b) => a.top - b.top).map(row => row.team)

/** The first frame in which the Member's page shows the news: a pill in the Leaderboard of `box`. */
const newsAt = (frames, box) => rowsOf(frames, box).find(frame => frame.rows.some(row => row.pill))?.t ?? null

/** How many times a number changed within any one second. */
function mostChangesInASecond(series) {
  const changes = series.filter((point, index) => index > 0 && point.digits !== series[index - 1].digits).map(point => point.t)
  return Math.max(0, ...changes.map(from => changes.filter(t => t >= from && t < from + 1000).length))
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The scenario

async function setUpEvent(host, member, admin, label) {
  const games = []
  for (let i = 1; i <= 5; i++) games.push(await createGame(host, { name: `Takt ${i} ${stamp}`, playersMin: 1, playersMax: 8 }))
  const { slug } = await createEvent(host, {
    name: `Tabelle in Bewegung ${label} ${stamp}`,
    settings: { format: 'teams', teamCount: PARTIES, teamSize: 1, gameCount: 6, pointsTable: { preset: 'custom', values: TABLE }, selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null, poolPreview: true },
    pools: { main: games.map(game => game.id) },
  })
  await joinEvent(member, slug, host)
  if (admin) await joinEvent(admin, slug, host)
  const seat = async (tab, team) => {
    const { viewerId } = (await api(tab, 'GET', `/api/e/${slug}`)).body
    const moved = await api(tab, 'POST', `/api/e/${slug}/move`, { userId: viewerId, to: { zone: 'team', team } })
    if (moved.status !== 200) throw new Error(`move answered ${moved.status}`)
  }
  await seat(host, 1)
  await seat(member, 2)
  if (admin) await seat(admin, 3)
  const started = await api(host, 'POST', `/api/e/${slug}/sessions/start`)
  if (started.status !== 200) throw new Error(`start answered ${started.status}: ${JSON.stringify(started.body)}`)
  const roundIds = []
  for (const game of games.slice(0, 4)) {
    const set = await api(host, 'POST', `/api/e/${slug}/rounds`, { gameId: game.id })
    if (set.status !== 200) throw new Error(`set game answered ${set.status}: ${JSON.stringify(set.body)}`)
    roundIds.push(set.body.roundId)
  }
  // Setting a game plays its clip for everybody, and the overlay would cover the Standings in the pictures.
  await api(host, 'POST', `/api/e/${slug}/clip/skip`)
  return { slug, roundIds }
}

/** The Places of a Result: `order` lists the Parties from Place 1 down. */
const placesOf = order => ({ places: order.map((team, index) => ({ team, place: index + 1 })) })

/** The sequence of steps: Results, then Corrections of Round 3 (twice), then one more Result that changes no rank. */
const STEPS = third
  ? [
      { label: 'Spiel 1 (die erste Tabelle)', round: 0, order: [2, 1, 3], kind: 'entered' },
      { label: 'Spiel 2 (Reihenfolge ändert sich)', round: 1, order: [3, 2, 1], kind: 'entered' },
      { label: 'Spiel 3', round: 2, order: [1, 3, 2], kind: 'entered' },
      { label: 'Korrektur von Spiel 3', round: 2, order: [2, 3, 1], kind: 'corrected' },
      { label: 'zweite Korrektur von Spiel 3', round: 2, order: [1, 3, 2], kind: 'corrected' },
      { label: 'Spiel 4 (kein Rang ändert sich)', round: 3, order: [1, 3, 2], kind: 'entered' },
    ]
  : [
      { label: 'Spiel 1 (die erste Tabelle)', round: 0, order: [2, 1], kind: 'entered' },
      { label: 'Spiel 2 (die Reihen tauschen)', round: 1, order: [1, 2], kind: 'entered' },
      { label: 'Spiel 3', round: 2, order: [1, 2], kind: 'entered' },
      { label: 'Korrektur von Spiel 3 (die Reihen tauschen)', round: 2, order: [2, 1], kind: 'corrected' },
      { label: 'zweite Korrektur von Spiel 3 (die Reihen tauschen zurück)', round: 2, order: [1, 2], kind: 'corrected' },
      { label: 'Spiel 4 (kein Rang ändert sich)', round: 3, order: [1, 2], kind: 'entered' },
    ]

async function enter(host, slug, roundId, order) {
  const answer = await api(host, 'PUT', `/api/e/${slug}/rounds/${roundId}/result`, placesOf(order))
  if (answer.status !== 200) throw new Error(`PUT result answered ${answer.status}: ${JSON.stringify(answer.body)}`)
  return answer.body
}

/** Records the Member's page across one Result entered by the Host (and, with `watchHost`, the Host's page too). */
async function record(member, host, run, { shotName = null, watchHost = false } = {}) {
  const before = await member.evaluate('window.__rec.snapshot()')
  if (watchHost) await host.evaluate('window.__rec.start()')
  await member.evaluate('window.__rec.start()')
  const started = Date.now()
  await run()
  const shots = []
  if (shotName) {
    // The pictures are timed from the news (the first pill on the Member's page), not from the request.
    let newsAtMs = null
    for (let i = 0; i < 100 && newsAtMs === null; i++) {
      if (await member.evaluate(`!!document.querySelector('[data-delta]')`)) newsAtMs = Date.now()
      else await sleep(30)
    }
    for (const offset of [700, 1500, 4500]) {
      await sleep(Math.max(0, offset - (Date.now() - (newsAtMs ?? started))))
      shots.push(await shot(member, `standings-${shotName}-${offset}ms`))
    }
  }
  // The news is made when the read comes (up to ~1 s after the PUT in a dev server), lasts 4 s and its pills fade for 140 ms.
  await sleep(Math.max(0, 6200 - (Date.now() - started)))
  const recorded = await member.evaluate('window.__rec.stop()')
  const hostRecorded = watchHost ? await host.evaluate('window.__rec.stop()') : null
  return { ...recorded, before, hostRecorded, shots }
}

/** The checks on one recorded Result, in one Leaderboard (`box`: stage, panel or tab). */
function checkResult(recorded, { box, motion, step, number, name }) {
  const { frames, before, live, transitions } = recorded
  const reduced = motion !== 'full'
  const at = newsAt(frames, box)
  const tag = `${name} / ${step.label}`
  if (at === null) return check(`${tag}: the news shows in the ${box}'s Leaderboard`, false, 'no pill in any frame')
  const after = rowsOf(frames, box).at(-1).rows
  const was = before.filter(row => row.box === box && row.shown)
  const first = rowsOf(frames, box).find(frame => frame.t >= at).rows
  const since = frames.filter(frame => frame.t >= at)
  // Before the first Result the page saw every Party at 0 on rank 1 (the news' `before`), whether or not a table was drawn.
  const rankBefore = team => was.find(item => item.team === team)?.rank ?? '1.'
  const gain = new Map(after.map(row => [row.team, Number(row.digits) - Number(was.find(item => item.team === row.team)?.digits ?? 0)]))

  // 1. The glide.
  const wasOrder = orderOf(was)
  const nowOrder = orderOf(after)
  const moved = nowOrder.filter(team => wasOrder.length > 0 && wasOrder.indexOf(team) !== nowOrder.indexOf(team))
  const still = nowOrder.filter(team => !moved.includes(team))
  if (!reduced && moved.length > 0) {
    const starts = []
    for (const team of moved) {
      const series = seriesOf(since, box, team)
      const place = after.find(row => row.team === team)
      const old = was.find(row => row.team === team)
      const offset = old.top - place.top
      const drawn = series.filter(point => moving(point.ty)).length
      check(`${tag}: ${box} row of Team ${team} glides (${drawn} frames off its place, at least 8)`, drawn >= 8, `frames ${drawn}`)
      check(`${tag}: ${box} row of Team ${team} starts at its old place`, Math.abs(series[0].ty - offset) <= 2, `first translateY ${series[0].ty.toFixed(1)}, old − new ${offset.toFixed(1)}`)
      const delay = nowOrder.indexOf(team) * 40
      const lastMoving = series.filter(point => moving(point.ty)).at(-1)
      check(`${tag}: ${box} row of Team ${team} is home within 700 ms + ${delay} ms`, lastMoving.t - at <= 700 + delay + 100, `${Math.round(lastMoving.t - at)} ms`)
      starts.push({ index: nowOrder.indexOf(team), t: series.find(point => Math.abs(point.ty - series[0].ty) > 0.5)?.t ?? null })
    }
    if (starts.length > 1) {
      const [early, late] = starts.sort((a, b) => a.index - b.index)
      check(`${tag}: ${box} rows stagger (the second starts ≥ 30 ms after the first)`, early.t !== null && late.t !== null && late.t - early.t >= 30, `${early.t === null || late.t === null ? 'no start' : Math.round(late.t - early.t)} ms`)
    }
    if (box === 'stage' || box === 'tab' || box === 'panel') {
      const found = transitions.filter(item => item.tag === 'TR' && moved.includes(Number(item.team)))
      check(`${tag}: getAnimations() lists a transform CSSTransition (600 ms, spring) on every moved ${box} row`, moved.every(team => found.some(item => Number(item.team) === team && item.duration === 600 && /1\.8/.test(item.easing))), JSON.stringify(found.map(item => [item.team, item.duration, item.easing])))
    }
  }
  if (still.length > 0 && wasOrder.length > 0) {
    const off = still.flatMap(team => seriesOf(since, box, team)).filter(point => Math.abs(point.ty) > 0.01).length
    check(`${tag}: ${box} rows that kept their place never move`, off === 0, `${off} frames with a transform`)
  }
  if (reduced) {
    const off = after.flatMap(row => seriesOf(frames, box, row.team)).filter(point => Math.abs(point.ty) > 0.01).length
    check(`${tag}: ${box} (reduced motion) no row has a transform in any frame`, off === 0, `${off} frames`)
  }

  // 2. The count-up.
  for (const row of after) {
    const old = Number(was.find(item => item.team === row.team)?.digits ?? 0)
    const final = Number(row.digits)
    const series = seriesOf(since, box, row.team)
    if (old === final) {
      check(`${tag}: ${box} Team ${row.team} keeps ${final} (+0)`, series.every(point => Number(point.digits) === final))
      continue
    }
    if (reduced) {
      const values = [...new Set(series.map(point => point.digits))]
      check(`${tag}: ${box} Team ${row.team} jumps ${old} → ${final}, no count in between`, values.length <= 2 && series[0].digits === String(final), `values ${values}`)
      continue
    }
    const middle = series.some(point => Number(point.digits) > Math.min(old, final) && Number(point.digits) < Math.max(old, final))
    const end = series.find(point => Number(point.digits) === final)?.t
    check(`${tag}: ${box} Team ${row.team} counts ${old} → ${final}`, series[0].digits === String(old) && series.at(-1).digits === String(final) && (Math.abs(final - old) < 3 || middle), `first ${series[0].digits}, last ${series.at(-1).digits}, passes between ${middle}`)
    check(`${tag}: ${box} Team ${row.team} changes at most 15 times a second, done within 800 ms`, mostChangesInASecond(series) <= 15 && end - at <= 800, `${mostChangesInASecond(series)} changes, done after ${Math.round(end - at)} ms`)
    check(`${tag}: ${box} Team ${row.team} reads the new points from the first frame (sr-only)`, new RegExp(`^${final} Punkte?$`).test(series[0].say), series[0].say)
  }

  // 3. Pill, stamp, confetti.
  for (const row of after) {
    const series = seriesOf(since, box, row.team)
    const gained = gain.get(row.team)
    const expected = gained < 0 ? `−${-gained}` : `+${gained}`
    check(`${tag}: ${box} Team ${row.team} shows its pill ${expected}`, first.find(item => item.team === row.team)?.pill?.text === expected, first.find(item => item.team === row.team)?.pill?.text)
    const peak = Math.max(...series.map(point => point.pill?.scale ?? 0))
    const settled = series.filter(point => point.t >= at + 1000 && point.t <= at + 3500 && point.pill).map(point => point.pill.scale)
    if (reduced) check(`${tag}: ${box} Team ${row.team} pill fades in without a scale`, peak <= 1.001 && series.some(point => point.pill && point.pill.opacity < 1), `peak scale ${peak.toFixed(2)}`)
    else check(`${tag}: ${box} Team ${row.team} pill pops past 1 (the 1.15 overshoot) and settles at 1`, peak > 1.02 && settled.length > 0 && settled.every(scale => Math.abs(scale - 1) < 0.02), `peak ${peak.toFixed(2)}, settled ${settled.length} frames`)
  }
  const late = since.filter(frame => frame.t >= at + 4400)
  const during = since.filter(frame => frame.t >= at + 3000 && frame.t <= at + 3800)
  const shownAt = frame => frame.rows.filter(row => row.box === box && row.shown && (row.pill || row.stamp)).length
  check(`${tag}: ${box} pills (and the stamp) are still there at ~3.5 s and gone by ~4.4 s`, during.length > 0 && during.every(frame => shownAt(frame) > 0) && late.length > 0 && late.every(frame => shownAt(frame) === 0), `at 3–3.8 s ${during.map(shownAt)}, after 4.4 s ${late.map(shownAt).slice(0, 3)}`)

  const stamps = box === 'stage' ? since.flatMap(frame => frame.rows.filter(row => row.box === 'stage' && row.stamp)) : []
  if (box === 'stage') {
    const lead = step.kind === 'entered' ? `Sieg in Spiel ${number}!` : `Spiel ${number} gewonnen`
    const rested = since.filter(frame => frame.t >= at + 1200 && frame.t <= at + 3500).flatMap(frame => frame.rows.filter(row => row.box === 'stage' && row.stamp).map(row => row.stamp))
    const winners = step.order[0]
    check(`${tag}: stage stamp „${lead}“ on the winner, rotated 8° at rest`, rested.length > 0 && rested.every(item => item.text === lead && Math.abs(item.a - Math.cos(Math.PI * 8 / 180)) < 0.01 && Math.abs(item.b - Math.sin(Math.PI * 8 / 180)) < 0.01), `winner Team ${winners}: ${JSON.stringify(rested[0])}`)
    if (reduced) {
      const opacities = stamps.map(item => item.stamp.opacity)
      check(`${tag}: stage stamp (reduced motion) fades in and never scales`, opacities.some(value => value < 1) && stamps.every(item => Math.abs(Math.hypot(item.stamp.a, item.stamp.b) - 1) < 0.01), `min opacity ${Math.min(...opacities).toFixed(2)}`)
    }
    else {
      const popped = stamps.some(item => Math.hypot(item.stamp.a, item.stamp.b) > 1.2)
      check(`${tag}: stage stamp comes in large (scale 2) and lands at 1`, popped, `max scale ${Math.max(...stamps.map(item => Math.hypot(item.stamp.a, item.stamp.b))).toFixed(2)}`)
    }
    const peak = Math.max(0, ...since.filter(frame => frame.t >= at + 560 && frame.t <= at + 1300).map(frame => frame.confetti))
    const after4 = since.filter(frame => frame.t >= at + 4000).map(frame => frame.confetti)
    if (reduced) check(`${tag}: no confetti piece ever (reduced motion)`, frames.every(frame => frame.confetti === 0), `max ${Math.max(...frames.map(frame => frame.confetti))}`)
    else check(`${tag}: confetti bursts 18 pieces after ~0.56 s and none are left after 4 s`, peak === 18 && after4.every(count => count === 0), `peak ${peak}, after 4 s ${Math.max(0, ...after4)}`)
  }
  else {
    check(`${tag}: ${box} has no stamp and no confetti`, frames.every(frame => frame.rows.filter(row => row.box === box).every(row => !row.stamp)) && (box !== 'tab' || frames.every(frame => frame.confetti === 0)))
  }

  // 4. The highlight (reduced motion): rows that changed rank tint and fade back within 300 ms, the others keep their colour.
  if (reduced) {
    const changed = after.filter(row => rankBefore(row.team) !== row.rank).map(row => row.team)
    for (const row of after) {
      const series = seriesOf(since, box, row.team)
      const base = series.at(-1).bg
      const tinted = series.filter(point => point.bg !== base && point.t <= at + 300)
      const back = series.filter(point => point.t >= at + 320).every(point => point.bg === base)
      if (changed.includes(row.team)) check(`${tag}: ${box} Team ${row.team} (rank changed) is highlighted and back within 300 ms`, tinted.length > 0 && back, `tinted ${tinted.length} frames, back ${back}`)
      else check(`${tag}: ${box} Team ${row.team} (rank kept) is not highlighted`, series.every(point => point.bg === base))
    }
  }

  // 8. The live region (once per page, the Member's, whichever Leaderboards are mounted).
  if (box === 'stage' || box === 'tab' || !frames.some(frame => frame.rows.some(row => row.box === 'stage'))) {
    const said = live.filter(item => item.text)
    const lead = step.kind === 'entered' ? `Spiel ${number} ist eingetragen.` : `Spiel ${number} wurde korrigiert. Die Tabelle ist neu berechnet.`
    const ranksMoved = after.some(row => rankBefore(row.team) !== row.rank)
    check(`${tag}: the live region reads the announcement exactly once`, said.length === 1 && said[0].text.startsWith(lead), JSON.stringify(said.map(item => item.text)))
    if (!ranksMoved && said[0]) check(`${tag}: a Result that moves no rank reads only the lead sentence`, said[0].text === lead, said[0].text)
    check(`${tag}: the live region is empty again after ~4 s`, frames.filter(frame => frame.t >= at + 4400).every(frame => frame.live === ''), JSON.stringify(frames.at(-1).live))
  }
}

/**
 * F4 of the s5 check (#276): when a Round's card leaves „Gerade dran“ the stage block's top moves by the card's height, and the page's group glides it
 * (a move transition) instead of jumping in one frame. Every entered Result is checked, not only the first: at 1440 the two-column grid loses a row once, on
 * the second. Full motion: at least 4 frames, and no frame carries more than 60 percent of the shift (the curve is steep, 25 to 35 percent in the first frame;
 * 60 leaves room for slow headless frames). Reduced motion: it jumps once, by design, in at most 1 frame. A step that moves the block in no frame (a Result
 * that leaves the Round count as it was) is not checked.
 */
function checkReflow(frames, { motion, step, name }) {
  const tops = frames.filter(frame => frame.stageTop !== null)
  const moves = tops.flatMap((frame, at) => (at > 0 && Math.abs(frame.stageTop - tops[at - 1].stageTop) > 1 ? [{ t: frame.t, delta: frame.stageTop - tops[at - 1].stageTop }] : []))
  if (moves.length === 0) return
  const total = moves.reduce((sum, move) => sum + move.delta, 0)
  const worst = Math.max(...moves.map(move => Math.abs(move.delta) / Math.abs(total)))
  const detail = `${moves.length} frame(s), the largest ${Math.round(worst * 100)} percent of ${Math.round(total)} px, over ${Math.round(moves.at(-1).t - moves[0].t)} ms: ${moves.slice(0, 8).map(move => `${Math.round(move.t)} ms ${Math.round(move.delta)} px`).join('; ')}`
  const tag = `${name} / ${step.label}`
  console.log(`INFO  ${tag}: the stage block's top moves in ${detail}`)
  if (motion === 'full') check(`${tag}: the stage block glides when the open Round's card leaves (at least 4 frames, none over 60 percent)`, moves.length >= 4 && worst <= 0.6, detail)
  else check(`${tag}: the stage block takes its place at once under reduced motion (at most 1 frame)`, moves.length <= 1, detail)
}

async function scenario({ name, width, view, motion }) {
  console.log(`\n== ${name} (${width} px, ${motion === 'full' ? 'full motion' : motion === 'reduced' ? 'data-motion=reduced' : 'prefers-reduced-motion'}) ==`)
  const host = await launch('host')
  const member = await launch('member')
  const admin = third ? await launch('admin') : null
  try {
    await open(host, '/bibliothek', 1440, 900)
    await open(member, '/', width, width < 600 ? 844 : 900)
    if (admin) await open(admin, '/', 1440, 900)
    const { slug, roundIds } = await setUpEvent(host, member, admin, name)
    console.log(`Event ${slug}`)

    await open(host, `/e/${slug}`, 1440, 900, 'main')
    await installRecorder(host)
    await open(member, `/e/${slug}`, width, width < 600 ? 844 : 900, 'main')
    await installRecorder(member)
    await applyMotion(member, motion)
    await applyMotion(host, motion === 'media' ? 'media' : 'full')
    await sleep(800)
    // The view the check watches: the phone's „Tabelle“ view, or the panel's „Tabelle“ tab on the wide screen.
    if (view === 'tab') await member.evaluate(`[...document.querySelectorAll('nav[aria-label="Event"] button')].find(b => b.textContent.includes('Tabelle')).click()`)
    if (view === 'desktop') await member.evaluate(`[...document.querySelectorAll('aside [role=tab]')].find(b => b.textContent.includes('Tabelle')).click()`)
    await sleep(500)
    await member.evaluate('window.__sameDocument = true')
    const boxes = view === 'tab' ? ['tab'] : view === 'desktop' ? ['stage', 'panel'] : ['stage']

    // 7. The regression guard for the CSS bug: the result sheet's rows glide on „Nach unten“ (they never ran before the fix).
    if (name === firstRun.name) {
      await clickText(host, 'main button', 'Ergebnis eintragen')
      await sleep(900)
      await host.evaluate('window.__rec.start()')
      await host.evaluate(`document.querySelector('ol[aria-label=Platzierung] button[data-move=down]').click()`)
      await sleep(1200)
      const sheet = (await host.evaluate('window.__rec.stop()')).frames.map(frame => frame.sheet)
      const lists = sheet.filter(list => list.length >= 2)
      const worst = [0, 1].map(index => lists.filter(list => moving(list[index])).length)
      check('Host: the result sheet\'s rows glide on „Nach unten“ (≥ 8 frames off their place, both rows)', worst.every(count => count >= 8), `frames per row ${worst}`)
      await host.evaluate(`document.querySelector('[role=dialog] button[aria-label="Schließen"]').click()`)
      await sleep(600)
    }

    for (const [index, step] of STEPS.entries()) {
      // Pictures of the first Result (the celebration) and of the first swap of rows.
      const shotName = index <= 1 ? `${name}-${index + 1}` : null
      const watchHost = index === 0 && name === firstRun.name
      const recorded = await record(member, host, () => enter(host, slug, roundIds[step.round], step.order), { shotName, watchHost })
      if (recorded.shots.length > 0) console.log(`screenshots: ${recorded.shots.join(', ')}`)
      const results = (await api(host, 'GET', `/api/e/${slug}`)).body.results
      const numberOf = results.find(result => result.roundId === roundIds[step.round])?.number ?? step.round + 1
      if (step.kind === 'entered' && boxes.includes('stage')) checkReflow(recorded.frames, { motion, step, name })
      for (const box of boxes) checkResult(recorded, { box, motion, step, number: numberOf, name })
      // 7. The Host's page group: the first Result adds the Standings block and the blocks below it move.
      if (watchHost) {
        const blocks = recorded.hostRecorded.frames.map(frame => frame.blocks)
        const widest = Math.max(...blocks.map(list => list.length))
        const moved = Array.from({ length: widest }, (_, position) => blocks.some(list => moving(list[position] ?? 0)))
        check('Host: the page\'s blocks glide when the Standings block appears (the page group\'s move transition)', moved.some(Boolean), `blocks that moved: ${moved.map((did, position) => `${position}:${did}`).join(' ')}`)
      }
    }
    check(`${name}: the Member's page was not reloaded`, await member.evaluate('window.__sameDocument === true'))

    // 5. Never on load: a reload, a fresh open, a switch of views and a hidden tab show the end state at once and play nothing.
    // `jumps`: how many times a number may change (0: it is final from the first frame; 1: it jumps once, a missed Result arriving, but never counts).
    const quiet = (frames, tag, jumps = 0) => {
      const rows = frames.flatMap(frame => frame.rows.filter(row => row.shown))
      const wrong = rows.filter(row => row.pill || row.stamp || Math.abs(row.ty) > 0.01)
      const changes = new Map()
      const last = new Map()
      for (const row of rows) {
        const key = `${row.box}:${row.team}`
        if (last.has(key) && last.get(key) !== row.digits) changes.set(key, (changes.get(key) ?? 0) + 1)
        last.set(key, row.digits)
      }
      const counted = [...changes.entries()].filter(([, count]) => count > jumps)
      check(`${name}: ${tag}: no pill, stamp, confetti or transform, and the numbers ${jumps === 0 ? 'are final from the first frame' : 'jump at most once'}`, rows.length > 0 && wrong.length === 0 && counted.length === 0 && frames.every(frame => frame.confetti === 0), `${rows.length} row samples, ${wrong.length} wrong, e.g. ${JSON.stringify(wrong[0])}; changing numbers ${JSON.stringify(counted)}`)
    }
    await reloadRecording(member, `/e/${slug}`, width, width < 600 ? 844 : 900, 'main', motion)
    if (view === 'tab') await member.evaluate(`[...document.querySelectorAll('nav[aria-label="Event"] button')].find(b => b.textContent.includes('Tabelle')).click()`)
    if (view === 'desktop') await member.evaluate(`[...document.querySelectorAll('aside [role=tab]')].find(b => b.textContent.includes('Tabelle')).click()`)
    await sleep(2500)
    quiet((await member.evaluate('window.__rec.stop()')).frames, 'a reload with all Results there')

    await member.evaluate('window.__rec.start()')
    if (width < 600) {
      const tabs = label => member.evaluate(`[...document.querySelectorAll('nav[aria-label="Event"] button')].find(b => b.textContent.includes(${JSON.stringify(label)})).click()`)
      await tabs('Aktivität')
      await sleep(400)
      await tabs('Tabelle')
    }
    else {
      const panelTab = label => member.evaluate(`[...document.querySelectorAll('aside [role=tab]')].find(b => b.textContent.includes(${JSON.stringify(label)})).click()`)
      await panelTab('Aktivität')
      await sleep(400)
      await panelTab('Tabelle')
    }
    await sleep(1800)
    quiet((await member.evaluate('window.__rec.stop()')).frames, 'switching between the views')

    // A tab nobody watches: a second tab in front hides the Member's; the Host enters a Result; the Member returns.
    const hiddenCheck = await hiddenTab(member, host, slug, roundIds)
    if (hiddenCheck.skipped) skip(`${name}: hidden tab`, hiddenCheck.skipped)
    else quiet(hiddenCheck.frames, `a tab that was hidden while ${hiddenCheck.how}, when the Host corrected a Result`, 1)

    check(`${name}: no page errors on the Host side`, host.errors.length === 0, host.errors.slice(0, 2).join(' | '))
    check(`${name}: no page errors on the Member side`, member.errors.length === 0, member.errors.slice(0, 2).join(' | '))
  }
  finally {
    host.close()
    member.close()
    admin?.close()
  }
}

/** The Member's tab is hidden while the Host corrects a Result; when it returns the news must not play. Tries a real second tab, then the page's own `visibilityState`. */
async function hiddenTab(member, host, slug, roundIds) {
  await member.evaluate('window.__rec.start()')
  let how = 'a second tab was in front'
  const target = await member.send('Target.createTarget', { url: 'about:blank' })
  const targetId = target.result?.targetId
  await member.send('Target.activateTarget', { targetId })
  await sleep(500)
  let hidden = await member.evaluate('document.visibilityState')
  if (hidden !== 'hidden') {
    how = 'the page said it was hidden (visibilityState overridden)'
    await member.evaluate(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')) })()`)
    hidden = await member.evaluate('document.visibilityState')
  }
  if (hidden !== 'hidden') return { skipped: 'the tab could not be hidden' }
  const last = STEPS.at(-1)
  await enter(host, slug, roundIds[2], last.order.slice().reverse())
  await sleep(1500)
  await member.evaluate(`delete document.visibilityState`)
  await member.send('Target.activateTarget', { targetId: (await member.send('Target.getTargets')).result.targetInfos.find(info => info.type === 'page' && info.url !== 'about:blank')?.targetId })
  await member.send('Target.closeTarget', { targetId })
  await member.evaluate(`document.dispatchEvent(new Event('visibilitychange'))`)
  await sleep(2500)
  return { frames: (await member.evaluate('window.__rec.stop()')).frames, how }
}

const RUNS = [
  { name: 'phone-stage', width: 390, view: 'stage', motion: 'full' },
  { name: 'phone-tab', width: 390, view: 'tab', motion: 'full' },
  { name: 'desktop', width: 1440, view: 'desktop', motion: 'full' },
  { name: 'phone-stage-reduced', width: 390, view: 'stage', motion: 'reduced' },
  { name: 'phone-tab-reduced', width: 390, view: 'tab', motion: 'reduced' },
  { name: 'desktop-reduced', width: 1440, view: 'desktop', motion: 'reduced' },
  { name: 'desktop-media', width: 1440, view: 'desktop', motion: 'media' },
].filter(run => !only || only.includes(run.name))
const firstRun = RUNS[0]

console.log(`${BASE}, ${PARTIES} Parties, table ${TABLE}`)
try {
  for (const run of RUNS) await scenario(run)
}
catch (error) {
  failed = true
  console.log(`FAIL  the check itself broke: ${error.stack ?? error}`)
}
process.exit(failed ? 1 : 0)
