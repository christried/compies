// The two-account check of the Pool preview and the pool games' visibility (#224, #225, #579): the Dev Host at 1440 px, the
// Dev Member at 390 px on one Event of its own. A pool game is a tile with picture and name for both (#435); a tap opens the
// game dialog, where a Member finds the player count and never the Notes or the library link (#444), and the Host finds all
// three (#443). The Host switches the Pool preview off and on and the Member's open page follows without a reload.
// Usage: node scripts/browser/pool-preview.mjs   (needs pnpm dev and pnpm dev:realtime; one PASS or FAIL line per check, exit code 1 on any FAIL;
// the lines also go to <tmp>/compies-browser/pool-preview/results.log)
import { launch, sleep } from './chrome.mjs'
import { api, createEvent, createGame, joinEvent, open, patchSettings, pressKey, results } from './kit.mjs'

const stamp = Date.now().toString(36)
const gameName = `Pool-Check ${stamp}`
const notes = `Notiz-${stamp}: Map-Pack aus dem Workshop laden, Runden à 10 Minuten.`
/** The game's player count, 3 to 8, as the game dialog spells it (`library.playersBetween`) and as a card would (`describeGame`). */
const players = { spelled: '3 bis 8', compact: '3–8' }
/** What a Member's read carries of a pool game: the keys of `PoolGameFace` (`shared/game.ts`), widened by #338 and #444. */
const FACE_KEYS = 'id,imageUrl,name,playersMax,playersMin,price,suitabilities,youtubeId'
const card = 'section:has(> dl)'
/** The tile of the pool game on the Event page: the card's list entry that carries its name. */
const rowOf = `[...document.querySelectorAll(${JSON.stringify(`${card} li`)})].find(li => li.innerText.includes(${JSON.stringify(gameName)}))`
/** The open game dialog, null when none is open. */
const dialogOf = `document.querySelector('[role=dialog]')`

const log = results('pool-preview')
const { check } = log

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
  const game = await createGame(host, { name: gameName, playersMin: 3, playersMax: 8, notes })
  const { slug } = await createEvent(host, {
    name: `Pool-Check ${stamp}`,
    settings: { selectionMode: 'admin_pick', hiddenWheel: false, vetoAllowance: null, poolPreview: true },
    pool: [game.id],
  })
  await joinEvent(member, slug, host)
  console.log(`Event ${slug}, game ${game.id}`)

  await open(host, `/e/${slug}`, 1440, 900, `${card} li`)
  await open(member, `/e/${slug}`, 390, 844, `${card} li`)

  const view = async tab => (await api(tab, 'GET', `/api/e/${slug}`)).body
  const memberView = await view(member)
  const faces = memberView.pool ?? []
  check(`Member: the pool games carry exactly ${FACE_KEYS}`, faces.length === 1 && Object.keys(faces[0]).sort().join() === FACE_KEYS, JSON.stringify(faces))
  check('Member: no notes anywhere in the read', !JSON.stringify(memberView).includes(notes))

  // The tile: picture and name, for the Host too. The player count and the Notes are the dialog's.
  const tileText = tab => tab.evaluate(`(${rowOf})?.innerText ?? ''`)
  const countOn = text => text.includes(players.spelled) || text.includes(players.compact)
  for (const [who, tab] of [['Member', member], ['Host', host]]) {
    const text = await tileText(tab)
    check(`${who}: the tile shows the game`, text.includes(gameName))
    check(`${who}: the tile has no player count and no Notes`, !countOn(text) && !text.includes(notes), JSON.stringify(text.replace(/\s+/g, ' ').trim()))
  }

  // The game dialog, opened by the tile's name button.
  const openDialog = async (tab) => {
    await tab.evaluate(`(${rowOf})?.querySelector('button')?.click()`)
    return within(3, () => tab.evaluate(`!!${dialogOf}?.innerText.includes(${JSON.stringify(gameName)})`))
  }
  const closeDialog = async (tab) => {
    await pressKey(tab, 'Escape')
    return within(3, () => tab.evaluate(`!${dialogOf}`))
  }
  const dialogText = tab => tab.evaluate(`${dialogOf}?.innerText ?? ''`)
  const libraryLink = tab => tab.evaluate(`!!${dialogOf}?.querySelector(${JSON.stringify(`a[href="/bibliothek/${game.id}"]`)})`)

  check('Member: a tap on the tile opens the game dialog', await openDialog(member))
  const memberDialog = await dialogText(member)
  check('Member: the dialog shows the player count', memberDialog.includes(players.spelled), JSON.stringify(memberDialog.replace(/\s+/g, ' ').trim()))
  check('Member: the dialog has no Notes', !memberDialog.includes(notes))
  check('Member: the dialog has no link to the library', !(await libraryLink(member)))
  check('Member: Escape closes the dialog', await closeDialog(member))

  check('Host: a click on the tile opens the game dialog', await openDialog(host))
  const hostDialog = await dialogText(host)
  check('Host: the dialog shows the player count', hostDialog.includes(players.spelled), JSON.stringify(hostDialog.replace(/\s+/g, ' ').trim().slice(0, 200)))
  check('Host: the dialog shows the Notes', hostDialog.includes(notes))
  check('Host: the dialog links to the game in the library', await libraryLink(host))
  check('Host: Escape closes the dialog', await closeDialog(host))

  // The Pool preview off: the Member's open page loses the list without a reload, and the read withholds the pool.
  await member.evaluate('window.__sameDocument = true')
  await patchSettings(host, slug, { poolPreview: false })
  const gone = await within(5, () => member.evaluate(`!(${rowOf}) && document.querySelectorAll(${JSON.stringify(`${card} li`)}).length === 0`))
  check('Preview off: the Member\'s open page has no pool list within 5 s', gone)
  check('Preview off: the page was not reloaded', await member.evaluate('window.__sameDocument === true'))
  const hidden = await view(member)
  check('Preview off: the read sends pool: null', hidden.pool === null, JSON.stringify(hidden.pool))
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
process.exit(log.failed ? 1 : 0)
