// The COMPIES kit for browser checks (retro 1.4, split from the DevTools protocol in 0.6): the dev sign-in, JSON
// requests with the account's cookie, the animation spy, the mouse and touch drag, and the helpers the scenarios share
// (creating a game and an Event, joining by Invite link, clicking and typing like a User, the settings switches, the
// stepper). The protocol itself (launch, send/evaluate, resize, screenshot) is `chrome.mjs`.
import { resize, sleep } from './chrome.mjs'

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
 * Signs in through the dev route as the tab's account and opens `path`, logging animations from the first frame on. The
 * dev sign-in marks the newest „Was ist neu“ seen, so its dialog never covers the page; `news: true` leaves it unseen,
 * to check the dialog itself.
 */
export async function open(tab, path, width, height, waitFor = 'body', { news = false } = {}) {
  await resize(tab, width, height)
  if (!tab.spying) {
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: ANIMATION_SPY })
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

/** Throws unless a request answered 200, with what it was for. */
function ok(answer, what) {
  if (answer.status !== 200) throw new Error(`${what} answered ${answer.status}: ${JSON.stringify(answer.body)}`)
  return answer.body
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
 * `{ main: [ids], tiebreaker: [ids] }`, `startsAt` as Berlin wall-clock `YYYY-MM-DDTHH:mm` (default: in two weeks).
 * Returns `{ slug, inviteUrl }`.
 */
export async function createEvent(tab, { name, settings = {}, pools, startsAt = inTwoWeeks() }) {
  const body = { name, sessions: 1, dateMode: 'direct', startsAt: [startsAt], settings: { ...DEFAULT_SETTINGS, ...settings }, ...(pools ? { pools } : {}) }
  return ok(await api(tab, 'POST', '/api/e', body), 'POST /api/e')
}

/** The tab's account joins through the Invite link, which `host` (a tab of the Event's Host) reads. The tab must be signed in (open). */
export async function joinEvent(tab, slug, host) {
  const { inviteUrl } = ok(await api(host, 'GET', `/api/e/${slug}`), `GET /api/e/${slug}`)
  return ok(await api(tab, 'POST', `/api/invite/${inviteUrl.split('/').pop()}`), 'POST /api/invite')
}

/** `PATCH /api/e/:slug/settings` with `{ settings: change }`. Throws when the answer's settings do not contain the change: a 200 alone proves nothing. */
export async function patchSettings(tab, slug, change) {
  const answer = await api(tab, 'PATCH', `/api/e/${slug}/settings`, { settings: change })
  const { settings } = ok(answer, 'PATCH settings')
  for (const [key, value] of Object.entries(change)) {
    if (JSON.stringify(settings?.[key]) !== JSON.stringify(value)) throw new Error(`PATCH settings answered 200 but ${key} is ${JSON.stringify(settings?.[key])}, not ${JSON.stringify(value)}`)
  }
  return settings
}

/** Clicks the first element matching `selector` whose text contains `text` (any, when empty), scrolled into view. Returns whether there was one. */
export const clickText = (tab, selector, text = '') => tab.evaluate(`(() => { const t = ${JSON.stringify(text)}; const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => t === '' || e.textContent.includes(t)); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.click(); return true })()`)

/** Focuses the first element matching `selector` and types `text` as the keyboard would, so Vue sees the input event. */
export async function typeInto(tab, selector, text) {
  await tab.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.focus() })()`)
  await tab.send('Input.insertText', { text })
}

/** Each `[role=switch]` on the page: its label, whether it is on, and why it is disabled (null when it is not). */
export const switches = tab => tab.evaluate(`[...document.querySelectorAll('[role=switch]')].map(s => ({
  label: document.getElementById(s.getAttribute('aria-labelledby'))?.innerText ?? '?',
  checked: s.getAttribute('aria-checked') === 'true',
  disabled: s.getAttribute('aria-disabled') ? (document.getElementById(s.getAttribute('aria-describedby'))?.innerText ?? '') : null,
}))`)

/** „Weiter“ / „Fertig“ in the stepper's footer. */
export const stepperNext = tab => tab.evaluate(`document.querySelector('[data-testid="stepper-footer"] button[type=submit]').click()`)
