// The wording review's server (#631, spec #620 § The review page): serves the page, the recording's pictures and the model's modules,
// and reads and writes the answers file. Dependency-free `node:http`, on the loopback address only: the pictures show dev Users' data
// and a POST writes a repo file, so a request with a foreign Host (DNS rebinding) or a body that is not JSON is refused.
// Files are read per request (no cache): the walk or an agent may change them while the page is open. The page reads the model, it
// does not reshape it: the steps are computed here with `stepsOf`, and the page imports the same modules from /modules/.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUT } from '../browser/chrome.mjs'
import { answersFileName, answerMono, answerText, answerUnused, emptyAnswers, newestAnswersName, parseAnswers, serializeAnswers } from './answers.mjs'
import { checkReplacement } from './check-replacement.mjs'
import { flattenMessages } from './messages.mjs'
import { RETIRED } from './retired-words.mjs'
import { checkRecording, progressOf, stepsOf } from './review-model.mjs'

/** @typedef {import('./answers.mjs').AnswersFile} AnswersFile */
/** @typedef {import('./review-model.mjs').Step} Step */
/** @typedef {{ answersPath: string, answersName: string, baselineName: string | null, progress: { total: number, done: number, left: number } }} ReviewInfo */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../..')
const PAGE_DIR = join(HERE, 'review-page')
const MAX_BODY = 64 * 1024
const ANSWERS = ['passt', 'ersetzt', 'alternativen']
const UNUSED_ANSWERS = ['loeschen', 'behalten']
// The modules the page imports (page.mjs) and, through them, each other; nothing else of scripts/wording/ is served.
const MODULES = ['answers', 'review-model', 'check-replacement', 'messages', 'retired-words']
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
}

const NO_RECORDING = 'Aufnehmen: COMPIES_SLOT=2 node scripts/browser/serve.mjs start walk --wording (im Hintergrund), dann COMPIES_SLOT=2 node scripts/wording/walk.mjs, dann serve.mjs stop walk.'

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {string} path
 * @returns {string[]}
 */
function namesIn(path) {
  try {
    return readdirSync(path)
  }
  catch {
    return []
  }
}

/** The day an answers file is for: its name's date, else today. */
function sweptAtOf(/** @type {string} */ path) {
  return /^wording_(\d{4}-\d{2}-\d{2})\.json$/.exec(basename(path))?.[1] ?? answersFileName(new Date()).slice('wording_'.length, -'.json'.length)
}

/**
 * The answers file at `path`: an empty one when it does not exist yet (written on the first answer).
 * @param {string} path
 * @returns {{ answers: AnswersFile | null, problems: string[] }}
 */
function readAnswers(path) {
  if (!existsSync(path)) return { answers: emptyAnswers(sweptAtOf(path)), problems: [] }
  return parseAnswers(readFileSync(path, 'utf8'))
}

/**
 * The steps of the review from the files as they are now. Throws a sentence the operator can act on.
 * @param {string} recordingDir
 * @param {string} localePath
 */
function loadModel(recordingDir, localePath) {
  const recordingPath = join(recordingDir, 'recording.json')
  if (!existsSync(recordingPath)) throw new Error(`Keine Aufnahme in ${recordingDir}. ${NO_RECORDING}`)
  /** @type {unknown} */
  let recording
  try {
    recording = JSON.parse(readFileSync(recordingPath, 'utf8'))
  }
  catch (error) {
    throw new Error(`recording.json ist kein gültiges JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const problems = checkRecording(recording)
  if (problems.length > 0) {
    const more = problems.length > 10 ? [`… und ${problems.length - 10} weitere`] : []
    throw new Error(`Die Aufnahme in ${recordingDir} ist nicht in Ordnung (${problems.length} Probleme):\n${[...problems.slice(0, 10), ...more].map(problem => `- ${problem}`).join('\n')}`)
  }
  const checked = /** @type {import('./review-model.mjs').Recording} */ (recording)

  const unusedPath = join(recordingDir, 'unused.json')
  /** @type {import('./review-model.mjs').Unused | null} */
  let unused = null
  if (existsSync(unusedPath)) {
    try {
      unused = JSON.parse(readFileSync(unusedPath, 'utf8'))
    }
    catch (error) {
      throw new Error(`unused.json ist kein gültiges JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const messages = flattenMessages(JSON.parse(readFileSync(localePath, 'utf8')))
  const { steps, problems: stepProblems } = stepsOf({ messages, recording: checked, unused })
  return { recording: checked, steps, problems: stepProblems, hasUnused: unused !== null }
}

/**
 * The copy rules the page shows: the tone line and § Rules for developers of 06-copy.md, plain text. A missing file shows nothing.
 * @param {string} rulesPath
 */
function readRules(rulesPath) {
  let text = ''
  try {
    text = readFileSync(rulesPath, 'utf8')
  }
  catch {
    return { tone: '', developers: '' }
  }
  const tone = text.split('\n').find(line => line.startsWith('Tone:')) ?? ''
  const start = text.search(/^## Rules for developers\s*$/m)
  let developers = ''
  if (start !== -1) {
    const rest = text.slice(start).split('\n').slice(1).join('\n')
    const next = rest.search(/^## /m)
    developers = (next === -1 ? rest : rest.slice(0, next)).trim()
  }
  return { tone: tone.trim(), developers }
}

/**
 * Which answers file a sitting continues: the newest wording_*.json that still has an open step (so one command resumes a sweep over
 * days), else a new file for today. A newest file that cannot be read is chosen anyway, so the start stops on it and never writes a new
 * file beside a broken one.
 * @param {string[]} names the file names of the answers folder
 * @param {Step[]} steps
 * @param {(name: string) => AnswersFile | null} answersOf
 * @param {Date} [today]
 * @returns {string}
 */
export function chooseAnswersFile(names, steps, answersOf, today = new Date()) {
  const newest = newestAnswersName(names)
  if (!newest) return answersFileName(today)
  const answers = answersOf(newest)
  if (!answers) return newest
  return progressOf(steps, answers).left > 0 ? newest : answersFileName(today)
}

/**
 * Not listening yet: a test listens on port 0, the command on its port. Rejects with a sentence when there is no recording, when the
 * recording fails its check, or when the answers file cannot be read (never saved over, #628). `server.info` says which file it fills.
 * @param {{ recordingDir?: string, answersPath?: string, answersDir?: string, localePath?: string, rulesPath?: string }} [options]
 *   `answersDir` is where an answers file is looked for when `answersPath` is not given (default docs/reviews)
 * @returns {Promise<import('node:http').Server & { info: ReviewInfo }>}
 */
export async function createReviewServer({
  recordingDir = join(OUT, 'wording'),
  answersPath,
  answersDir = join(ROOT, 'docs/reviews'),
  localePath = join(ROOT, 'i18n/locales/de.json'),
  rulesPath = join(ROOT, 'docs/design_handoff_compies/06-copy.md'),
} = {}) {
  const start = loadModel(recordingDir, localePath)

  let answersFile = answersPath
  if (!answersFile) {
    const names = namesIn(answersDir)
    answersFile = join(answersDir, chooseAnswersFile(names, start.steps, name => readAnswers(join(answersDir, name)).answers))
  }
  const target = answersFile
  const first = readAnswers(target)
  if (!first.answers) throw new Error(`Die Antwortdatei ${target} ist nicht lesbar, sie wird nicht überschrieben:\n${first.problems.map(problem => `- ${problem}`).join('\n')}`)

  /** @returns {{ name: string | null, answers: AnswersFile | null }} */
  const baselineOf = () => {
    const name = newestAnswersName(namesIn(dirname(target)), { except: basename(target) })
    if (!name) return { name: null, answers: null }
    const answers = readAnswers(join(dirname(target), name)).answers
    return { name: answers ? name : null, answers }
  }

  /**
   * @param {import('node:http').ServerResponse} response
   * @param {number} status
   * @param {unknown} body
   */
  const sendJson = (response, status, body) => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    response.end(JSON.stringify(body))
  }
  /**
   * @param {import('node:http').ServerResponse} response
   * @param {string} path
   * @param {string} extension
   */
  const sendFile = (response, path, extension) => {
    let content
    try {
      content = readFileSync(path)
    }
    catch {
      sendJson(response, 404, { error: 'Nicht gefunden' })
      return
    }
    response.writeHead(200, { 'content-type': TYPES[/** @type {keyof typeof TYPES} */ (extension)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    response.end(content)
  }

  /** @param {import('node:http').ServerResponse} response */
  function sendState(response) {
    const model = loadModel(recordingDir, localePath)
    const mine = readAnswers(target)
    const baseline = baselineOf()
    sendJson(response, 200, {
      steps: model.steps,
      problems: model.problems,
      answers: mine.answers,
      answerProblems: mine.problems,
      baseline: baseline.answers,
      baselineName: baseline.name,
      answersName: basename(target),
      recording: { recordedAt: model.recording.recordedAt, commit: model.recording.commit },
      rules: readRules(rulesPath),
      retired: RETIRED,
      hasUnused: model.hasUnused,
    })
  }

  /**
   * One answer: looked up by id here (the body's own text is never trusted), checked, merged into the file as it is on disk, written
   * to a temp file and renamed, all before the response.
   * @param {import('node:http').ServerResponse} response
   * @param {unknown} body
   */
  function saveAnswer(response, body) {
    if (!isRecord(body) || typeof body.id !== 'string' || body.id === '') return sendJson(response, 400, { error: 'Es fehlt eine id' })
    const model = loadModel(recordingDir, localePath)
    const step = model.steps.find(candidate => candidate.id === body.id)
    if (!step) return sendJson(response, 404, { error: `Schritt ${body.id} gibt es nicht` })
    const { answer, replacement, comment } = body
    if (comment !== undefined && typeof comment !== 'string') return sendJson(response, 400, { error: 'comment ist kein Text' })
    const disk = readAnswers(target)
    if (!disk.answers) return sendJson(response, 500, { error: `Die Antwortdatei ist nicht lesbar: ${disk.problems.join('; ')}` })
    let next = disk.answers
    /** @type {{ code: string, reason: string }[]} */
    let warnings = []

    if (step.kind === 'unused') {
      if (comment !== undefined) return sendJson(response, 400, { error: 'Eine ungenutzte Gruppe nimmt keinen Kommentar' })
      if (typeof answer !== 'string' || !UNUSED_ANSWERS.includes(answer)) return sendJson(response, 400, { error: 'answer: loeschen oder behalten' })
      next = answerUnused(next, step.group, /** @type {'loeschen' | 'behalten'} */ (answer))
    }
    else if (step.kind === 'mono') {
      if (answer !== undefined) return sendJson(response, 400, { error: 'Ein Mono-Schritt nimmt nur einen Kommentar' })
      if (typeof comment !== 'string') return sendJson(response, 400, { error: 'comment fehlt' })
      next = answerMono(next, step.id.slice('mono:'.length), comment)
    }
    else {
      const text = step.text ?? ''
      /** @type {Partial<import('./answers.mjs').TextAnswer>} */
      let patch = {}
      if (answer === undefined) {
        if (typeof comment !== 'string') return sendJson(response, 400, { error: 'Es fehlt answer oder comment' })
      }
      else if (typeof answer !== 'string' || !ANSWERS.includes(answer)) return sendJson(response, 400, { error: 'answer: passt, ersetzt oder alternativen' })
      else {
        patch = { text, answer: /** @type {import('./answers.mjs').Answer} */ (answer) }
        if (answer === 'ersetzt') {
          if (typeof replacement !== 'string' || replacement.trim() === '') return sendJson(response, 400, { error: 'replacement fehlt' })
          const check = checkReplacement(text, replacement)
          if (!check.ok) return sendJson(response, 422, { refusals: check.refusals, warnings: check.warnings })
          warnings = check.warnings
          // The message typed again is „passt“.
          if (replacement.trim() === text) patch = { text, answer: 'passt' }
          else patch.replacement = replacement.trim()
        }
      }
      if (typeof comment === 'string') patch.comment = comment
      // A comment alone does not re-stamp an entry: its answer is still about the text it was given for.
      const entry = step.kind === 'fixed' ? next.fixed[step.id.slice('fixed:'.length)] : next.texts[step.id]
      if (!entry && patch.text === undefined) patch.text = text
      next = answerText(next, step.id, patch)
    }

    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(`${target}.tmp`, serializeAnswers(next))
    renameSync(`${target}.tmp`, target)
    return sendJson(response, 200, { answers: next, warnings })
  }

  const server = createServer((request, response) => {
    try {
      handle(request, response)
    }
    catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @param {import('node:http').IncomingMessage} request
   * @param {import('node:http').ServerResponse} response
   */
  function handle(request, response) {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const host = (request.headers.host ?? '').toLowerCase()
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return sendJson(response, 403, { error: 'Host nicht erlaubt' })

    const { pathname } = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method === 'POST') {
      if (pathname !== '/api/answer') return sendJson(response, 404, { error: 'Nicht gefunden' })
      if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return sendJson(response, 415, { error: 'Nur application/json' })
      /** @type {Buffer[]} */
      const chunks = []
      let size = 0
      request.on('data', (chunk) => {
        size += chunk.length
        if (size <= MAX_BODY) chunks.push(chunk)
      })
      request.on('end', () => {
        try {
          if (size > MAX_BODY) return sendJson(response, 413, { error: 'Zu groß' })
          /** @type {unknown} */
          let body
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          }
          catch {
            return sendJson(response, 400, { error: 'Kein gültiges JSON' })
          }
          saveAnswer(response, body)
        }
        catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      })
      return
    }
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'Nur GET und POST' })

    if (pathname === '/') return sendFile(response, join(PAGE_DIR, 'index.html'), '.html')
    if (pathname === '/page.mjs') return sendFile(response, join(PAGE_DIR, 'page.mjs'), '.mjs')
    if (pathname === '/page.css') return sendFile(response, join(PAGE_DIR, 'page.css'), '.css')
    if (pathname === '/api/state') return sendState(response)
    const module = /^\/modules\/([\w-]+)\.mjs$/.exec(pathname)?.[1]
    if (module && MODULES.includes(module)) return sendFile(response, join(HERE, `${module}.mjs`), '.mjs')
    // Only a picture number, so no path can leave the folder.
    const picture = /^\/pictures\/(\d+\.jpg)$/.exec(pathname)?.[1]
    if (picture) return sendFile(response, join(recordingDir, 'pictures', picture), '.jpg')
    return sendJson(response, 404, { error: 'Nicht gefunden' })
  }

  const info = {
    answersPath: target,
    answersName: basename(target),
    baselineName: baselineOf().name,
    progress: (({ total, done, left }) => ({ total, done, left }))(progressOf(start.steps, first.answers)),
  }
  return Object.assign(server, { info })
}
