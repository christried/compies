// The COMPIES kit for browser checks (retro 1.4, split from the DevTools protocol in 0.6): the dev sign-in, JSON
// requests with the account's cookie, the animation spy, the mouse and touch drag, the results log, and the helpers
// the scenarios share (creating a game and an Event, joining by Invite link, a running Event with Results, clicking,
// typing and pressing keys like a User, the theme, the settings switches, the stepper). The helpers the agents' own
// checks had copied from session to session in a temp folder live here since the 0.8 retro. The protocol itself
// (launch, send/evaluate, resize, screenshot) is `chrome.mjs`.
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUT, resize, shot, sleep } from './chrome.mjs'

export const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

/** Logs every Element.animate of the page in `window.__animations`: who moved (a person by user id), from what, how. */
const ANIMATION_SPY = `(() => {
  if (window.__animations) return;
  window.__animations = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const person = this.closest?.('[data-user-id]');
    const who = person ? person.dataset.userId.slice(0, 8) + (person === this ? '' : ':picture') : this.tagName.toLowerCase();
    window.__animations.push({ who, from: keyframes[0]?.transform ?? JSON.stringify(keyframes[0]), easing: options?.easing, duration: options?.duration });
    return animate.call(this, keyframes, options);
  };
})();`

/**
 * Hides the Nuxt devtools pill and panel, which `pnpm dev` draws over the page. Measured with the pill on the page,
 * the strip under a sheet's footer (s3 F1 of 0.8) stayed open for four sessions as „maybe the devtools“.
 */
const HIDE_DEVTOOLS = `document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = '#nuxt-devtools-container { display: none !important }';
  document.head.append(style);
});`

/**
 * Signs in through the dev route as the tab's account and opens `path`, logging animations from the first frame on and
 * with the Nuxt devtools hidden. The dev sign-in marks the newest „Was ist neu“ seen, so its dialog never covers the
 * page; `news: true` leaves it unseen, to check the dialog itself.
 */
export async function open(tab, path, width, height, waitFor = 'body', { news = false } = {}) {
  await resize(tab, width, height)
  if (!tab.spying) {
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: ANIMATION_SPY })
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: HIDE_DEVTOOLS })
    tab.spying = true
  }
  await tab.send('Page.navigate', { url: `${BASE}/api/dev/sign-in?as=${tab.account}&to=${encodeURIComponent(path)}${news ? '&news=unseen' : ''}` })
  await hydrated(tab, waitFor)
}

/** Waits until Nuxt has hydrated (the dev server takes up to 20 s) and `selector` is on the page. */
export async function hydrated(tab, selector = 'body') {
  for (let i = 0; i < 120; i++) {
    await sleep(500)
    const ready = await tab.evaluate(`!!(document.querySelector('#__nuxt')?.__vue_app__ && document.querySelector(${JSON.stringify(selector)}))`).catch(() => false)
    if (ready) return
  }
  throw new Error(`${tab.account}: ${selector} never appeared`)
}

/** A JSON request from inside the page, with the account's cookie. */
export function api(tab, method, path, body) {
  return tab.evaluate(`fetch(${JSON.stringify(path)}, { method: ${JSON.stringify(method)}, headers: { 'content-type': 'application/json' }${body === undefined ? '' : `, body: ${JSON.stringify(JSON.stringify(body))}`} }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }))`)
}

/** The animations logged since the last call. */
export const animations = tab => tab.evaluate('window.__animations.splice(0)')

/** The centre of the first element matching `selector`, scrolled into view unless `scroll` is false. */
export const centre = (tab, selector, { scroll = true } = {}) => tab.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (${scroll}) el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)

/** Presses on `from` and lets go over `to`: a mouse drag, or on a phone (touch) after the 300 ms long press. */
export async function drag(tab, from, to, { touch = false } = {}) {
  await centre(tab, to)
  const start = await centre(tab, from)
  const end = await centre(tab, to, { scroll: false })
  const at = i => ({ x: start.x + (end.x - start.x) * i / 12, y: start.y + (end.y - start.y) * i / 12 })
  if (touch) {
    await tab.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    await sleep(450)
    for (let i = 1; i <= 12; i++) {
      await tab.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(i)] })
      await sleep(30)
    }
    await tab.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    return
  }
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start })
  await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= 12; i++) {
    await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at(i), button: 'left', buttons: 1 })
    await sleep(30)
  }
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', buttons: 0, clickCount: 1 })
}

/** The body of a request's answer (or of its promise); throws unless it answered 200, with what it was for. */
export async function ok(answer, what) {
  const { status, body } = await answer
  if (status !== 200) throw new Error(`${what} answered ${status}: ${JSON.stringify(body)}`)
  return body
}

/** A game in the library (`POST /api/games`): `fields` are `name`, `playersMin`, `playersMax`, `notes`, … Returns the GameView. */
export async function createGame(tab, fields) {
  return ok(await api(tab, 'POST', '/api/games', fields), 'POST /api/games')
}

/** The defaults of `defaultSettings()` in shared/settings.ts (an .mjs cannot import the TypeScript): Host pick, visible wheel, a 3v3. */
const DEFAULT_SETTINGS = {
  format: 'teams',
  teamCount: 2,
  teamSize: 3,
  gameCount: 10,
  pointsTable: { preset: 'linear', values: [1, 0] },
  selectionMode: 'admin_pick',
  hiddenWheel: false,
  vetoAllowance: null,
  poolPreview: true,
}

/** The Berlin wall-clock `YYYY-MM-DDTHH:mm` of 19:00, two weeks from now. */
function inTwoWeeks() {
  const day = new Date(Date.now() + 14 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  return `${day}T19:00`
}

/**
 * An Event of the tab's account (`POST /api/e`) with one direct Session: `settings` over the defaults, `pools` as
 * `{ main: [ids] }`, `startsAt` as Berlin wall-clock `YYYY-MM-DDTHH:mm` (default: in two weeks).
 * Returns `{ slug, inviteUrl }`.
 */
export async function createEvent(tab, { name, settings = {}, pools, startsAt = inTwoWeeks() }) {
  const body = { name, sessions: 1, dateMode: 'direct', startsAt: [startsAt], settings: { ...DEFAULT_SETTINGS, ...settings }, ...(pools ? { pools } : {}) }
  return ok(await api(tab, 'POST', '/api/e', body), 'POST /api/e')
}

/** The tab's account joins through the Invite link, which `host` (a tab of the Event's Host) reads. The tab must be signed in (open). */
export async function joinEvent(tab, slug, host) {
  const { inviteUrl } = await ok(api(host, 'GET', `/api/e/${slug}`), `GET /api/e/${slug}`)
  return ok(await api(tab, 'POST', `/api/invite/${inviteUrl.split('/').pop()}`), 'POST /api/invite')
}

/** `PATCH /api/e/:slug/settings` with `{ settings: change }`. Throws when the answer's settings do not contain the change: a 200 alone proves nothing. */
export async function patchSettings(tab, slug, change) {
  const answer = await api(tab, 'PATCH', `/api/e/${slug}/settings`, { settings: change })
  const { settings } = await ok(answer, 'PATCH settings')
  for (const [key, value] of Object.entries(change)) {
    if (JSON.stringify(settings?.[key]) !== JSON.stringify(value)) throw new Error(`PATCH settings answered 200 but ${key} is ${JSON.stringify(settings?.[key])}, not ${JSON.stringify(value)}`)
  }
  return settings
}

/**
 * The visible elements matching `selector` whose text or `aria-label` contains `text` (all, when empty), as the source
 * of a page expression. The text is `textContent`: `innerText` comes back in capitals under `text-transform: uppercase`.
 */
const visible = (selector, text) => `[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.getBoundingClientRect().width > 0 && (${JSON.stringify(text)} === '' || e.textContent.includes(${JSON.stringify(text)}) || (e.getAttribute('aria-label') || '').includes(${JSON.stringify(text)})))`

/** Clicks the `nth` visible element matching `selector` whose text or `aria-label` contains `text` (any, when empty), scrolled into view. Returns whether there was one. */
export const clickText = (tab, selector, text = '', { nth = 0 } = {}) => tab.evaluate(`(() => { const el = ${visible(selector, text)}[${nth}]; if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.click(); return true })()`)

/** @public Kept for the next scenario (scripts/browser/README.md). Focuses the first element matching `selector` and types `text` as the keyboard would, so Vue sees the input event. */
export async function typeInto(tab, selector, text) {
  await tab.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.focus() })()`)
  await tab.send('Input.insertText', { text })
}

/** @public Kept for the next scenario (scripts/browser/README.md). Each `[role=switch]` on the page: its label, whether it is on, and why it is disabled (null when it is not). */
export const switches = tab => tab.evaluate(`[...document.querySelectorAll('[role=switch]')].map(s => ({
  label: document.getElementById(s.getAttribute('aria-labelledby'))?.innerText ?? '?',
  checked: s.getAttribute('aria-checked') === 'true',
  disabled: s.getAttribute('aria-disabled') ? (document.getElementById(s.getAttribute('aria-describedby'))?.innerText ?? '') : null,
}))`)

/** @public Kept for the next scenario (scripts/browser/README.md). „Weiter“ / „Fertig“ in the stepper's footer. */
export const stepperNext = tab => tab.evaluate(`document.querySelector('[data-testid="stepper-footer"] button[type=submit]').click()`)

/** @public For the agents' own checks (docs/agents/browser-frame.md). Clicks like `clickText`, but with the mouse at the element's centre, for what listens to pointer events. Returns whether there was one. */
export async function mouseClick(tab, selector, text = '') {
  const at = await tab.evaluate(`(() => { const el = ${visible(selector, text)}[0]; if (!el) return null; el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  if (!at) return false
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at })
  await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 })
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount: 1 })
  return true
}

const KEY_CODES = { 'Tab': 9, 'Enter': 13, 'Escape': 27, ' ': 32, 'ArrowLeft': 37, 'ArrowUp': 38, 'ArrowRight': 39, 'ArrowDown': 40 }

/** @public For the agents' own checks (docs/agents/browser-frame.md). Presses one key as the keyboard would (`Tab`, `Enter`, `Escape`, `' '`, the arrows); `modifiers` is the protocol's bit mask (8: Shift). */
export async function pressKey(tab, key, modifiers = 0) {
  const code = key === ' ' ? 'Space' : key
  const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined
  await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: KEY_CODES[key], modifiers, ...(text ? { text } : {}) })
  await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: KEY_CODES[key], modifiers })
}

/** @public For the agents' own checks (docs/agents/browser-frame.md). The labels of the visible buttons and links, to find what a click should aim at. */
export const visibleButtons = tab => tab.evaluate(`${visible('button, a, [role=button]', '')}.map(e => (e.getAttribute('aria-label') || e.textContent).replace(/\\s+/g, ' ').trim().slice(0, 40))`)

/** @public For the agents' own checks (docs/agents/browser-frame.md). The `innerText` of the first element matching `selector`. */
export const textOf = (tab, selector = 'body') => tab.evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText`)

/** @public For the agents' own checks (docs/agents/browser-frame.md). Light or dark, as the theme switch sets it (`data-theme` on `<html>`). */
export const theme = (tab, name) => tab.evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(name)})`)

/** The Event view the tab's account reads (`GET /api/e/:slug`). */
export const eventView = (tab, slug) => ok(api(tab, 'GET', `/api/e/${slug}`), `GET /api/e/${slug}`)

/** Sets a pool game (`POST /api/e/:slug/rounds`) and skips its clip, whose overlay would cover the page. Returns the Round's id. */
export async function setGame(host, slug, gameId) {
  const { roundId } = await ok(api(host, 'POST', `/api/e/${slug}/rounds`, { gameId }), 'set a game')
  await api(host, 'POST', `/api/e/${slug}/clip/skip`)
  return roundId
}

/** The Places of a Result where `order` lists the Parties from Place 1 down. A shared Place is written out instead: `[{ team: 1, place: 1 }, { team: 2, place: 1 }, …]`. */
export const placesOf = order => order.map((team, index) => ({ team, place: index + 1 }))

/** Enters (or corrects) a Round's Result (`PUT …/rounds/:id/result`), `places` as `placesOf` writes them. Returns the answer's body. */
export const enterResult = (host, slug, roundId, places) => ok(api(host, 'PUT', `/api/e/${slug}/rounds/${roundId}/result`, { places }), 'enter a Result')

/**
 * A running Event for a check. `tabs[0]`, the Host, creates `games` pool games (named `gameNames[i]`, else
 * „<name> Spiel n“) and the Event; the other tabs join through its Invite link; each tab takes its own Party in order.
 * Then the first Session starts (unless `start` is false) and the first `set` pool games are set. `settings` go over a
 * Host pick with one person per Party and Points 5 : 0 (5 : 2 : 0 … for more Parties). Every tab must be signed in
 * (`open`). Returns `{ slug, games, roundIds }`.
 */
export async function runningEvent(tabs, { name, games = 5, gameNames = [], settings = {}, start = true, set = 0 }) {
  const [host, ...others] = tabs
  const pool = []
  for (let i = 0; i < games; i++) pool.push(await createGame(host, { name: gameNames[i] ?? `${name} Spiel ${i + 1}`, playersMin: 1, playersMax: 8 }))
  const values = tabs.length === 2 ? [5, 0] : [5, 2, ...Array.from({ length: tabs.length - 2 }, () => 0)]
  const { slug } = await createEvent(host, {
    name,
    settings: { teamCount: tabs.length, teamSize: 1, gameCount: 6, pointsTable: { preset: 'custom', values }, selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null, ...settings },
    pools: { main: pool.map(game => game.id) },
  })
  for (const tab of others) await joinEvent(tab, slug, host)
  for (const [index, tab] of tabs.entries()) {
    const { viewerId } = await eventView(tab, slug)
    await ok(api(tab, 'POST', `/api/e/${slug}/move`, { userId: viewerId, to: { zone: 'team', team: index + 1 } }), 'take a seat')
  }
  if (start) await ok(api(host, 'POST', `/api/e/${slug}/sessions/start`), 'start the Session')
  const roundIds = []
  for (const game of pool.slice(0, set)) roundIds.push(await setGame(host, slug, game.id))
  return { slug, games: pool, roundIds }
}

/**
 * The results of one browser check in its own folder, `<tmp>/compies-browser/<name>/` (retro 0.8). `check`, `skip` and
 * `note` print their line and append it to `results.log` there the moment it is decided, so a check that stops early
 * (the s6 agent of 0.8 hit the usage limit) leaves every result it had. Each run opens the log with its script and the
 * SHA of the code under test. `shot` saves screenshots into the same folder; `failed` is for the exit code.
 */
export function results(name) {
  const dir = join(OUT, name)
  mkdirSync(dir, { recursive: true })
  const log = join(dir, 'results.log')
  const write = (line) => {
    console.log(line)
    appendFileSync(log, `${line}\n`)
  }
  const sha = execFileSync('git', ['-C', fileURLToPath(new URL('.', import.meta.url)), 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  appendFileSync(log, `== ${basename(process.argv[1] ?? 'check')} on ${sha}, ${new Date().toISOString()}\n`)
  let failed = false
  return {
    dir,
    get failed() { return failed },
    check(label, passed, detail = '') {
      if (!passed) failed = true
      write(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
    },
    skip: (label, why) => write(`SKIP  ${label}  (${why})`),
    note: text => write(`NOTE  ${text}`),
    shot: (tab, file, selector) => shot(tab, file, selector, dir),
  }
}
