// Headless Chrome over the DevTools protocol, one profile (and so one cookie jar) per account, for browser checks on
// `pnpm dev` without Claude in Chrome (retro 1.4). Node 24's global WebSocket talks to Chrome; nothing to install.
// README.md in this folder has the commands and the limits.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
/** Profiles and screenshots go here, outside the repo. */
export const OUT = join(tmpdir(), 'compies-browser')
/** The DevTools port of each account's Chrome, so two accounts run side by side. */
export const PORTS = { host: 9311, member: 9312, admin: 9313 }

const CHROME = process.env.CHROME_PATH ?? {
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
}[process.platform] ?? 'google-chrome'

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

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

/** Starts Chrome for one account (`host`, `member`, `admin`) on its port in `PORTS` and connects to its page. */
export async function launch(account) {
  if (!existsSync(CHROME)) throw new Error(`No Chrome at ${CHROME}; set CHROME_PATH.`)
  const profile = join(OUT, `profile-${account}`)
  mkdirSync(profile, { recursive: true })
  const port = PORTS[account]
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = targets.find(target => target.type === 'page')
      if (page) return { account, ...(await connect(page.webSocketDebuggerUrl)), close: () => chrome.kill() }
    }
    catch {
      // Chrome is still starting.
    }
    await sleep(200)
  }
  chrome.kill()
  throw new Error(`Chrome for ${account} did not start`)
}

async function connect(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  let id = 0
  const waiting = new Map()
  /** Page errors and console errors, for the report. */
  const errors = []
  /** Native drags the page started (Input.dragIntercepted): a press that should have been the app's own drag. */
  const nativeDrags = []
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data)
    if (data.id && waiting.has(data.id)) {
      waiting.get(data.id)(data)
      waiting.delete(data.id)
    }
    else if (data.method === 'Input.dragIntercepted') nativeDrags.push(data.params)
    else if (data.method === 'Runtime.exceptionThrown' || (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error')) errors.push(JSON.stringify(data.params).slice(0, 300))
  }
  // A call with no answer after 30 s rejects, so a stuck Chrome fails the check instead of hanging it.
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id
    const timer = setTimeout(() => {
      waiting.delete(n)
      reject(new Error(`CDP ${method} timed out`))
    }, 30_000)
    waiting.set(n, (answer) => {
      clearTimeout(timer)
      resolve(answer)
    })
    socket.send(JSON.stringify({ id: n, method, params }))
  })
  async function evaluate(expression) {
    const answer = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (answer.result?.exceptionDetails) throw new Error(JSON.stringify(answer.result.exceptionDetails).slice(0, 500))
    return answer.result?.result?.value
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Input.setInterceptDrags', { enabled: true })
  return { send, evaluate, errors, nativeDrags }
}

/** The viewport; below 600 px it is a phone with touch. */
export async function resize(tab, width, height) {
  await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
  await tab.send('Emulation.setTouchEmulationEnabled', { enabled: width < 600 })
}

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

/** A PNG of the element matching `selector` (or of the viewport) in OUT; returns its path. */
export async function shot(tab, name, selector) {
  let clip
  if (selector) {
    const rect = await tab.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'start', behavior: 'instant' }); const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } })()`)
    clip = { ...rect, scale: 1 }
  }
  const answer = await tab.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) })
  const file = join(OUT, `${name}.png`)
  writeFileSync(file, Buffer.from(answer.result.data, 'base64'))
  return file
}
