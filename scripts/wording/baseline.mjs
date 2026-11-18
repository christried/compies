// The baseline of „neu seit dem letzten Durchgang“ (#620, #810): every answers file git tracks, merged, the newer answer winning per key.
// Until 0.16.1 it was the newest tracked file alone, and the Tour's sweep (63 steps) would have made every other text new again.
// Reads files, so it is no module of the review page (`review-server.mjs` serves `answers.mjs`, which is pure, to the page).
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { answersFileName, emptyAnswers, mergeAnswers, parseAnswers } from './answers.mjs'

/** @typedef {import('./answers.mjs').AnswersFile} AnswersFile */

const NAME = /^wording_\d{4}-\d{2}-\d{2}\.json$/

/**
 * @param {string} path
 * @returns {string[]}
 */
export function namesIn(path) {
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
export function readAnswers(path) {
  if (!existsSync(path)) return { answers: emptyAnswers(sweptAtOf(path)), problems: [] }
  return parseAnswers(readFileSync(path, 'utf8'))
}

/**
 * The files of `dir` that git tracks, by name; null when git cannot say (not a repo, no git, no folder). The baseline of a sweep is
 * a committed one: an answers file the operator has not committed yet is no earlier sweep (#620).
 * @param {string} dir
 * @returns {string[] | null}
 */
export function gitTrackedNames(dir) {
  try {
    return execFileSync('git', ['ls-files', '--', '.'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').map(line => line.trim()).filter(line => line !== '' && !line.includes('/'))
  }
  catch {
    return null
  }
}

/**
 * The baseline of a sweep: the answers files of `dir` (named `wording_YYYY-MM-DD.json`), without `except` (the file being filled), restricted
 * to the ones `tracked(dir)` names (null: git cannot say, every file counts), each read, merged oldest first. A file that cannot be read is
 * left out of the merge and of the name. `name` is the files' names joined with ` + `, oldest first; none readable: both are null.
 * @param {string} dir
 * @param {{ except?: string | null, tracked?: (dir: string) => string[] | null }} [options]
 * @returns {{ name: string | null, answers: AnswersFile | null }}
 */
export function readBaseline(dir, { except = null, tracked = gitTrackedNames } = {}) {
  const held = tracked(dir)
  const names = namesIn(dir).filter(name => NAME.test(name) && name !== except && (held === null || held.includes(name))).sort()
  /** @type {string[]} */
  const read = []
  /** @type {AnswersFile[]} */
  const files = []
  for (const name of names) {
    const { answers } = readAnswers(join(dir, name))
    if (!answers) continue
    read.push(name)
    files.push(answers)
  }
  if (files.length === 0) return { name: null, answers: null }
  return { name: read.join(' + '), answers: mergeAnswers(files) }
}
