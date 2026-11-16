// The COMPIES kit for browser checks (retro 1.4, split from the DevTools protocol in 0.6): the dev sign-in, JSON
// requests with the account's cookie, the animation spy, the mouse and touch drag, the results log, and the helpers
// the scenarios share (creating a game and an Event, joining by Invite link, a running Event with Results, clicking,
// typing and pressing keys like a User, the Appearance, the settings switches, the stepper). The helpers the agents' own
// checks had copied from session to session in a temp folder live here since the 0.8 retro. The protocol itself
// (launch, send/evaluate, resize, screenshot) is `chrome.mjs`.
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUT, resize, shot, sleep } from './chrome.mjs'
import { originOf, slotOf } from './ports.mjs'

export const BASE = process.env.BASE_URL ?? originOf(slotOf(), 'app')
// Staging sits behind Vercel Authentication; its „Protection Bypass for Automation“ secret lets a check in (README § Staging).
// The secret lives in `.env`, which a script on localhost may load too (`node --env-file=.env`): it goes to an https base
// only, so a local server never sees it in a request or a log (#599).
const VERCEL_BYPASS = BASE.startsWith('https://') ? process.env.VERCEL_AUTOMATION_BYPASS_SECRET : undefined

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
 * page; `news: true` leaves it unseen, to check the dialog itself. `appearance` (`'dark'`, `'system'`, `'light'`) sets the
 * User's Appearance with the sign-in, light when absent (#401); `setup: true` signs in a User who has not set up yet
 * (`name=unset`), for the setup page.
 */
export async function open(tab, path, width, height, waitFor = 'body', { news = false, appearance, setup = false } = {}) {
  await resize(tab, width, height)
  if (!tab.spying) {
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: ANIMATION_SPY })
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: HIDE_DEVTOOLS })
    tab.spying = true
  }
  if (VERCEL_BYPASS && !tab.bypassed) {
    // One visit with the bypass query sets Vercel's bypass cookie for this profile; the secret goes to BASE only, never
    // into a header that every request (a YouTube iframe's too) would carry.
    await tab.send('Page.navigate', { url: `${BASE}/api/health?x-vercel-protection-bypass=${encodeURIComponent(VERCEL_BYPASS)}&x-vercel-set-bypass-cookie=true` })
    await loaded(tab)
    tab.bypassed = true
  }
  await tab.send('Page.navigate', { url: `${BASE}/api/dev/sign-in?as=${tab.account}&to=${encodeURIComponent(path)}${news ? '&news=unseen' : ''}${appearance ? `&appearance=${appearance}` : ''}${setup ? '&name=unset' : ''}` })
  await hydrated(tab, waitFor)
}

/**
 * @public For the agents' own checks (docs/agents/browser-frame.md § Checks).
 * Makes `matchMedia('(pointer: fine)')` answer `fine` in every page the tab loads from now on; call it before `open()`.
 * What Chrome reports there follows the machine, not the check: on 2026-11-12 the headless Chrome and the operator's own
 * both reported no fine pointer, and the „?“ hint of #465 never rendered in a check; on 2026-11-15 the same machine
 * reported one. Chrome's media emulation (`Emulation.setEmulatedMedia`) ignores `pointer` (tried 2026-11-15), so this
 * replaces the answer in the page's JavaScript. It proves what the page does with the answer (`useMediaQuery`), not what a
 * device reports, and a CSS `@media (pointer: fine)` rule does not follow it (#599). Since #780 `chrome.mjs` launches
 * every Chrome reporting a hovering fine pointer, in CSS too, so what is left for this helper is the other case,
 * `finePointer(tab, false)`: the page of a device without one, at desktop width.
 */
export async function finePointer(tab, fine = true) {
  await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const list = real(query);
      if (String(query).replace(/\\s+/g, '') !== '(pointer:fine)') return list;
      return new Proxy(list, { get: (target, key) => key === 'matches' ? ${fine === true} : typeof target[key] === 'function' ? target[key].bind(target) : target[key] });
    };
  })();` })
}

/**
 * @public For the agents' own checks (docs/agents/browser-frame.md § Checks).
 * The animations running on the element now, each with the curve it really runs on: `{ name, duration, delay, easing }`,
 * `null` without the element. A CSS animation keeps its `animation-timing-function` on its keyframes and reports
 * `linear` as the effect's own easing, so an item that read `effect.getTiming().easing` failed on a page that was right
 * (0.14, #780); a transition and an `element.animate()` call keep the curve on the effect. This returns whichever of
 * the two is not `linear`. Call it while the animation runs: a finished one is gone from `getAnimations()`.
 */
export const motionOf = (tab, selector) => tab.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  return el.getAnimations().map((animation) => {
    const timing = animation.effect.getComputedTiming();
    const first = animation.effect.getKeyframes()[0];
    return {
      name: animation.animationName ?? animation.transitionProperty ?? animation.id ?? '',
      duration: timing.duration,
      delay: timing.delay,
      easing: timing.easing !== 'linear' ? timing.easing : first?.easing ?? 'linear',
    };
  });
})()`)

/**
 * @public For the agents' own checks (docs/agents/browser-frame.md § Checks).
 * The shadows a User sees on the element: the layers of its computed `box-shadow` that have a colour and a size, each as
 * `{ color, x, y, blur, spread, inset }` in px; `[]` for none, `null` without the element. Tailwind writes a shadow as
 * several layers, the first ones transparent placeholders, so an item that read the first layer found „no shadow“ on a
 * button that had one, and a blocked button's missing shadow read the same (0.14, #780).
 */
export const shadowOf = (tab, selector) => tab.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const value = getComputedStyle(el).boxShadow;
  if (!value || value === 'none') return [];
  // Layers are separated by the commas outside a colour's brackets.
  const layers = [];
  let depth = 0, from = 0;
  for (let i = 0; i <= value.length; i++) {
    const c = value[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if ((c === ',' && depth === 0) || i === value.length) { layers.push(value.slice(from, i).trim()); from = i + 1; }
  }
  return layers.map((layer) => {
    const color = (/^[a-z-]+\\([^)]*\\)|^#[0-9a-f]+|^[a-z]+(?= )/i.exec(layer) ?? [''])[0];
    const [x = 0, y = 0, blur = 0, spread = 0] = (layer.slice(color.length).match(/-?[\\d.]+px/g) ?? []).map(parseFloat);
    const slash = /\\/\\s*([\\d.]+%?)\\s*\\)$/.exec(color);
    const legacy = /^rgba\\((?:[^,]+,){3}\\s*([\\d.]+)\\s*\\)$/.exec(color);
    const part = slash?.[1] ?? legacy?.[1];
    const alpha = color === 'transparent' ? 0 : part === undefined ? 1 : part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part);
    return { color, x, y, blur, spread, inset: /\\binset\\b/.test(layer), alpha };
  }).filter(layer => layer.alpha > 0 && (layer.x !== 0 || layer.y !== 0 || layer.blur !== 0 || layer.spread !== 0))
    .map(({ alpha, ...layer }) => layer);
})()`)

/**
 * Opens `path` signed out the way a User gets there (#398: sign-out does not touch the Appearance cookie): signs in with
 * `appearance`, loads a page (the server-side `GET /api/me` writes `compies-appearance` for Dunkel and System), signs
 * out through the route the app's own button calls, and loads `path`. `plain` is a page without Nuxt (`/offline.html`).
 * Returns how the sign-out went: `'route'`, or `'cookies'` when the route refused (on :3001 Better Auth may refuse the
 * origin, `BETTER_AUTH_URL` is :3000) and every cookie but the Appearance's was deleted over the protocol instead.
 */
export async function openSignedOut(tab, path, width, height, waitFor = 'body', { appearance, plain = false } = {}) {
  await open(tab, '/impressum', width, height, 'body', { appearance })
  let how = 'route'
  const { status } = await api(tab, 'POST', '/api/auth/sign-out', {})
  if (status !== 200) {
    how = 'cookies'
    const { result } = await tab.send('Network.getCookies', { urls: [BASE] })
    for (const cookie of result.cookies) {
      if (cookie.name !== 'compies-appearance') await tab.send('Network.deleteCookies', { name: cookie.name, domain: cookie.domain, path: cookie.path })
    }
  }
  await tab.send('Page.navigate', { url: `${BASE}${path}` })
  await (plain ? loaded(tab) : hydrated(tab, waitFor))
  const me = await api(tab, 'GET', '/api/me')
  if (me.body?.user !== null) throw new Error(`${tab.account}: still signed in on ${path} after sign-out by ${how} (GET /api/me answered ${JSON.stringify(me.body)?.slice(0, 80)})`)
  return how
}

/** Waits until the document has loaded (a plain page, no Nuxt). */
export async function loaded(tab) {
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    if (await tab.evaluate(`document.readyState === 'complete'`).catch(() => false)) return
  }
  throw new Error(`${tab.account}: ${BASE} never loaded`)
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

/**
 * A game in the library (`POST /api/games`): `fields` are `name`, `playersMin`, `playersMax`, `notes`, … Returns the GameView.
 * `notes` as a string is sent as the document the migration 0037 builds from a text (#727; an .mjs cannot import shared/notes-doc.ts):
 * one paragraph per line, an empty line an empty paragraph without `content`.
 */
export async function createGame(tab, fields) {
  const notes = typeof fields.notes === 'string' ? notesDocument(fields.notes) : fields.notes
  return ok(await api(tab, 'POST', '/api/games', { ...fields, notes }), 'POST /api/games')
}

/** The document of a text, as `notesFromLines` in shared/notes-doc.ts builds it; null when no line has a visible character. */
function notesDocument(text) {
  if (!/\S/.test(text)) return null
  const content = text.split(/\r?\n/).map(line => (line === '' ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text: line }] }))
  return { type: 'doc', content }
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

/** The Berlin wall-clock `YYYY-MM-DDTHH:mm` of `time` (default 19:00), `n` days from now. */
export function inDays(n, time = '19:00') {
  const day = new Date(Date.now() + n * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  return `${day}T${time}`
}

const inTwoWeeks = () => inDays(14)

/**
 * An Event of the tab's account (`POST /api/e`) with one direct Session: `settings` over the defaults, `pool` as
 * `[ids]`, `startsAt` as Berlin wall-clock `YYYY-MM-DDTHH:mm` (default: in two weeks). `slots` (an array of the same): a Date poll
 * with those Slots for the one Session instead of the direct Date (#408).
 * Returns `{ slug, inviteUrl }`.
 */
export async function createEvent(tab, { name, settings = {}, pool, startsAt = inTwoWeeks(), slots }) {
  const when = slots ? { dateMode: 'poll', slots } : { dateMode: 'direct', startsAt: [startsAt] }
  const body = { name, sessions: 1, ...when, settings: { ...DEFAULT_SETTINGS, ...settings }, ...(pool ? { pool } : {}) }
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
 * (`open`). `pool`: games of the library that exist already (their GameViews); none is created, `games` is then `pool.length` (#408:
 * a check that makes many Events must not fill the library). Returns `{ slug, games, roundIds }`.
 */
export async function runningEvent(tabs, { name, games = 5, gameNames = [], settings = {}, start = true, set = 0, pool: given }) {
  const [host, ...others] = tabs
  const pool = given ? [...given] : []
  for (let i = 0; i < (given ? 0 : games); i++) pool.push(await createGame(host, { name: gameNames[i] ?? `${name} Spiel ${i + 1}`, playersMin: 1, playersMax: 8 }))
  const values = tabs.length === 2 ? [5, 0] : [5, 2, ...Array.from({ length: tabs.length - 2 }, () => 0)]
  const { slug } = await createEvent(host, {
    name,
    settings: { teamCount: tabs.length, teamSize: 1, gameCount: 6, pointsTable: { preset: 'custom', values }, selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null, ...settings },
    pool: pool.map(game => game.id),
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
 * @public For the agents' own checks (docs/agents/browser-frame.md).
 * A finished Event for a check (retro 0.9): `runningEvent` with `games` pool games, all set and with the Game count at
 * `games`, a Result for each that gives the `outcome`, and the Finish. `'winner'`: the first tab's Party wins every
 * Round. `'tie'`: the Parties take turns on Place 1, so `games` is rounded up to a multiple of the Party count and
 * every Party ends on the same points. `pool` (library games as `runningEvent` takes them) is the count then: pass a multiple of the Parties (#408). Each 0.9 check rebuilt this by hand; on staging the same requests run as one
 * `javascript_tool` call per account (`docs/agents/delivery.md` § Issues). Returns `{ slug, games, roundIds, winners }`.
 */
export async function finishedEvent(tabs, { name, outcome = 'winner', games = tabs.length, settings = {}, pool }) {
  const teams = tabs.map((_, index) => index + 1)
  const count = pool ? pool.length : outcome === 'tie' ? Math.ceil(games / teams.length) * teams.length : games
  const event = await runningEvent(tabs, { name, games: count, settings: { gameCount: count, ...settings }, set: count, pool })
  const [host] = tabs
  for (const [index, roundId] of event.roundIds.entries()) {
    const order = outcome === 'tie' ? teams.map((_, i) => teams[(i + index) % teams.length]) : teams
    await enterResult(host, event.slug, roundId, placesOf(order))
  }
  const winners = outcome === 'tie' ? teams : [teams[0]]
  await ok(api(host, 'POST', `/api/e/${event.slug}/finish`, { outcome, winners }), 'finish the Event')
  return { ...event, winners }
}

/**
 * The results of one browser check in its own folder, `<tmp>/compies-browser/<name>/` (retro 0.8). `check`, `skip` and
 * `note` print their line and append it to `results.log` there the moment it is decided, so a check that stops early
 * (the s6 agent of 0.8 hit the usage limit) leaves every result it had. Each run opens the log with its script and the
 * SHA of the code under test. `shot` saves screenshots into the same folder; `failed` is for the exit code.
 *
 * The code under test is the kit's own commit, except against a remote base (staging): there it is the commit that base
 * serves, which only the caller knows, so it comes in `COMPIES_TESTED_SHA` (the spawn prompt names it), and the header
 * adds the base and the kit's commit. 0.14's staging logs named the check worktree's commit (#780).
 */
export function results(name, { sha: served = process.env.COMPIES_TESTED_SHA, base = BASE } = {}) {
  const dir = join(OUT, name)
  mkdirSync(dir, { recursive: true })
  const log = join(dir, 'results.log')
  const write = (line) => {
    console.log(line)
    appendFileSync(log, `${line}\n`)
  }
  const kit = execFileSync('git', ['-C', fileURLToPath(new URL('.', import.meta.url)), 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  const remote = base.startsWith('https://')
  const sha = remote && served ? served.slice(0, kit.length) : kit
  // A run name comes back from Release to Release (`l1`, `m2`): a log of another commit is set aside under that commit,
  // so this run's lines never follow an earlier Release's (0.13.1 and 0.13.2: every report had to say where its lines start, #599).
  if (existsSync(log)) {
    const last = [...readFileSync(log, 'utf8').matchAll(/^== .* on ([0-9a-f]+), /gm)].at(-1)?.[1]
    if (last && !last.startsWith(sha) && !sha.startsWith(last)) {
      appendFileSync(join(dir, `results-${last}.log`), readFileSync(log))
      rmSync(log)
      console.log(`NOTE  the log of ${last} in this run folder is now results-${last}.log`)
    }
  }
  appendFileSync(log, `== ${basename(process.argv[1] ?? 'check')} on ${sha}, ${new Date().toISOString()}${remote && served ? ` (served by ${base}; kit of ${kit})` : ''}\n`)
  if (remote && !served) write(`NOTE  this log names the kit's commit ${kit}, not the one ${base} serves: set COMPIES_TESTED_SHA to the commit under test`)
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
