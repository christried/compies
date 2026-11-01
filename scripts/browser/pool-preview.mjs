// The two-account check of the Pool preview and the pool games' visibility (#224, #225): the Dev Host at 1440 px, the Dev
// Member at 390 px on one Event of its own. A Member sees picture and name of a pool game only (notes and player count are
// the Host's); the Host switches the Pool preview off and on and the Member's open page follows without a reload.
// Usage: node scripts/browser/pool-preview.mjs   (needs pnpm dev and pnpm dev:realtime; one PASS or FAIL line per check, exit code 1 on any FAIL)
import { launch, sleep } from './chrome.mjs'
import { api, createEvent, createGame, joinEvent, open, patchSettings } from './kit.mjs'

const stamp = Date.now().toString(36)
const gameName = `Pool-Check ${stamp}`
const notes = `Notiz-${stamp}: Map-Pack aus dem Workshop laden, Runden à 10 Minuten.`
const card = 'section:has(> dl)'
/** The row of the pool game on the Event page: the card's list entry that carries its name. */
const rowOf = `[...document.querySelectorAll(${JSON.stringify(`${card} li`)})].find(li => li.innerText.includes(${JSON.stringify(gameName)}))`

let failed = false
function check(name, passed, detail = '') {
  if (!passed) failed = true
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${passed || !detail ? '' : `  (${detail})`}`)
}

/** Polls `read` until it returns true, for at most `seconds`. */
async function within(seconds, read) {
  for (let i = 0; i < seconds * 5; i++) {
    if (await read()) return true
    await sleep(200)
  }
  return await read()
}

const host = await launch('host')
const member = await launch('member')
try {
  await open(host, '/bibliothek', 1440, 900)
  await open(member, '/', 390, 844)
  const game = await createGame(host, { name: gameName, playersMin: 2, playersMax: 8, notes })
  const { slug } = await createEvent(host, {
    name: `Pool-Check ${stamp}`,
    settings: { selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null, poolPreview: true },
    pools: { main: [game.id], tiebreaker: [] },
  })
  await joinEvent(member, slug, host)
  console.log(`Event ${slug}, game ${game.id}`)

  await open(host, `/e/${slug}`, 1440, 900, `${card} li`)
  await open(member, `/e/${slug}`, 390, 844, `${card} li`)

  const view = async tab => (await api(tab, 'GET', `/api/e/${slug}`)).body
  const memberView = await view(member)
  const faces = memberView.pools?.main ?? []
  check('Member: the pool games carry exactly id, name, imageUrl, youtubeId', faces.length === 1 && Object.keys(faces[0]).sort().join() === 'id,imageUrl,name,youtubeId', JSON.stringify(faces))
  check('Member: no notes anywhere in the read', !JSON.stringify(memberView).includes(notes))

  const hasNotesButton = tab => tab.evaluate(`!!(${rowOf})?.querySelector('button[aria-expanded]')`)
  const hasPlayers = tab => tab.evaluate(`/2–8/.test((${rowOf})?.innerText ?? '')`)
  check('Member: the card shows the game', await member.evaluate(`!!(${rowOf})`))
  check('Member: no „Notizen“ button', !(await hasNotesButton(member)))
  check('Member: no player count', !(await hasPlayers(member)))
  check('Host: the card shows the game', await host.evaluate(`!!(${rowOf})`))
  check('Host: the „Notizen“ button', await hasNotesButton(host))
  check('Host: the player count', await hasPlayers(host))

  // The Pool preview off: the Member's open page loses the list without a reload, and the read withholds the pools.
  await member.evaluate('window.__sameDocument = true')
  await patchSettings(host, slug, { poolPreview: false })
  const gone = await within(5, () => member.evaluate(`!(${rowOf}) && document.querySelectorAll(${JSON.stringify(`${card} li`)}).length === 0`))
  check('Preview off: the Member\'s open page has no pool list within 5 s', gone)
  check('Preview off: the page was not reloaded', await member.evaluate('window.__sameDocument === true'))
  const hidden = await view(member)
  check('Preview off: the read sends pools: null', hidden.pools === null, JSON.stringify(hidden.pools))
  check('Preview off: no notes in the read', !JSON.stringify(hidden).includes(notes))

  // On again: the list is back.
  await patchSettings(host, slug, { poolPreview: true })
  const back = await within(5, () => member.evaluate(`!!(${rowOf})`))
  check('Preview on: the Member\'s open page has the pool list again within 5 s', back)
  check('Preview on: the page was not reloaded', await member.evaluate('window.__sameDocument === true'))

  check('No page errors on the Host side', host.errors.length === 0, host.errors.slice(0, 2).join(' | '))
  check('No page errors on the Member side', member.errors.length === 0, member.errors.slice(0, 2).join(' | '))
}
finally {
  host.close()
  member.close()
}
process.exit(failed ? 1 : 0)
