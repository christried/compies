// The Event page's states of the Dunkel-Check (#408, spec #398 § Dark in the app): the Date poll, Team choice, a Running Session
// with its wheel, Veto window, Clip, Rounds, Standings, Coin flip and Countdown, and the finished page with its Award ceremony
// and Share sheet, each as the Dev Host at 1440 px and as a Player (the Dev Member) at 390 px. `dark.mjs` documents the State
// shape every `dark-states-*.mjs` file exports. The Events are made through the API (the kit's scenarios), named
// `R011 Dunkel-Check <kind>` so that `label()` names their texts, and deleted at the end of every pass and of the run: Home
// (the `home` state of `dark-states-app.mjs`) lists the Dev Host's Events and must look the same in both passes.
// What changes with time or by being used (the Veto window, the Clip) is made fresh in every `open`; the rest is made once per
// pass and read by both viewers. Nothing is hovered or pressed beyond what opens a sheet (#406).
// 0.12's states (#448): the board with a Team word (`teamwahl-wort`), the feed with a named team and a Tie (`aktivitaet`), the game tiles
// and their dialog (`spiel-rad`, `spiel-pool`), the picker's Notes (`picker-notizen`) and the finished page before its ceremony (`fertig-offen`).
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUT, sleep } from './chrome.mjs'
import { api, BASE, clickText, createEvent, createGame, enterResult, eventView, finishedEvent, inDays, joinEvent, loaded, ok, open, placesOf, runningEvent } from './kit.mjs'

const COPY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/de.json'), 'utf8'))
const run = process.argv.slice(2).find(arg => arg.startsWith('--run='))?.slice('--run='.length) ?? 'dark'
const PREFIX = 'R011 Dunkel-Check '
/** The Coin flip's lead and flight (`shared/coin.ts`), plus a second. */
const COIN_WAIT_MS = 1500 + 3600 + 1000

/** A NOTE line in the run's results.log, like `log.note` writes it (the runner owns the log, a state file has no handle on it). */
function note(text) {
  console.log(`NOTE  ${text}`)
  appendFileSync(join(OUT, run, 'results.log'), `NOTE  ${text}\n`)
}

/** Polls a page expression until it is true, at most `ms`. */
async function until(tab, expression, what, ms = 10_000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await tab.evaluate(expression).catch(() => false)) return
    await sleep(200)
  }
  throw new Error(`${what} never came`)
}

/**
 * Waits at most 5 s until nothing on the page is loading (the Activity feed and the Share image load after mount), then until every
 * element's opacity is the same in two samples 300 ms apart, at most 3 s more: a card that fades in by script (the wheel's „Zuletzt gezogen“)
 * is no CSS animation, which the runner's settle would wait for, and read half drawn in one Appearance it is a „missing“ difference.
 */
async function quiet(tab) {
  for (const end = Date.now() + 5000; Date.now() < end && await tab.evaluate(`!!document.querySelector('[aria-busy="true"], .animate-pulse')`);) await sleep(150)
  const opacities = () => tab.evaluate(`[...document.body.querySelectorAll('*')].map(el => getComputedStyle(el).opacity).join()`)
  for (let before = await opacities(), end = Date.now() + 3000; Date.now() < end;) {
    await sleep(300)
    const after = await opacities()
    if (after === before) break
    before = after
  }
  await sleep(300)
}

/** The accounts that have signed in during this run: the others are signed in once, by their first `park`. */
const signedIn = new Set()
async function signIn(ctx, account) {
  if (signedIn.has(account)) return
  await open(ctx.tabs[account], '/impressum', 1440, 900, 'body', { appearance: ctx.appearance })
  signedIn.add(account)
}

/**
 * The accounts that are not the state's own wait on a page without a socket: they stay signed in for the API, and an Event page
 * of theirs would hold a socket, which turns presence dots on in one reading and off in the other.
 */
async function park(ctx, own) {
  for (const account of ['host', 'member', 'admin']) {
    if (account === own) continue
    if (!signedIn.has(account)) {
      await signIn(ctx, account)
      continue
    }
    await ctx.tabs[account].send('Page.navigate', { url: `${BASE}/impressum` })
    await loaded(ctx.tabs[account])
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The data

/** The Dev Host's Events named `R011 Dunkel-Check <kind>` are ended and deleted (the runner's own `R011 Dunkel-Check` has no space after). */
async function purge(host) {
  const { events } = await ok(api(host, 'GET', '/api/e'), 'GET /api/e')
  for (const event of events.filter(entry => entry.name.startsWith(PREFIX) && entry.isHost)) {
    await api(host, 'POST', `/api/e/${event.slug}/sessions/end`)
    await api(host, 'DELETE', `/api/e/${event.slug}`)
  }
}

let library
/** The games of the pools: `R011 Dunkel-Check Spiel 2` … `Spiel 12` (60 s clip, no video; Spiel 2 with a Game note), found by name or made once. */
function games(ctx) {
  library ??= (async () => {
    const host = ctx.tabs.host
    const known = (await ok(api(host, 'GET', '/api/games'), 'GET /api/games')).games
    const found = []
    for (let n = 2; n <= 12; n++) {
      const name = `${PREFIX}Spiel ${n}`
      found.push(known.find(game => game.name === name) ?? await createGame(host, { name, playersMin: 1, playersMax: 8, clipLength: 60, ...(n === 2 ? { notes: 'R011 Dunkel-Check Notiz' } : {}) }))
    }
    return [...found, ctx.data.game]
  })()
  return library
}

let featured
/**
 * The two games of the dialog states (#443, #444), found by name or made once: both with Notes (line breaks) and Tags, A with a Price (Steam, 19,99 €) and 8 Tags,
 * B without a Price and with 5 Tags. A game with no Price gets the Tag „Free-to-play“ from the server (#423), so B has room for it.
 */
function dialogGames(ctx) {
  featured ??= (async () => {
    const host = ctx.tabs.host
    const known = (await ok(api(host, 'GET', '/api/games'), 'GET /api/games')).games
    const fields = { playersMin: 2, playersMax: 6, clipLength: 60, suitabilities: ['teams', 'one_v_one'] }
    const specs = [
      { name: `${PREFIX}Spiel Dialog A`, notes: 'R011 Dunkel-Check Notiz A\nZweite Zeile der Notiz', tags: ['Koop', 'Schnell', 'Chaos', 'Party', 'Geschicklichkeit', 'Rätsel', 'Rennen', 'Strategie'], price: { cents: 1999, source: 'steam' } },
      { name: `${PREFIX}Spiel Dialog B`, notes: 'R011 Dunkel-Check Notiz B', tags: ['Koop', 'Schnell', 'Chaos', 'Party', 'Rätsel'] },
    ]
    return Promise.all(specs.map(async spec => known.find(game => game.name === spec.name) ?? createGame(host, { ...fields, ...spec })))
  })()
  return featured
}

/** A pool of `n` games in a fixed order, so both Appearances draw the same DOM; `long` swaps the second for the 60-character game. */
async function pool(ctx, n, { long = false } = {}) {
  const list = (await games(ctx)).slice(0, n)
  if (long) list.splice(n === 1 ? 0 : 1, 1, ctx.data.longGame)
  return list
}

/** What has been made in this pass, by key; a new Appearance is a new pass: the Events of the last one are deleted first. */
const memo = new Map()
let pass = null
async function made(ctx, key, build) {
  if (pass !== ctx.appearance) {
    await purge(ctx.tabs.host)
    memo.clear()
    pass = ctx.appearance
  }
  if (!memo.has(key)) memo.set(key, build(ctx))
  return memo.get(key)
}

const host = ctx => ctx.tabs.host
const member = ctx => ctx.tabs.member
const admin = ctx => ctx.tabs.admin

/** The Dev Host and the Dev Member as two Parties, the Session started, `set` pool games set. `settings` go over the scenario's. */
async function running(ctx, kind, { n = 4, long = false, settings = {}, set = 0, list } = {}) {
  await signIn(ctx, 'member')
  const given = list ?? await pool(ctx, n, { long })
  // The Game count leaves room for the Vetoes, so only `pool-warnung` shows the Host's pool warning.
  return runningEvent([host(ctx), member(ctx)], { name: `${PREFIX}${kind}`, pool: given, settings: { gameCount: Math.max(given.length - 2 * (settings.vetoAllowance ?? 0), 1), ...settings }, set })
}

const WHEEL = { selectionMode: 'lucky_wheel' }
let pickerNoted = false

/** The Results of the Rounds, in order: `[round index, order of the Parties from Place 1]`. */
async function results(ctx, event, entries) {
  for (const [index, order] of entries) await enterResult(host(ctx), event.slug, event.roundIds[index], placesOf(order))
}

/** Waits until an instant (ISO) has passed on this machine's clock, plus `extra` ms. */
const passed = async (iso, extra = 500) => sleep(Math.max(0, Date.parse(iso) - Date.now()) + extra)

/** A Round drawn by the wheel: its spin waited out (the stop) and its clip skipped. */
async function spun(ctx, slug) {
  await ok(api(host(ctx), 'POST', `/api/e/${slug}/rounds/spin`), 'spin the wheel')
  await passed((await eventView(host(ctx), slug)).wheel.spin.stopAt)
  await api(host(ctx), 'POST', `/api/e/${slug}/clip/skip`)
}

/** The Award ceremony started and over, so a page load does not open the layer by itself and „Siegerehrung ansehen“ is offered. */
async function ceremonyOver(ctx, slug) {
  await ok(api(host(ctx), 'POST', `/api/e/${slug}/ceremony`), 'start the ceremony')
  await passed((await eventView(host(ctx), slug)).ceremony.endsAt)
}

/** The Event of each `key`: the poll, the dated Event, Team choice, a Running Session in its situations, the finished pages. */
const BUILDS = {
  async poll(ctx) {
    await signIn(ctx, 'member')
    await signIn(ctx, 'admin')
    const given = await pool(ctx, 3)
    const { slug } = await createEvent(host(ctx), { name: `${PREFIX}Terminumfrage`, slots: [inDays(10), inDays(12, '20:00'), inDays(14, '18:30')], pool: given.map(game => game.id) })
    await joinEvent(member(ctx), slug, host(ctx))
    await joinEvent(admin(ctx), slug, host(ctx))
    const { slots } = await eventView(host(ctx), slug)
    const vote = (tab, index, value, extra = {}) => ok(api(tab, 'PUT', `/api/e/${slug}/slots/${slots[index].id}/vote`, { value, ...extra }), 'vote')
    await vote(host(ctx), 0, 'yes')
    await vote(host(ctx), 1, 'maybe')
    await vote(host(ctx), 2, 'no')
    await vote(member(ctx), 0, 'yes', { note: 'R011 Dunkel-Check Notiz' })
    await vote(member(ctx), 1, 'yes')
    await vote(member(ctx), 2, 'no')
    await vote(admin(ctx), 0, 'maybe')
    return { slug }
  },
  async datiert(ctx) {
    await signIn(ctx, 'member')
    const given = await pool(ctx, 3)
    const { slug } = await createEvent(host(ctx), { name: `${PREFIX}Termin steht`, slots: [inDays(10)], pool: given.map(game => game.id) })
    await joinEvent(member(ctx), slug, host(ctx))
    const { slots } = await eventView(host(ctx), slug)
    await ok(api(host(ctx), 'POST', `/api/e/${slug}/confirm`, { slotId: slots[0].id }), 'confirm the Date')
    return { slug }
  },
  async teamwahl(ctx) {
    await signIn(ctx, 'member')
    await signIn(ctx, 'admin')
    const given = await pool(ctx, 3)
    const { slug } = await createEvent(host(ctx), { name: `${PREFIX}Teamwahl`, settings: { teamCount: 2, teamSize: 3 }, pool: given.map(game => game.id) })
    await joinEvent(member(ctx), slug, host(ctx))
    await joinEvent(admin(ctx), slug, host(ctx))
    const place = async (tab, to) => ok(api(tab, 'POST', `/api/e/${slug}/move`, { userId: (await eventView(tab, slug)).viewerId, to }), 'move')
    // The Member and the Admin stay on the Stands: a joiner lands there (#437), and a move to the place one is at answers 409 already_there.
    await place(host(ctx), { zone: 'team', team: 1 })
    return { slug }
  },
  // The board with a Team word (#437, #439): the Host and the Member in team 1, the Member's word names it (the Member's band is folded to the name
  // with its pencil, the Host's has the reset), the Admin on the Stands, team 2 empty.
  async 'teamwahl-wort'(ctx) {
    await signIn(ctx, 'member')
    await signIn(ctx, 'admin')
    const given = await pool(ctx, 3)
    const { slug } = await createEvent(host(ctx), { name: `${PREFIX}Teamwort`, settings: { teamCount: 2, teamSize: 3 }, pool: given.map(game => game.id) })
    await joinEvent(member(ctx), slug, host(ctx))
    await joinEvent(admin(ctx), slug, host(ctx))
    for (const tab of [host(ctx), member(ctx)]) await ok(api(tab, 'POST', `/api/e/${slug}/move`, { userId: (await eventView(tab, slug)).viewerId, to: { zone: 'team', team: 1 } }), 'move')
    await ok(api(member(ctx), 'POST', `/api/e/${slug}/team-word`, { word: 'Gurkensalat' }), 'give a Team word')
    return { slug }
  },
  // Three Parties of one Player (the Host, the Member, the Admin): the Member's and the Admin's words name teams 2 and 3 (the Host never writes a word, so team 1
  // keeps its colour), three Games in turn win, a Tie as the Finish, the ceremony over. The feed has a named team's TeamMark in its entries and the Tie
  // entry (#440, #445). The words come before the Finish: a word after it is refused (#438).
  async aktivitaet(ctx) {
    await signIn(ctx, 'member')
    await signIn(ctx, 'admin')
    const tabs = [host(ctx), member(ctx), admin(ctx)]
    const event = await runningEvent(tabs, { name: `${PREFIX}Aktivitaet`, pool: await pool(ctx, 3), settings: { gameCount: 3 }, set: 3 })
    await ok(api(member(ctx), 'POST', `/api/e/${event.slug}/team-word`, { word: 'Gurkensalat' }), 'give a Team word')
    await ok(api(admin(ctx), 'POST', `/api/e/${event.slug}/team-word`, { word: 'Spaghettieis' }), 'give a Team word')
    for (const [index, roundId] of event.roundIds.entries()) await enterResult(host(ctx), event.slug, roundId, placesOf([1, 2, 3].map((_, i) => [1, 2, 3][(i + index) % 3])))
    await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/finish`, { outcome: 'tie', winners: [1, 2, 3] }), 'finish the Event')
    await ceremonyOver(ctx, event.slug)
    return event
  },
  // A set game (A, the Round „Gerade dran“) and the one the Wheel then draws (B, „Zuletzt gezogen“): both with Tags and Notes, A with a Price and B without (#435, #443, #444).
  async 'spiel-rad'(ctx) {
    const [a, b] = await dialogGames(ctx)
    const event = await running(ctx, 'Spiel Rad', { list: [a, b], settings: { ...WHEEL, vetoAllowance: 0, gameCount: 2 }, set: 1 })
    await spun(ctx, event.slug)
    return event
  },
  // The pool's tiles with a third game left over, nothing drawn yet.
  async 'spiel-pool'(ctx) {
    const [a, b] = await dialogGames(ctx)
    return running(ctx, 'Spiel Pool', { list: [a, b, (await pool(ctx, 3))[2]], settings: { ...WHEEL, vetoAllowance: 0, gameCount: 3 } })
  },
  // The Host's „Nächstes Spiel setzen“ with Spiel 2 (a game with Notes) in the pool.
  'picker': ctx => running(ctx, 'Picker', { n: 3, settings: { gameCount: 3 } }),
  // The finished page before the Award ceremony: no `ceremonyOver`, so the Host's dock offers „Siegerehrung starten“ and a Member has the card (#445).
  async 'fertig-offen'(ctx) {
    await signIn(ctx, 'member')
    return finishedEvent([host(ctx), member(ctx)], { name: `${PREFIX}Fertig offen`, outcome: 'winner', pool: await pool(ctx, 3) })
  },
  // The Lucky Wheel before a Draw (8 games, one of them the 60-character name), with 1 game, and after a Draw with 1 and with 0 games left.
  'rad-vorher': ctx => running(ctx, 'Rad vorher', { n: 8, long: true, settings: { ...WHEEL, vetoAllowance: 1 } }),
  'rad-eins': ctx => running(ctx, 'Rad eins', { n: 1, settings: { ...WHEEL, vetoAllowance: 1, gameCount: 1 } }),
  async 'rad-nachher'(ctx) {
    // The draw is random: both games are without Game notes, so either one draws the same page (a Round of the notes game has a „Notizen“ disclosure).
    const [, plain] = await pool(ctx, 3)
    const event = await running(ctx, 'Rad nachher', { list: [plain, ctx.data.longGame], settings: { ...WHEEL, vetoAllowance: 0 } })
    await spun(ctx, event.slug)
    return event
  },
  async 'rad-leer'(ctx) {
    const event = await running(ctx, 'Rad leer', { n: 1, settings: { ...WHEEL, vetoAllowance: 0 } })
    await spun(ctx, event.slug)
    return event
  },
  // A set draw stops at its commit: the Veto window (60 s) opens at once, no spin is waited for.
  async veto(ctx) {
    const event = await running(ctx, 'Veto', { n: 4, settings: { ...WHEEL, vetoAllowance: 1 } })
    await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/rounds`, { gameId: event.games[0].id, vetoAllowed: true }), 'set a game with a Veto window')
    await api(host(ctx), 'POST', `/api/e/${event.slug}/clip/skip`)
    return event
  },
  // The Clip of a 60 s game without a video runs 60 s from the draw's stop: no skip.
  async clip(ctx) {
    const event = await running(ctx, 'Clip', { n: 4, settings: { ...WHEEL, vetoAllowance: 0 } })
    await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/rounds`, { gameId: event.games[0].id }), 'set a game')
    return event
  },
  'runde': ctx => running(ctx, 'Runde', { n: 7, long: true, settings: { ...WHEEL, vetoAllowance: 1 }, set: 1 }),
  async tabelle(ctx) {
    const event = await running(ctx, 'Tabelle', { n: 4, set: 2 })
    await results(ctx, event, [[0, [1, 2]]])
    return event
  },
  async muenze(ctx) {
    const event = await running(ctx, 'Muenze', { n: 3 })
    await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/coin`), 'toss the coin')
    await sleep(COIN_WAIT_MS)
    return event
  },
  async 'countdown-laeuft'(ctx) {
    const event = await running(ctx, 'Countdown laeuft', { n: 3 })
    await ok(api(host(ctx), 'PUT', `/api/e/${event.slug}/countdown`, { seconds: 5999 }), 'set the Countdown')
    await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/countdown/start`), 'start the Countdown')
    return event
  },
  async 'countdown-zeit-um'(ctx) {
    const event = await running(ctx, 'Countdown zeit um', { n: 3 })
    await ok(api(host(ctx), 'PUT', `/api/e/${event.slug}/countdown`, { seconds: 5 }), 'set the Countdown')
    await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/countdown/start`), 'start the Countdown')
    await sleep(6500)
    return event
  },
  // Two Games, the same points for both Parties: a Tie, not finished.
  async gleichstand(ctx) {
    const event = await running(ctx, 'Gleichstand', { n: 2, settings: { gameCount: 2 }, set: 2 })
    await results(ctx, event, [[0, [1, 2]], [1, [2, 1]]])
    return event
  },
  // 6 Games to play, 3 in the pool, one set: the Host's pool warning.
  'pool': ctx => running(ctx, 'Pool', { n: 3, settings: { gameCount: 6 }, set: 1 }),
  async fertig(ctx) {
    await signIn(ctx, 'member')
    const event = await finishedEvent([host(ctx), member(ctx)], { name: `${PREFIX}Fertig`, outcome: 'winner', pool: await pool(ctx, 3) })
    await ceremonyOver(ctx, event.slug)
    return event
  },
  async 'fertig-gleichstand'(ctx) {
    await signIn(ctx, 'member')
    await signIn(ctx, 'admin')
    const event = await finishedEvent([host(ctx), member(ctx), admin(ctx)], { name: `${PREFIX}Fertig gleichauf`, outcome: 'tie', pool: await pool(ctx, 3) })
    await ceremonyOver(ctx, event.slug)
    return event
  },
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Opening and closing what a stop opens

/** The sheet or dialog that is open goes away by its own button (the focus is on the page after a reading, so Escape would not reach it). */
async function closeLayer(tab) {
  const layer = `document.querySelector('[role=dialog], [role=menu]')`
  if (!await tab.evaluate(`!!${layer}`)) return
  const closed = await tab.evaluate(`(() => {
    const layer = ${layer}
    if (layer.getAttribute('role') === 'menu') { document.querySelector('[role=toolbar] button[aria-haspopup=menu]')?.click(); return true }
    const button = [...layer.querySelectorAll('button')].find(b => [${JSON.stringify(COPY.common.close)}, ${JSON.stringify(COPY.common.cancel)}].some(text => b.getAttribute('aria-label') === text || b.textContent.trim() === text))
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!closed) throw new Error('a layer is open and has no close button')
  await until(tab, `!document.querySelector('[role=dialog], [role=menu]')`, 'the layer to close')
  await sleep(300)
}

/** One click on a visible button, by its text or aria-label. */
async function press(tab, selector, text) {
  if (!await clickText(tab, selector, text)) throw new Error(`no ${selector} „${text}“ on the page`)
}

const dock = (tab, label) => press(tab, '[role=toolbar] button', label)

/** An entry of the dock's „Mehr“ menu, which opens first. */
async function moreEntry(tab, label) {
  await press(tab, '[role=toolbar] button[aria-haspopup=menu]', COPY.dock.more)
  await until(tab, `!!document.querySelector('[role=menu]')`, 'the Mehr menu')
  await sleep(300)
  await press(tab, '[role=menuitem]', label)
}

/** A sheet or dialog is open. */
const layerOpen = (tab, what) => until(tab, `!!document.querySelector('[role=dialog]')`, what).then(() => sleep(400))

/** A success or info toast leaves after 4 s, shorter than a reading: a delay of exactly 4000 ms is never scheduled from now on (an error toast stays by itself). */
const keepToasts = tab => tab.evaluate(`(() => {
  if (window.__toastsKept) return
  window.__toastsKept = true
  const real = window.setTimeout
  window.setTimeout = (fn, ms, ...rest) => (ms === 4000 ? 0 : real(fn, ms, ...rest))
})()`)

const toastShown = (tab, text) => until(tab, `[...document.querySelectorAll('[role=status], [role=alert]')].some(el => el.textContent.includes(${JSON.stringify(text)}))`, `the toast „${text}“`).then(() => sleep(300))

/**
 * The name button of the game tile named \`game\` in the block under the heading or label \`anchor\` („Gerade dran“, „Zuletzt gezogen“, „Spielepool“),
 * pressed: the nearest ancestor of the anchor that holds such a button. The same game's tile is on the page in more than one block (#435).
 */
async function openTile(tab, anchor, game) {
  const pressed = await tab.evaluate(`(() => {
    const seen = el => el.getBoundingClientRect().width > 0
    const label = [...document.querySelectorAll('h2, h3, p')].find(el => seen(el) && el.textContent.trim() === ${JSON.stringify(anchor)})
    for (let block = label?.parentElement; block; block = block.parentElement) {
      const button = [...block.querySelectorAll('button')].find(el => seen(el) && el.textContent.includes(${JSON.stringify(game)}))
      if (!button) continue
      button.scrollIntoView({ block: 'center', behavior: 'instant' })
      button.click()
      return true
    }
    return false
  })()`)
  if (!pressed) throw new Error(`no tile „${game}“ under „${anchor}“`)
}

/** The library in a picker has a sentinel that loads the next 40 cards while the reader scrolls: it goes, so only the first batch of the 1598 games is read. */
const noAutoLoad = tab => tab.evaluate(`document.querySelectorAll('div[aria-hidden="true"].h-px').forEach(el => el.remove())`)

/** `navigator.clipboard.writeText` answers as `outcome` says. */
const clipboard = (tab, outcome) => tab.evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => ${outcome === 'ok' ? 'Promise.resolve()' : 'Promise.reject(new Error("denied"))'} } })`)

// ---------------------------------------------------------------------------------------------------------------------------------
// States

/**
 * One page state as the two viewers: `<name>-host` (the Dev Host, 1440 px) and `<name>-spieler` (the Dev Member, 390 px).
 * `key` and `build` make the Event once per pass; `fresh: true` makes it again in every `open` (a window or a clip that ends).
 * `hostStops` and `spielerStops` are the stops of each viewer, `hostWidths` the Host's widths (default 1440 only), `only` leaves one of them out, `prepare(ctx)` runs after the page
 * is quiet, `after(ctx)` after the Spieler's read, the last of the pair.
 */
function pair({ name, group, key = name, fresh = false, waitFor = 'h1', hostStops = [], spielerStops = [], hostWidths = [1440], only, viewport, differs, stillHolds, prepare, after }) {
  const sides = [
    { suffix: 'host', account: 'host', widths: hostWidths, stops: hostStops },
    { suffix: 'spieler', account: 'member', widths: [390], stops: spielerStops },
  ]
  return sides.filter(side => !only || only === side.suffix).map(side => ({
    name: `${name}-${side.suffix}`,
    group,
    account: side.account,
    widths: side.widths,
    ...(viewport ? { viewport } : {}),
    ...(differs ? { differs } : {}),
    async open(ctx) {
      ctx.event = fresh ? await BUILDS[key](ctx) : await made(ctx, key, BUILDS[key])
      await park(ctx, side.account)
      await open(ctx.tab, `/e/${ctx.event.slug}`, ctx.width, ctx.height, waitFor, { appearance: ctx.appearance })
      await quiet(ctx.tab)
      await prepare?.(ctx)
    },
    ...(stillHolds ? { stillHolds } : {}),
    ...(after && side.suffix === 'spieler' ? { after } : {}),
    stops: side.stops,
  }))
}

/** A stop closes what the last one opened, then goes on; `keep`: it works inside that layer (the Invite sheet's two toasts). */
const stop = (name, go, { keep = false, ...rest } = {}) => ({
  name,
  async go(ctx) {
    if (!keep) {
      await closeLayer(ctx.tab)
      // An error toast stays until dismissed: it would be in every later reading.
      await ctx.tab.evaluate(`document.querySelectorAll('[role=alert] button, [role=status] button').forEach(button => button.click())`)
    }
    await go(ctx.tab, ctx)
  },
  ...rest,
})

/** A window or a clip of 60 s that has less than 2 s left or is gone was not what the reading showed. */
const stillRunning = (what, endOf) => async (ctx) => {
  const end = endOf(await eventView(ctx.tabs.host, ctx.event.slug))
  if (!end) throw new Error(`${what} was gone`)
  const left = Date.parse(end) - Date.now()
  note(`${what} ${ctx.width === 1440 ? 'host' : 'spieler'} ${ctx.appearance}: ${(left / 1000).toFixed(1)} s of 60 left after the reading`)
  if (left < 2000) throw new Error(`${what} had ${Math.round(left / 1000)} s left`)
}

/** Both viewers of a finished page: the Share sheet with its picture, then the ceremony's end frame, replayed for this viewer only. */
const finishedStops = key => [
  stop('teilen', async (tab) => {
    await press(tab, 'button', COPY.share.open)
    await layerOpen(tab, 'the Share sheet')
    // The server draws the real PNG, up to several seconds on a cold dev server.
    await until(tab, `(() => { const img = document.querySelector('[role=dialog] img[src^="blob:"]'); return !!img && img.complete && img.naturalWidth > 0 })()`, 'the Share image', 40_000)
    await sleep(300)
  }),
  stop('siegerehrung', async (tab) => {
    await press(tab, 'button', COPY.ceremony.watch)
    await layerOpen(tab, `the ceremony of ${key}`)
    // The end frame stands: the share buttons are in and nothing in the layer plays a run that ends (`ceremonyTimeline(…).endMs`, a few seconds).
    await until(tab, `(() => {
      const layer = document.querySelector('[role=dialog]')
      const share = layer?.querySelector('[data-part="share"]')
      const button = share?.querySelector('button')
      if (!button || !(button.getBoundingClientRect().width > 0)) return false
      return !layer.getAnimations({ subtree: true }).some(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().iterations ?? 1))
    })()`, 'the ceremony end frame', 40_000)
    await sleep(500)
  }),
]

/** Ends the Sessions and deletes the Events this file made on the dev database (the runner calls it last, and `after` of the last state at the end of a pass). */
export async function cleanup({ tabs }) {
  await purge(tabs.host)
}

export const STATES = [
  // event-poll ---------------------------------------------------------------------------------------------------------------------
  ...pair({
    name: 'poll',
    group: 'event-poll',
    hostStops: [
      // The Host's „Termin festlegen“ with the Best slot selected; never confirmed.
      stop('termin-festlegen', async (tab) => {
        await dock(tab, COPY.dock.setDate)
        await layerOpen(tab, 'the Date dialog')
      }),
      stop('termine-bearbeiten', async (tab) => {
        await moreEntry(tab, COPY.mvp.slots.title)
        await layerOpen(tab, 'the Slots sheet')
      }),
    ],
  }),
  // A press on a Vote that the server refuses: the Vote rolls back with the error toast, which stays until dismissed.
  ...pair({
    name: 'abstimmung-fehler',
    group: 'event-poll',
    key: 'poll',
    only: 'spieler',
    viewport: true,
    async prepare(ctx) {
      await ctx.tab.evaluate(`(() => {
        const real = window.fetch
        window.fetch = (input, init) => {
          const url = new URL(typeof input === 'string' ? input : input.url, location.href)
          if (/\\/vote$/.test(url.pathname) && (init?.method ?? 'GET').toUpperCase() === 'PUT') return Promise.resolve(new Response('{"statusCode":500}', { status: 500, headers: { 'content-type': 'application/json' } }))
          return real(input, init)
        }
      })()`)
      if (!await ctx.tab.evaluate(`(() => { const radio = document.querySelector('article[data-slot] [role=radio][aria-checked="false"]'); if (!radio) return false; radio.scrollIntoView({ block: 'center', behavior: 'instant' }); radio.click(); return true })()`)) throw new Error('no unchecked Vote to press')
      await toastShown(ctx.tab, COPY.mvp.poll.voteFailed ?? 'Deine Stimme ist nicht angekommen')
    },
  }),
  ...pair({ name: 'datiert', group: 'event-poll' }),

  // event-board --------------------------------------------------------------------------------------------------------------------
  ...pair({
    name: 'teamwahl',
    group: 'event-board',
    hostStops: [
      stop('einladen', async (tab) => {
        await press(tab, 'button', COPY.common.invite)
        await layerOpen(tab, 'the Invite sheet')
      }),
      // The copy button of the sheet, with the clipboard answering yes, then no.
      stop('toast-erfolg', async (tab) => {
        await keepToasts(tab)
        await clipboard(tab, 'ok')
        await press(tab, '[role=dialog] button', 'opier')
        await toastShown(tab, COPY.invite.copied)
      }, { viewport: true, keep: true }),
      stop('toast-fehler', async (tab) => {
        await clipboard(tab, 'denied')
        await press(tab, '[role=dialog] button', 'opier')
        await toastShown(tab, COPY.invite.copyFailed.slice(0, 20))
      }, { viewport: true, keep: true }),
      stop('mehr', async (tab) => {
        await press(tab, '[role=toolbar] button[aria-haspopup=menu]', COPY.dock.more)
        await until(tab, `!!document.querySelector('[role=menu]')`, 'the Mehr menu')
        await sleep(300)
      }),
      stop('loeschen', async (tab) => {
        await moreEntry(tab, COPY.dock.delete)
        await layerOpen(tab, 'the delete sheet')
      }),
      // The Parties are uneven: „Session starten“ is disabled and answers the click with its reason.
      stop('toast-info', async (tab) => {
        await keepToasts(tab)
        await dock(tab, COPY.dock.start)
        await toastShown(tab, COPY.dock.startBlocked.teams_empty.slice(0, 20))
      }, { viewport: true }),
    ],
  }),

  // event-live ---------------------------------------------------------------------------------------------------------------------
  ...['rad-vorher', 'rad-eins', 'rad-nachher', 'rad-leer'].flatMap(name => pair({ name, group: 'event-live' })),
  ...pair({
    name: 'veto',
    group: 'event-live',
    fresh: true,
    viewport: true,
    stillHolds: stillRunning('the Veto window', view => view.wheel?.vetoes?.draw?.vetoEndsAt),
    spielerStops: [
      // The Member's Party casts: the bar shows the seal.
      stop('eingelegt', async (tab, ctx) => {
        const { wheel } = await eventView(tab, ctx.event.slug)
        await ok(api(tab, 'POST', `/api/e/${ctx.event.slug}/draws/${wheel.vetoes.draw.drawId}/veto`), 'cast the Veto')
        await until(tab, `!!document.querySelector('[data-testid=veto-seal]')`, 'the Veto seal')
        await sleep(300)
      }),
    ],
  }),
  ...pair({
    name: 'clip',
    group: 'event-live',
    fresh: true,
    viewport: true,
    stillHolds: stillRunning('the Clip', view => view.clip?.endsAt),
  }),
  ...pair({
    name: 'runde',
    group: 'event-live',
    hostStops: [
      stop('ergebnis', async (tab) => {
        await press(tab, '[data-result]', '')
        await layerOpen(tab, 'the result sheet')
      }),
      // The picker lists the pool, then the library: only its first batch is read (`noAutoLoad`).
      stop('spiel-setzen', async (tab) => {
        await moreEntry(tab, COPY.dock.setGame)
        await layerOpen(tab, 'the game picker')
        await noAutoLoad(tab)
        await until(tab, `document.querySelectorAll('[role=dialog] li').length > 10`, 'the library in the picker', 30_000)
        if (!pickerNoted) note(`runde/spiel-setzen: the picker's library is read as far as its first batch (${await tab.evaluate('document.querySelectorAll(\'[role=dialog] li\').length')} list entries), the auto-load sentinel removed, no „Mehr laden“`)
        pickerNoted = true
        await sleep(300)
      }),
      stop('bonus-veto', async (tab) => {
        await moreEntry(tab, COPY.dock.bonusVeto)
        await layerOpen(tab, 'the Bonus Veto sheet')
      }),
      stop('countdown', async (tab) => {
        await moreEntry(tab, COPY.countdown.title)
        await layerOpen(tab, 'the Countdown sheet')
      }),
      stop('mehr', async (tab) => {
        await press(tab, '[role=toolbar] button[aria-haspopup=menu]', COPY.dock.more)
        await until(tab, `!!document.querySelector('[role=menu]')`, 'the Mehr menu')
        await sleep(300)
      }),
      // A Session runs: „Event löschen“ is disabled and answers the click with its reason.
      stop('toast-info', async (tab) => {
        await keepToasts(tab)
        await moreEntry(tab, COPY.dock.delete)
        await toastShown(tab, COPY.dock.deleteBlocked.slice(0, 20))
      }, { viewport: true }),
    ],
  }),
  ...pair({
    name: 'tabelle',
    group: 'event-live',
    // The side panel opens on „Aktivität“, which the page state reads already.
    hostStops: [stop('panel-tabelle', tab => press(tab, '[role=tab]', COPY.nav.tabs.table))],
    spielerStops: [
      stop('tab-tabelle', tab => press(tab, `nav[aria-label=${JSON.stringify(COPY.event.tabs.label)}] button`, COPY.nav.tabs.table)),
      stop('tab-aktivitaet', tab => press(tab, `nav[aria-label=${JSON.stringify(COPY.event.tabs.label)}] button`, COPY.nav.tabs.activity)),
    ],
  }),
  // The coin lands on a side the server draws at random: Kopf in one pass, Schwanz in the other. The coin card is read in both and compared in neither.
  ...pair({ name: 'muenze', group: 'event-live', differs: '[data-testid="coin-card"]' }),
  ...pair({ name: 'countdown-laeuft', group: 'event-live' }),
  ...pair({ name: 'countdown-zeit-um', group: 'event-live' }),
  ...pair({ name: 'gleichstand', group: 'event-live' }),
  ...pair({ name: 'pool-warnung', group: 'event-live', key: 'pool' }),

  // event-finished -----------------------------------------------------------------------------------------------------------------
  ...pair({ name: 'fertig', group: 'event-finished', hostStops: finishedStops('fertig'), spielerStops: finishedStops('fertig') }),
  ...pair({ name: 'fertig-gleichstand', group: 'event-finished', hostStops: finishedStops('fertig-gleichstand'), spielerStops: finishedStops('fertig-gleichstand') }),

  // 0.12 (#448) ---------------------------------------------------------------------------------------------------------------------
  // The board with a Team word (#437, #439): the Member's folded band, the pencil that opens the field again, the Host's reset and its question.
  ...pair({
    name: 'teamwahl-wort',
    group: 'event-board',
    hostStops: [
      stop('zuruecksetzen', async (tab) => {
        await press(tab, 'button', COPY.team.word.reset)
        await layerOpen(tab, 'the reset question')
      }),
    ],
    spielerStops: [
      stop('wort-aendern', async (tab) => {
        await press(tab, 'button', COPY.team.word.change)
        await until(tab, `!!document.querySelector('input[aria-describedby$="-help"]')`, 'the Team word field')
        await sleep(300)
      }),
    ],
  }),
  // The feed (#440): a named team's TeamMark in its entries and the Tie entry; the side panel's tab and the phone's Aktivität view.
  ...pair({
    name: 'aktivitaet',
    group: 'event-finished',
    hostStops: [stop('panel-aktivitaet', tab => press(tab, '[role=tab]', COPY.nav.tabs.activity))],
    spielerStops: [stop('tab-aktivitaet', tab => press(tab, `nav[aria-label=${JSON.stringify(COPY.event.tabs.label)}] button`, COPY.nav.tabs.activity))],
  }),
  // The game tiles of the Round and of the Wheel's card, and their dialog as the Host (Tags, Notes, library link) and as a Member (picture, facts, Price) (#435, #443, #444).
  ...pair({
    name: 'spiel-rad',
    group: 'event-live',
    hostStops: [
      stop('dialog-gerade-dran', async (tab, ctx) => {
        await openTile(tab, COPY.rounds.title, (await dialogGames(ctx))[0].name)
        await layerOpen(tab, 'the game dialog of the Round')
      }),
      stop('dialog-zuletzt-gezogen', async (tab, ctx) => {
        await openTile(tab, COPY.wheel.last, (await dialogGames(ctx))[1].name)
        await layerOpen(tab, 'the game dialog of the Wheel')
      }),
    ],
    spielerStops: [
      stop('dialog-gerade-dran', async (tab, ctx) => {
        await openTile(tab, COPY.rounds.title, (await dialogGames(ctx))[0].name)
        await layerOpen(tab, 'the game dialog of the Round')
      }),
      stop('dialog-zuletzt-gezogen', async (tab, ctx) => {
        await openTile(tab, COPY.wheel.last, (await dialogGames(ctx))[1].name)
        await layerOpen(tab, 'the game dialog of the Wheel')
      }),
    ],
  }),
  ...pair({
    name: 'spiel-pool',
    group: 'event-live',
    hostStops: [
      stop('dialog-pool', async (tab, ctx) => {
        await openTile(tab, COPY.howWePlay.mainPool, (await dialogGames(ctx))[0].name)
        await layerOpen(tab, 'the game dialog of the pool')
      }),
    ],
    spielerStops: [
      stop('dialog-pool', async (tab, ctx) => {
        await openTile(tab, COPY.howWePlay.mainPool, (await dialogGames(ctx))[0].name)
        await layerOpen(tab, 'the game dialog of the pool')
      }),
    ],
  }),
  // The Notes of Spiel 2 in the picker: a popover beside the button at 1440, a sheet over the picker at 390 (#436, #488). Reading scrolls the page, which closes a popover:
  // the scroll is switched off for this stop, and the reading says whether the popover is still there.
  ...pair({
    name: 'picker-notizen',
    group: 'event-live',
    key: 'picker',
    only: 'host',
    hostWidths: [390, 1440],
    hostStops: [
      stop('notizen', async (tab) => {
        // On a phone the crown button opens the actions in a sheet (no „Mehr“ step, HostDock), and the action closes it.
        if (await tab.evaluate('innerWidth < 768')) {
          await press(tab, 'button[aria-haspopup=dialog]', COPY.dock.label)
          await layerOpen(tab, 'the Host sheet')
          await press(tab, '[role=dialog] button', COPY.dock.setGame)
          await until(tab, `document.querySelectorAll('[role=dialog]').length === 1 && !!document.querySelector('[role=dialog] li')`, 'the picker replacing the Host sheet')
        }
        else await moreEntry(tab, COPY.dock.setGame)
        await layerOpen(tab, 'the game picker')
        await noAutoLoad(tab)
        await until(tab, `document.querySelectorAll('[role=dialog] li').length > 10`, 'the library in the picker', 30_000)
        await press(tab, '[role=dialog] button', COPY.gameNotes.open)
        await until(tab, `document.querySelectorAll('[role=dialog]').length > 1`, 'the Notes')
        // The popover closes on a scroll that is not its own (`GameNotesButton`'s `onScroll` asks `popover.contains(target)`), and the reading scrolls the page: it
        // takes the popover for the target's container, so that it stays open for the reading and the screenshot.
        await tab.evaluate(`(() => {
          window.scrollTo = () => {}
          const contains = Node.prototype.contains
          Node.prototype.contains = function (node) { return contains.call(this, node) || (this instanceof Element && this.matches('.layer-popover')) }
        })()`)
        await sleep(500)
      }, { viewport: true }),
    ],
  }),
  // The finished page before the ceremony, as the Host (the dock's „Siegerehrung starten“) and as a Member (#445); the Tabelle tab shows the same card.
  ...pair({
    name: 'fertig-offen',
    group: 'event-finished',
    hostStops: [stop('panel-tabelle', tab => press(tab, '[role=tab]', COPY.nav.tabs.table))],
    spielerStops: [
      stop('tab-tabelle', tab => press(tab, `nav[aria-label=${JSON.stringify(COPY.event.tabs.label)}] button`, COPY.nav.tabs.table)),
      stop('tab-aktivitaet', tab => press(tab, `nav[aria-label=${JSON.stringify(COPY.event.tabs.label)}] button`, COPY.nav.tabs.activity)),
    ],
    // The last state of the file: the Events of the pass are deleted after it, so Home looks the same in the next pass.
    after: ({ tabs }) => purge(tabs.host),
  }),
]
