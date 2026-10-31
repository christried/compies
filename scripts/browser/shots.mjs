// Screenshots of one page as the Dev Host and the Dev Member, at 1440 and 390 px (retro 1.4), for the PR and for
// comparing with the `.dc.html` artboards.
// Usage: node scripts/browser/shots.mjs <path> [css selector]   e.g. /e/my-event 'section[aria-labelledby="board-title"]'
import { launch, open, resize, shot, sleep } from './cdp.mjs'

const [path, selector] = process.argv.slice(2)
if (!path) throw new Error('Usage: node scripts/browser/shots.mjs <path> [css selector]')
const name = path.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home'

for (const [account, port] of [['host', 9311], ['member', 9312]]) {
  const tab = await launch(account, port)
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
