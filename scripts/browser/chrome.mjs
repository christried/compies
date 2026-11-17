// Headless Chrome over the DevTools protocol, one profile (and so one cookie jar) per account (retro 1.4). Node 24's
// global WebSocket talks to Chrome; nothing to install. This module knows nothing about COMPIES: launch, connect,
// send/evaluate, resize, screenshot. What a COMPIES check needs on top (sign-in, API, drag, scenario helpers) is in
// `kit.mjs`; README.md in this folder has the commands and the limits.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { portsOf, profileOf, slotOf } from './ports.mjs'

/** Profiles and screenshots go here, outside the repo. */
export const OUT = join(tmpdir(), 'compies-browser')
/** The DevTools port of each account's Chrome, so two accounts run side by side; slot 2 (COMPIES_SLOT, ports.mjs) is 100 higher. */
export const PORTS = portsOf(slotOf()).chrome

const CHROME = process.env.CHROME_PATH ?? {
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
}[process.platform] ?? 'google-chrome'

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Makes Chrome report a hovering fine pointer (a mouse) to every page it loads, whatever the machine has (retro 0.14,
 * #780). Headless Chrome answers `(hover: hover)` and `(pointer: fine)` as the machine does, and on the operator's
 * machine the answer changed within minutes on 2026-11-16: every hover item of a 0.14 run failed, since Tailwind puts
 * each `hover:` rule inside `@media (hover: hover)`. The protocol's media emulation ignores both features (tried
 * 2026-11-15 and 2026-11-16). Measured on 2026-11-16: the setting holds through a page load, device metrics and a colour
 * scheme; a phone tab (`resize` below 600 px) still reports a coarse pointer without hover, also after a page load; and
 * `Emulation.setTouchEmulationEnabled` puts the machine's own answer back until the next page load, so read a hover
 * item after `open()`, never after a bare `resize()`.
 */
const HOVERING_MOUSE = '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4'

/**
 * @public For the agents' own checks (docs/agents/browser-frame.md). One Chrome per account, as `{ host, member, … }`;
 * `options` are `launch`'s.
 */
export async function launchAll(accounts, options) {
  const tabs = {}
  for (const account of accounts) tabs[account] = await launch(account, options)
  return tabs
}

/** @public For the agents' own checks (docs/agents/browser-frame.md). Stops every Chrome `launchAll` started. */
export function closeAll(tabs) {
  for (const tab of Object.values(tabs)) tab.close()
}

/**
 * Starts Chrome for one account (`host`, `member`, `admin`, `member2`) on its port in `PORTS` and connects to its page.
 * `scrollbars: true` leaves Chrome its classic scrollbar (15 px wide at 1440 px on Windows), for an item about the page
 * moving sideways when a scrollbar comes or goes: the kit hides scrollbars otherwise, so no layout number depends on
 * them, and #658's reading in 0.14 had to go to the operator's own Chrome (#780).
 */
export async function launch(account, { scrollbars = false } = {}) {
  if (!existsSync(CHROME)) throw new Error(`No Chrome at ${CHROME}; set CHROME_PATH.`)
  // One Chrome per profile folder and cookies ignore ports, so slot 2 has its own folders (#567).
  const profile = join(OUT, profileOf(slotOf(), account))
  mkdirSync(profile, { recursive: true })
  const port = PORTS[account]
  // Headless Chrome plays sound on the machine's speakers: a Clip check played its YouTube video out loud. Muted, the
  // video still plays and reports its time and state.
  // A sound check (#537) needs Chrome with and without `--autoplay-policy=no-user-gesture-required`: headless Chrome
  // holds an AudioContext back until a gesture, like a window does. `COMPIES_CHROME_FLAGS` adds flags, split at spaces.
  const extra = (process.env.COMPIES_CHROME_FLAGS ?? '').split(' ').filter(Boolean)
  // Chrome takes one `--blink-settings` flag: a check that brings its own (the no-hover case) replaces the kit's.
  const pointer = extra.some(flag => flag.startsWith('--blink-settings=')) ? [] : [HOVERING_MOUSE]
  const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', ...(scrollbars ? [] : ['--hide-scrollbars']), ...pointer, ...extra, 'about:blank'], { stdio: 'ignore' })
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

/**
 * The viewport; below 600 px it is a phone with touch. It returns once the page's `innerWidth` is the new width and a
 * frame has been drawn at it, so a media query has answered before the next reading: twice in 0.14 a page was measured
 * while its viewport had not followed, and an item failed on a page that was right (#780). A page that never takes the
 * width (a phone page without a viewport meta lays out at 980 px) is waited on for two seconds, then left as it is; so
 * is a page that is just navigating away.
 */
export async function resize(tab, width, height) {
  await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
  await tab.send('Emulation.setTouchEmulationEnabled', { enabled: width < 600 })
  try {
    await tab.evaluate(`new Promise((resolve) => {
      const end = performance.now() + 2000
      const settle = () => innerWidth === ${Number(width)} || performance.now() > end ? requestAnimationFrame(() => resolve()) : setTimeout(settle, 20)
      settle()
    })`)
  }
  catch {
    // The page went away under the reading; the next page starts at the new width.
  }
}

/** The device's colour scheme (`prefers-color-scheme`): `'dark'` or `'light'`, for every page the tab opens until it is set again. */
export async function colorScheme(tab, value) {
  await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] })
}

/** A PNG of the element matching `selector` (or of the viewport) in `dir`; returns its path. */
export async function shot(tab, name, selector, dir = OUT) {
  let clip
  if (selector) {
    const rect = await tab.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'start', behavior: 'instant' }); const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } })()`)
    clip = { ...rect, scale: 1 }
  }
  const answer = await tab.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) })
  const file = join(dir, `${name}.png`)
  writeFileSync(file, Buffer.from(answer.result.data, 'base64'))
  return file
}
