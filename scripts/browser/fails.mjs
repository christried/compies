// Prints the FAIL lines of a check run's results.log that stand: every FAIL no later VOID line names (`log.void`, #833).
// The orchestrator reads a run's verdicts from it for the issue comment, without a hand-made list of the script's own faults.
//
//   node scripts/browser/fails.mjs <run> [<run> …]    (exit 0: none stands; exit 1: at least one stands, or a log is missing)
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OUT } from './chrome.mjs'
import { standingFails } from './kit.mjs'

const runs = process.argv.slice(2)
if (runs.length === 0) {
  console.log('usage: node scripts/browser/fails.mjs <run> [<run> …]')
  process.exit(1)
}
let standing = 0
for (const run of runs) {
  const log = join(OUT, run, 'results.log')
  if (!existsSync(log)) {
    console.log(`${run}: no results.log in ${join(OUT, run)}`)
    standing++
    continue
  }
  const fails = standingFails(readFileSync(log, 'utf8'))
  console.log(`${run}: ${fails.length} FAIL${fails.length === 1 ? '' : 's'} standing`)
  for (const line of fails) console.log(`  ${line}`)
  standing += fails.length
}
process.exit(standing > 0 ? 1 : 0)
