// Prints the message keys one page carries, with their boxes (#627, spec #620 § Telling the texts apart): opens the page as a dev User
// and reads the keys the dev server put into its texts. Needs the server started with the key tags:
//   node scripts/browser/serve.mjs start <run> --wording        (COMPIES_SLOT=2 for slot 2)
//   node scripts/wording/keys.mjs <path> [--as=host|member|admin|member2] [--width=1440|390] [--signed-out]
// The path goes without its leading slash (Git Bash turns /e/x into a Windows path, as shots.mjs notes); `home` is `/`. One line per text or
// attribute: key, kind, element, box in CSS px, and the text when it is the message verbatim. The full rows go to
// <tmp>/compies-browser/wording/keys-<path>-<account>-<width>.json, outside the repo. Exit code 0; 1 when the page carries no key; 2 for usage.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, OUT, sleep } from '../browser/chrome.mjs'
import { open, openSignedOut } from '../browser/kit.mjs'
import de from '../../i18n/locales/de.json' with { type: 'json' }
import { flatten, lineOf, readKeys, summaryOf } from './read-keys.mjs'

const ACCOUNTS = ['host', 'member', 'admin', 'member2']
const HEIGHTS = { 1440: 900, 390: 844 }

const args = process.argv.slice(2)
const flag = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const given = args.find(arg => !arg.startsWith('--'))
const account = flag('as') ?? 'host'
const width = Number(flag('width') ?? 1440)
const signedOut = args.includes('--signed-out')
if (!given || !ACCOUNTS.includes(account) || !(width in HEIGHTS)) {
  console.error('usage: node scripts/wording/keys.mjs <path without leading slash, or home> [--as=host|member|admin|member2] [--width=1440|390] [--signed-out]')
  process.exit(2)
}
const path = given === 'home' ? '/' : `/${given.replace(/^\/+/, '')}`
const slug = path.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home'
const messages = flatten(de)

const tab = await launch(account)
let exitCode = 0
try {
  if (signedOut) await openSignedOut(tab, path, width, HEIGHTS[width], 'h1')
  else await open(tab, path, width, HEIGHTS[width])
  await sleep(1500)
  const { rows, untagged } = await readKeys(tab)
  if (!rows.length) {
    console.log('no keys: start the dev server with COMPIES_WORDING=1 (node scripts/browser/serve.mjs start <run> --wording)')
    exitCode = 1
  }
  else {
    for (const row of rows) console.log(lineOf(row, messages))
    const { rows: count, keys, missing, untagged: loose, partial } = summaryOf(rows, messages, untagged)
    console.log(`${path} as ${signedOut ? 'signed out' : account} at ${width}: ${count} rows, ${keys} distinct keys, ${missing} missing from de.json, ${loose} untagged text nodes, ${partial} partial rows`)
    const dir = join(OUT, 'wording')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `keys-${slug}-${signedOut ? 'signed-out' : account}-${width}.json`), JSON.stringify({ path, account, width, signedOut, untagged, rows }, null, 2))
  }
}
finally {
  tab.close()
}
process.exit(exitCode)
