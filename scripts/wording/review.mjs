// The wording review page (#631, spec #620 § The review page). Run by hand with node:
//   node scripts/wording/review.mjs [--new] [--recording=<dir>] [--answers=<file>] [--port=<n>] [--no-open]
// Starts a local server on 127.0.0.1 and opens the browser. The recording is the walk's (scripts/wording/walk.mjs, default
// <tmp>/compies-browser/wording/); the answers file is --answers, else with --new today's (a new sweep, or today's resumed), else the
// newest docs/reviews/wording_<date>.json that still has an open step, else a new one for today. It holds copy only. The pictures show dev Users' data: the server never leaves localhost.
import { spawn } from 'node:child_process'
import { createReviewServer } from './review-server.mjs'

const DEFAULT_PORT = 4747

/** @param {string[]} args */
function parseArgs(args) {
  /** @type {{ recordingDir?: string, answersPath?: string, newSweep: boolean, port: number, open: boolean }} */
  const options = { port: DEFAULT_PORT, open: true, newSweep: false }
  for (const arg of args) {
    if (arg.startsWith('--recording=')) options.recordingDir = arg.slice('--recording='.length)
    else if (arg.startsWith('--answers=')) options.answersPath = arg.slice('--answers='.length)
    else if (arg.startsWith('--port=')) options.port = Number(arg.slice('--port='.length))
    else if (arg === '--no-open') options.open = false
    else if (arg === '--new') options.newSweep = true
    else fail(`Unbekannte Option ${arg}. Benutzung: node scripts/wording/review.mjs [--new] [--recording=<dir>] [--answers=<file>] [--port=<n>] [--no-open]`)
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) fail('--port: eine Zahl von 1 bis 65535')
  return options
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(message)
  process.exit(1)
}

/** @param {string} url */
function openBrowser(url) {
  const [command, args] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.on('error', () => console.log(`Der Browser ging nicht von selbst auf: ${url}`))
  child.unref()
}

const options = parseArgs(process.argv.slice(2))

/** @type {Awaited<ReturnType<typeof createReviewServer>>} */
let server
try {
  server = await createReviewServer({ recordingDir: options.recordingDir, answersPath: options.answersPath, newSweep: options.newSweep })
}
catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

server.on('error', (/** @type {NodeJS.ErrnoException} */ error) => {
  fail(error.code === 'EADDRINUSE' ? `Port ${options.port} ist belegt (--port=<n> nimmt einen anderen)` : error.message)
})
await new Promise(listening => server.listen(options.port, '127.0.0.1', () => listening(undefined)))

const { info } = server
console.log(`Antwortdatei: ${info.answersPath} (erledigt ${info.progress.done}, offen ${info.progress.left})`)
for (const problem of info.answerProblems) console.log(`  Eintrag nicht gelesen: ${problem}`)
console.log(info.baselineName ? `Früherer Durchgang: ${info.baselineName}` : 'Kein früherer Durchgang: alles ist neu')
if (!info.hasUnused) console.log('Ohne unused.json gibt es keine Schritte für ungenutzte Texte: node scripts/wording/unused.mjs schreibt sie.')
const url = `http://127.0.0.1:${options.port}/`
console.log(`Prüfseite: ${url}`)
if (options.open) openBrowser(url)
