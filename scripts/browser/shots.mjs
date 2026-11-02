// Screenshots of one page as the Dev Host and the Dev Member, at 1440 and 390 px (retro 1.4), for the PR and for
// comparing with the `.dc.html` artboards.
// Usage: node scripts/browser/shots.mjs <path> [css selector]   e.g. e/my-event 'section[aria-labelledby="board-title"]'
// The path goes without its leading slash: Git Bash turns an argument like /e/x into the Windows path E:/x.
import { launch, resize, shot, sleep } from './chrome.mjs'
import { open } from './kit.mjs'

const [given, selector] = process.argv.slice(2)
if (!given) throw new Error('Usage: node scripts/browser/shots.mjs <path without leading slash> [css selector]')
const path = `/${given.replace(/^\/+/, '')}`
const name = path.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home'

for (const account of ['host', 'member']) {
  const tab = await launch(account)
  try {
    await open(tab, path, 1440, 900, selector ?? 'body')
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await resize(tab, width, height)
      await sleep(1500)
      console.log(await shot(tab, `${name}-${account}-${width}`, selector))
    }
    if (tab.errors.length > 0) console.log(`  ${account} page errors:`, tab.errors.slice(0, 3))
  }
  finally {
    tab.close()
  }
}
