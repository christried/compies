// Headless Chrome over the DevTools protocol, one profile (and so one cookie jar) per account (retro 1.4). Node 24's
// global WebSocket talks to Chrome; nothing to install. This module knows nothing about COMPIES: launch, connect,
// send/evaluate, resize, screenshot. What a COMPIES check needs on top (sign-in, API, drag, scenario helpers) is in
// `kit.mjs`; README.md in this folder has the commands and the limits.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Profiles and screenshots go here, outside the repo. */
export const OUT = join(tmpdir(), 'compies-browser')
/** The DevTools port of each account's Chrome, so two accounts run side by side. */
export const PORTS = { host: 9311, member: 9312, admin: 9313 }

const CHROME = process.env.CHROME_PATH ?? {
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
}[process.platform] ?? 'google-chrome'

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

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
