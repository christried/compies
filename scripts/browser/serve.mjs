// Starts and stops the servers of a browser check, and stops exactly the ones it started (spec #308, docs/agents/browser-frame.md § Setup).
// A TaskStop on a backgrounded `pnpm dev` ends the shell and leaves nuxt, the Worker, workerd and esbuild running on Windows, and the
// auto-mode classifier refuses `taskkill` on a PID. So the agent runs this script in the background instead: it owns the children
// and takes its own process tree down, however the run ends.
//   node scripts/browser/serve.mjs start <run> [--only=dev,realtime,prod] [--minutes=90] [--slot=1|2]
//   node scripts/browser/serve.mjs stop <run>
// `start` stays up after printing `ready: …`. It stops its tree when `stop` leaves <run folder>/serve.stop, when its parent process is
// gone (TaskStop, a dead agent shell), on SIGINT, SIGTERM, SIGBREAK or SIGHUP, and after --minutes (the backstop for an agent that dies
// mid-check). No dependency.
import { execFile, execFileSync, spawn } from 'node:child_process'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUT } from './chrome.mjs'
import { serversOf, slotOf } from './ports.mjs'

const WINDOWS = process.platform === 'win32'
const ROOT = fileURLToPath(new URL('../..', import.meta.url))

// `pnpm` is a .cmd on Windows: the command line goes to cmd.exe as one string, so the child's PID is the shell's, the root `taskkill /T` walks from.
// The servers and their ports come from the slot (ports.mjs, #567); `start` assigns them.
let SERVERS

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const stamp = () => new Date().toISOString().slice(11, 19)

const [command, run, ...rest] = process.argv.slice(2)
if (!['start', 'stop'].includes(command) || !run || !/^[\w.-]+$/.test(run)) {
  console.error('usage: node scripts/browser/serve.mjs start <run> [--only=dev,realtime,prod] [--minutes=90] [--slot=1|2]\n       node scripts/browser/serve.mjs stop <run>')
  process.exit(2)
}
const dir = join(OUT, run)
mkdirSync(dir, { recursive: true })
const stopFile = join(dir, 'serve.stop')
const logFile = join(dir, 'serve.log')

function say(line) {
  const text = `${stamp()} ${line}`
  console.log(text)
  appendFileSync(logFile, `${text}\n`)
}

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return error.code === 'EPERM'
  }
}

/** Whether something accepts connections on the port, on either loopback address. A bind test lies on Windows (a wildcard bind succeeds beside a loopback listener), and so does netstat (workerd's listener never shows in it on Windows 11). */
const accepts = port => Promise.all(['127.0.0.1', '::1'].map(host => new Promise((resolve) => {
  const socket = connect({ port, host, timeout: 1000 })
  socket.once('connect', () => (socket.destroy(), resolve(true)))
  socket.once('timeout', () => (socket.destroy(), resolve(false)))
  socket.once('error', () => resolve(false))
}))).then(answers => answers.some(Boolean))

/** The PID of the listener, if the platform will say (netstat rows with a remote address of `…:0`, whose state names are localized; lsof elsewhere). */
function listenerPid(port) {
  try {
    if (WINDOWS) {
      const rows = ['TCP', 'TCPv6'].flatMap(protocol => execFileSync('netstat', ['-ano', '-a', '-p', protocol], { encoding: 'latin1', windowsHide: true }).split(/\r?\n/))
      for (const row of rows) {
        const cells = row.trim().split(/\s+/)
        if (cells[0] === 'TCP' && cells[2]?.endsWith(':0') && cells[1].endsWith(`:${port}`)) return Number(cells.at(-1))
      }
      return null
    }
    return Number(execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n')[0]) || null
  }
  catch { return null }
}

/** `{ taken, pid }` for a port; `pid` is null when it is free or the platform doesn't say. */
async function portOwner(port) {
  return (await accepts(port)) ? { taken: true, pid: listenerPid(port) } : { taken: false, pid: null }
}

const describeOwner = ({ pid }) => (pid ? ` (PID ${pid} listens)` : '')

// Windows has no process groups. `taskkill /T` walks the parent links from a root, which holds while every link in the chain lives (cmd, pnpm,
// wrangler, workerd). To be safe against a link that exits and orphans its children, and against a serve.mjs that is itself killed hard,
// the tree is recorded while it runs (PID and creation time, which tells a recorded process from a reused PID) and the state file keeps it.
const TABLE_SCRIPT = 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CreationDate.ToFileTimeUtc())" }'
const parseTable = text => new Map(text.trim().split(/\r?\n/).map(row => row.trim().split(' ')).filter(cells => cells.length === 3).map(([pid, ppid, created]) => [Number(pid), { ppid: Number(ppid), created }]))
const tableSync = () => parseTable(execFileSync('powershell', ['-NoProfile', '-Command', TABLE_SCRIPT], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }))
const tableAsync = () => new Promise(resolve => execFile('powershell', ['-NoProfile', '-Command', TABLE_SCRIPT], { encoding: 'utf8', windowsHide: true }, (error, out) => resolve(error ? new Map() : parseTable(out))))

/** The roots that still exist and everything below them, as `{ pid, created }`. A child older than its parent is a reused PID. */
function descendants(table, roots) {
  const found = new Map()
  for (const pid of roots) if (table.has(pid)) found.set(pid, table.get(pid).created)
  for (let grew = true; grew;) {
    grew = false
    for (const [pid, info] of table) {
      if (!found.has(pid) && found.has(info.ppid) && BigInt(info.created) >= BigInt(found.get(info.ppid))) {
        found.set(pid, info.created)
        grew = true
      }
    }
  }
  return [...found].map(([pid, created]) => ({ pid, created }))
}

/** Ends the recorded processes that still run as the same processes; returns their PIDs. */
function killRecorded(recorded) {
  if (!WINDOWS || !recorded?.length) return []
  const table = tableSync()
  const left = recorded.filter(({ pid, created }) => table.get(pid)?.created === created).map(({ pid }) => pid)
  for (const pid of left) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore', windowsHide: true })
    }
    catch { /* gone meanwhile */ }
  }
  return left
}

if (command === 'stop') await stop()
else await start()

// ---------------------------------------------------------------------------------------------------------------------------------

async function stop() {
  const instances = readdirSync(dir).filter(f => /^serve-.+\.json$/.test(f)).map(f => ({ file: f, ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
  if (!instances.length) {
    say(`stop ${run}: no serve.mjs running for this run`)
    process.exit(0)
  }
  writeFileSync(stopFile, new Date().toISOString())
  const ports = instances.flatMap(i => i.children.map(c => c.port))
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline && instances.some(i => alive(i.pid))) await sleep(500)
  const gone = instances.filter(i => !alive(i.pid))
  if (gone.length < instances.length) say(`stop ${run}: serve.mjs PID ${instances.filter(i => alive(i.pid)).map(i => i.pid).join(', ')} still running after 30 s`)
  rmSync(stopFile, { force: true })
  for (const instance of gone) {
    // A serve.mjs that was killed hard (not stopped by itself) leaves its file and maybe its tree; the file records the processes it started, so end those.
    const leftover = killRecorded(instance.tree)
    if (leftover.length) say(`stop ${run}: ended the recorded leftovers of the dead serve.mjs PID ${instance.pid}: ${leftover.join(', ')}`)
    rmSync(join(dir, instance.file), { force: true })
  }
  const taken = []
  for (const port of ports) {
    let owner = await portOwner(port)
    for (let tries = 0; owner.taken && tries < 20; tries++) { // a socket closes a moment after its process ends
      await sleep(500)
      owner = await portOwner(port)
    }
    if (owner.taken) taken.push(`:${port}${describeOwner(owner)}`)
  }
  if (taken.length || gone.length < instances.length) {
    say(`stop ${run}: port ${taken.join(', ') || '-'} still taken`)
    process.exit(1)
  }
  say(`stopped: ports ${ports.map(p => `:${p}`).join(', ')} free`)
}

async function start() {
  const slotFlag = rest.find(a => a.startsWith('--slot='))?.slice(7)
  if (slotFlag !== undefined && !['1', '2'].includes(slotFlag)) {
    console.error(`--slot must be 1 or 2, got "${slotFlag}"`)
    process.exit(2)
  }
  if (slotFlag !== undefined && process.env.COMPIES_SLOT && process.env.COMPIES_SLOT !== slotFlag) {
    console.error(`--slot=${slotFlag} and COMPIES_SLOT=${process.env.COMPIES_SLOT} disagree`)
    process.exit(2)
  }
  const slot = slotFlag === undefined ? slotOf() : Number(slotFlag)
  SERVERS = serversOf(slot)
  const only = (rest.find(a => a.startsWith('--only='))?.slice(7) ?? 'dev,realtime').split(',').filter(Boolean)
  const minutes = Number(rest.find(a => a.startsWith('--minutes='))?.slice(10) ?? 90)
  if (!only.length || only.some(name => !SERVERS[name]) || !(minutes > 0)) {
    console.error(`--only takes ${Object.keys(SERVERS).join(', ')}; --minutes a positive number`)
    process.exit(2)
  }
  const label = only.join('-')
  const stateFile = join(dir, `serve-${label}.json`)

  // A run name belongs to one slot (#567): its logs and stop file are per run folder, and `stop <run>` ends the whole run.
  for (const file of readdirSync(dir).filter(f => /^serve-.+\.json$/.test(f))) {
    let other
    try {
      other = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    }
    catch { continue }
    if (alive(other.pid) && (other.slot ?? 1) !== slot) {
      say(`start ${run}: this run already serves slot ${other.slot ?? 1}; use another run name for slot ${slot}`)
      process.exit(1)
    }
  }

  if (existsSync(stateFile)) {
    const previous = JSON.parse(readFileSync(stateFile, 'utf8'))
    if (alive(previous.pid)) {
      say(`start ${run}: serve.mjs ${label} already runs for this run (PID ${previous.pid})`)
      process.exit(1)
    }
    rmSync(stateFile) // a stale file of a serve.mjs that was killed hard
  }
  for (const name of only) {
    const { needs } = SERVERS[name]
    if (needs && !existsSync(join(ROOT, needs))) {
      say(`start ${run}: ${needs} is missing, run \`pnpm build\` in the foreground first`)
      process.exit(1)
    }
    const owner = await portOwner(SERVERS[name].port)
    if (owner.taken) {
      say(`start ${run}: port ${SERVERS[name].port} (${name}) is taken${describeOwner(owner)}`)
      process.exit(1)
    }
  }
  rmSync(stopFile, { force: true })

  const parent = process.ppid
  const children = []
  const tree = new Map() // pid -> creation time of everything the children started, Windows only
  let stopping = false

  function killTree(child) {
    if (!child.pid) return
    try {
      if (WINDOWS) execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      else process.kill(-child.pid, 'SIGTERM')
    }
    catch { /* already gone */ }
  }

  async function shutdown(reason, exitCode = 0) {
    if (stopping) return
    stopping = true
    say(`stopping (${reason}): ${children.map(c => `${c.name} PID ${c.pid}`).join(', ')}`)
    for (const child of children) killTree(child)
    const orphans = killRecorded([...tree].map(([pid, created]) => ({ pid, created })))
    if (orphans.length) say(`ended ${orphans.length} processes the tree walk missed: ${orphans.join(', ')}`)
    if (!WINDOWS) {
      await sleep(5000)
      for (const child of children) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        }
        catch { /* gone */ }
      }
    }
    const taken = []
    const deadline = Date.now() + 15_000
    for (const child of children) {
      let owner = await portOwner(child.port)
      while (owner.taken && Date.now() < deadline) {
        await sleep(500)
        owner = await portOwner(child.port)
      }
      if (owner.taken) taken.push(`:${child.port}${describeOwner(owner)}`)
    }
    rmSync(stateFile, { force: true })
    if (taken.length) {
      say(`port ${taken.join(', ')} still taken after the stop`)
      process.exit(1)
    }
    say(`stopped: ports ${children.map(c => `:${c.port}`).join(', ')} free`)
    process.exit(exitCode)
  }

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(signal, () => shutdown(signal))
  process.on('uncaughtException', (error) => {
    say(`error: ${error.stack ?? error}`)
    shutdown('error', 1)
  })
  // Last resort when the process ends some other way: the sync part of the stop still runs.
  process.on('exit', () => {
    if (!stopping) for (const child of children) killTree(child)
  })

  for (const name of only) {
    const server = SERVERS[name]
    const out = openSync(join(dir, server.log), 'w')
    const options = { cwd: ROOT, stdio: ['ignore', out, out], windowsHide: true, env: { ...process.env, ...server.env } }
    const child = server.command
      ? spawn(server.command, { ...options, shell: true, detached: !WINDOWS })
      : spawn(process.execPath, server.args, { ...options, detached: !WINDOWS })
    closeSync(out)
    const entry = { name, port: server.port, pid: child.pid, exited: null }
    child.on('exit', code => (entry.exited = code ?? 'signal'))
    children.push(entry)
  }
  const started = new Date().toISOString()
  const persist = () => writeFileSync(stateFile, JSON.stringify({ pid: process.pid, slot, started, minutes, children: children.map(({ name, port, pid }) => ({ name, port, pid })), tree: [...tree].map(([pid, created]) => ({ pid, created })) }, null, 2))
  persist()
  say(`start ${run}: ${children.map(c => `${c.name} :${c.port} PID ${c.pid}`).join(', ')}; output in ${dir}`)

  // The recorded tree only grows (a process that exited is simply not found at the stop).
  let tracking = false
  async function track() {
    if (!WINDOWS || tracking || stopping) return
    tracking = true
    for (const { pid, created } of descendants(await tableAsync(), children.map(c => c.pid))) tree.set(pid, created)
    tracking = false
    if (!stopping) persist()
  }
  setTimeout(track, 1000)
  setInterval(track, 4000)

  setInterval(() => {
    if (!stopping && existsSync(stopFile)) shutdown('serve.stop')
  }, 1000)
  setInterval(() => {
    if (!stopping && !alive(parent)) shutdown('parent process gone')
  }, 2000)
  setTimeout(() => shutdown(`${minutes} minutes elapsed`), minutes * 60_000)

  const waitUntil = Date.now() + 180_000
  for (const child of children) {
    for (;;) {
      if (stopping) await sleep(60_000) // shutdown() ends the process
      if (child.exited !== null) await shutdown(`${child.name} exited with ${child.exited} before it answered, see ${SERVERS[child.name].log}`, 1)
      if (Date.now() > waitUntil) await shutdown(`${child.name} did not answer within 3 minutes`, 1)
      try {
        const { status } = await fetch(`http://localhost:${child.port}/`, { signal: AbortSignal.timeout(10_000) })
        if (status < 500 || !SERVERS[child.name].notBuilding) break // nuxt dev answers 503 while it builds
      }
      catch { /* not up yet */ }
      await sleep(1000)
    }
  }
  const ready = `ready: ${children.map(c => `${c.name} :${c.port}`).join(', ')}`
  console.log(ready)
  appendFileSync(logFile, `${stamp()} ${ready}\n`)
}
