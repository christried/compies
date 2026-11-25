// The wording walk's states for the texts Release 0.21 added (#921, spec #907): the card „Profil“ with its own picture (the crop, the busy states, the failures, the removal), the section
// „Konto löschen“ with its sheet, a finished Event with a Deleted User („Gelöschtes Konto“, a Message that reads „Gelöscht“) and an Event page whose Event is gone, and §§ 5, 6, 7, 16 and
// 18 of the Datenschutzerklärung. Only the walk loads this file (`states.mjs` with `extra: 'walk-states-'`); the dark check never does. `dark.mjs` documents the State shape,
// `dark-states-event.mjs` the pair of readers (`<name>-host`, the Dev Host at 1440, and `<name>-spieler`, the Dev Member at 390) and the Events it makes.
//
// The picture. A real upload needs the image store, which the dev server has only with R2_* values (none on the dev machine): the walk's server is started with an in-memory stand-in for
// R2 (a `--require` preload, outside the repo), and `profil-bild-eigenes` fails to reach its state without one. The file picked is made in the page (a canvas as a PNG, put into the file
// input as a pick would), so no file of the walk's is on a disk. Every state that uploads takes the picture away in its `after` and `cleanup` does it for the three tabs again, so no dev
// User keeps one (the walk's log says so).
// The fakes are walk-only, as the Archive's and the Chat's: a replaced `fetch` in the page answers the one call a state is about (a failed save, a removal that fails, a read that never
// answers) and `createImageBitmap` held back shows the busy conversion; the counts of the sheet (`GET /api/me/hosted`) are faked for every sheet state, since the dev Users' own counts
// (the Dev Host's library, the Events of every earlier check) are not the ones a state is about, and a Host with exactly one Event exists on no dev database.
//
// The Deleted User. A deletion cannot be faked in the page, so the walk deletes one of its own Users: the Dev Member 2 (`member2`, a fourth Chrome the file starts itself, as no state
// has it among the tabs) is the third Party of a finished Event and writes a Message, then deletes the account through `DELETE /api/me`. The dev sign-in makes the User again at the next
// sign-in, so no later state meets a gap. Never `host` (its library is the dev library) or `member`. The Game board shows no Deleted User in any state a User can reach: the stage of
// a finished Event lists no board, and a deletion takes the User off the Seat of every Event that has not finished, so `board.*` has no state here and the report says so.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { launch, sleep } from './chrome.mjs'
import { api, clickText, createEvent, enterResult, joinEvent, ok, open, placesOf, runningEvent } from './kit.mjs'
import { BUILDS, host, layerOpen, member, pair, pool, press, signIn, stop, until } from './dark-states-event.mjs'
import { holdPress, UNTAG } from './walk-kit.mjs'

const COPY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/de.json'), 'utf8'))

// ---------------------------------------------------------------------------------------------------------------------------------
// The plan

/**
 * The state that shows each text of 0.21 (key → state name, the pair's `-host` and `-spieler` left off). A `profile.*` (the picture's), `accountDelete.*` key, `common.deletedUser`, the
 * Datenschutzerklärung's changed sections or `error.imageUnsupported` of `de.json` that is in neither this table nor `UNREACHED` fails `test/unit/wording-walk-021.test.ts`, so a text added
 * later is planned before it is merged.
 */
export const CLAIMS = {
  'profile.upload': 'profil',
  'profile.avatarHelp': 'profil',
  'profile.imageConverting': 'profil-bild-umwandeln',
  'profile.imageConvertFailed': 'profil-bild-umwandeln-fehler',
  'profile.imageUploading': 'profil-bild-laedt-hoch',
  'profile.imageUploadFailed': 'profil-bild-hochladen-fehler',
  'profile.avatarHelpOwn': 'profil-bild-eigenes',
  'profile.removeImage': 'profil-bild-eigenes',
  'profile.imageRemoveFailed': 'profil-bild-entfernen-fehler',
  'accountDelete.title': 'profil',
  'accountDelete.text': 'profil',
  'accountDelete.open': 'profil',
  'accountDelete.sheetTitle': 'konto-loeschen-ohne-events',
  'accountDelete.goes': 'konto-loeschen-ohne-events',
  'accountDelete.goesProfile': 'konto-loeschen-ohne-events',
  'accountDelete.goesLink': 'konto-loeschen-ohne-events',
  'accountDelete.goesMessages': 'konto-loeschen-ohne-events',
  'accountDelete.goesVotes': 'konto-loeschen-ohne-events',
  'accountDelete.goesTeamWord': 'konto-loeschen-ohne-events',
  'accountDelete.stays': 'konto-loeschen-ohne-events',
  'accountDelete.final': 'konto-loeschen-ohne-events',
  'accountDelete.hold': 'konto-loeschen-ohne-events',
  'accountDelete.hosting': 'konto-loeschen-mehrere',
  'accountDelete.library': 'konto-loeschen-ein-event',
  'accountDelete.counting': 'konto-loeschen-zaehlt',
  'accountDelete.countFailed': 'konto-loeschen-zaehlen-fehler',
  'accountDelete.failed': 'konto-loeschen-fehler',
  'common.deletedUser': 'geloescht',
  'legal.datenschutz.storage.heading': 'datenschutz',
  'legal.datenschutz.storage.text': 'datenschutz',
  'legal.datenschutz.signIn.text': 'datenschutz',
  'legal.datenschutz.avatar.text': 'datenschutz',
  'legal.datenschutz.retention.text': 'datenschutz',
  'legal.datenschutz.rights.text': 'datenschutz',
  'legal.datenschutz.changes.text': 'datenschutz',
}

/** The texts of 0.21 no state can show (key → why). */
export const UNREACHED = {
  'error.imageUnsupported': 'No surface maps the code. The card „Profil“ shows `profile.imageUploadFailed` for every refusal of `PUT /api/me/image`, `image_unsupported` included, and the Host\'s cover field of a game does not read the code either; the browser makes the one size the server takes, so no real upload is refused with it.',
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The fakes

/**
 * The source of the walk's fakes of the Profil page, run in the page once it has loaded: `config` says which call answers as faked. `hosted` answers `GET /api/me/hosted` with the counts
 * (`{ events, games }`), a 500 (`'fail'`) or never (`'hold'`); `put` answers `PUT /api/me/image` with a 500 (`'fail'`) or never (`'pending'`); `removeFail` answers `DELETE /api/me/image`
 * with a 500; `deleteFail` answers `DELETE /api/me` with a 500; `bitmap: 'hold'` keeps `createImageBitmap` from ever answering, so the conversion stays on the page.
 * `window.__kontoFake = null` switches it off for the page.
 */
const kontoFake = config => `(() => {
  window.__kontoFake = ${JSON.stringify(config)}
  const failure = () => Promise.resolve(new Response(JSON.stringify({ statusCode: 500, statusMessage: 'internal' }), { status: 500, headers: { 'content-type': 'application/json' } }))
  const real = window.fetch
  window.fetch = (input, init) => {
    const faked = window.__kontoFake
    if (!faked) return real(input, init)
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    const method = (init?.method ?? input.method ?? 'GET').toUpperCase()
    if (url.pathname === '/api/me/hosted' && method === 'GET' && faked.hosted) {
      if (faked.hosted === 'hold') return new Promise(() => {})
      if (faked.hosted === 'fail') return failure()
      return Promise.resolve(new Response(JSON.stringify(faked.hosted), { status: 200, headers: { 'content-type': 'application/json' } }))
    }
    if (url.pathname === '/api/me/image' && method === 'PUT' && faked.put === 'pending') return new Promise(() => {})
    if (url.pathname === '/api/me/image' && method === 'PUT' && faked.put === 'fail') return failure()
    if (url.pathname === '/api/me/image' && method === 'DELETE' && faked.removeFail) return failure()
    if (url.pathname === '/api/me' && method === 'DELETE' && faked.deleteFail) return failure()
    return real(input, init)
  }
  if (${JSON.stringify(config.bitmap === 'hold')}) window.createImageBitmap = () => new Promise(() => {})
})()`

/** A text is on the page, the way the walk reads a tagged text. */
const shows = text => `document.body.textContent.replace(${UNTAG}, '').includes(${JSON.stringify(text)})`

// ---------------------------------------------------------------------------------------------------------------------------------
// The picture

/**
 * Puts a file into the card's hidden file input as a pick does: `picture` is a 640 × 480 PNG drawn in the page (a gradient and two shapes, nobody's photo), `text` a file that is no image,
 * which the browser cannot decode. The input's `change` is what the card listens to.
 */
const pickFile = (tab, kind) => tab.evaluate(`(async () => {
  const input = document.querySelector('input[type=file]')
  if (!input) return false
  let file
  if (${JSON.stringify(kind)} === 'picture') {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const context = canvas.getContext('2d')
    const gradient = context.createLinearGradient(0, 0, 640, 480)
    gradient.addColorStop(0, '#f4b942')
    gradient.addColorStop(1, '#3b7dd8')
    context.fillStyle = gradient
    context.fillRect(0, 0, 640, 480)
    context.fillStyle = '#ffffff'
    context.beginPath()
    context.arc(250, 220, 120, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#1d3b6e'
    context.fillRect(380, 260, 180, 150)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    file = new File([blob], 'bild.png', { type: 'image/png' })
  }
  else file = new File(['das ist kein Bild'], 'bild.png', { type: 'image/png' })
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  return true
})()`)

/** The crop is on the card: its tile is there. */
const CROP = `!!document.querySelector('[data-crop-x]')`

/** Picks a file and, for a picture, waits for the crop. */
async function pick(tab, kind) {
  if (!await pickFile(tab, kind)) throw new Error('no file input on the card „Profil“')
  if (kind === 'picture') await until(tab, CROP, 'the crop')
  await sleep(300)
}

/** „Speichern“ of the crop: the one inside the named group, not the name form's. */
async function saveCrop(tab) {
  if (!await clickText(tab, '[role=group] button', COPY.common.save)) throw new Error('no „Speichern“ in the crop')
}

/** Puts the own picture on the User through the page, as the card's request does (a 256 × 256 WebP drawn in the page): the status the server answered. */
const uploadOwn = tab => tab.evaluate(`(async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  context.fillStyle = '#3b7dd8'
  context.fillRect(0, 0, 256, 256)
  context.fillStyle = '#f4b942'
  context.beginPath()
  context.arc(128, 128, 80, 0, Math.PI * 2)
  context.fill()
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.8))
  const answer = await fetch('/api/me/image', { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: blob })
  return answer.status
})()`)

/** Takes the User's own picture away; the address the server answers is the provider's. Idempotent. */
async function removeOwn(tab) {
  const answer = await api(tab, 'DELETE', '/api/me/image')
  if (answer.status !== 200) throw new Error(`the own picture was not taken away: ${answer.status}`)
  return answer.body?.image ?? null
}

/** A state of the card „Profil“ as the Dev Member: the page, the fake of `fake` (when given), then `act`; `after` takes the own picture away again. */
function bild(name, { fake, act, widths }) {
  return {
    name,
    group: 'hub',
    account: 'member',
    ...(widths ? { widths } : {}),
    async open(ctx) {
      const { tab } = ctx
      await open(tab, '/profil', ctx.width, ctx.height, 'h1', { appearance: ctx.appearance })
      if (fake) await tab.evaluate(kontoFake(fake))
      await act(tab, ctx)
      await sleep(300)
    },
    async after(ctx) {
      // The fake of the state is off first: a removal that is faked to fail would leave the picture on the User.
      await ctx.tab.evaluate('window.__kontoFake = null')
      await removeOwn(ctx.tab)
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The sheet of „Konto löschen“

/** Opens the sheet of the section „Konto löschen“ and waits until it has the counts (or says it has not): `ready` is the page expression that ends the wait. */
async function sheet(tab, ready) {
  if (!await clickText(tab, 'button', COPY.accountDelete.open)) throw new Error('no „Konto löschen“ button on Profil')
  await layerOpen(tab, 'the sheet of Konto löschen')
  await until(tab, ready, 'the sheet\'s counts')
  await sleep(300)
}

/** A state of the sheet: the page as `account`, the counts faked, the sheet opened. `act` goes on from there. */
function konto(name, account, hosted, { ready, act }) {
  return {
    name,
    group: 'hub',
    account,
    async open(ctx) {
      const { tab } = ctx
      await open(tab, '/profil', ctx.width, ctx.height, 'h1', { appearance: ctx.appearance })
      await tab.evaluate(kontoFake({ hosted, deleteFail: name === 'konto-loeschen-fehler' }))
      await sheet(tab, ready)
      await act?.(tab)
    },
  }
}

/** The sheet has its counts: the hold has no reason to wait any more. */
const COUNTED = `!${shows(COPY.accountDelete.counting)} && !${shows(COPY.accountDelete.countFailed)}`

// ---------------------------------------------------------------------------------------------------------------------------------
// The Deleted User

let fourth = null
/** The Dev Member 2's own Chrome, started once and signed in: no tab of the walk is this User. */
async function member2(ctx) {
  fourth ??= (async () => {
    const tab = await launch('member2')
    await open(tab, '/impressum', 1440, 900, 'body', { appearance: ctx.appearance })
    return tab
  })()
  return fourth
}

/** The Dev Member 2's sign-in again after the deletion (the next build needs a User). */
async function signInAgain(ctx) {
  const tab = await member2(ctx)
  await open(tab, '/impressum', 1440, 900, 'body', { appearance: ctx.appearance })
  return tab
}

/**
 * A finished Event of three Parties, the third the Dev Member 2, who wins every Game, writes a Message and deletes the account at the end. The Award ceremony has run, so the Standings
 * and „Siegerehrung ansehen“ are on the page. Made once per run: the Host's tab, the Member's tab and the phone read it.
 */
BUILDS.geloescht = async (ctx) => {
  await signIn(ctx, 'member')
  const second = await signInAgain(ctx)
  const event = await runningEvent([host(ctx), member(ctx), second], { name: `${ctx.data.prefix}Geloescht`, pool: await pool(ctx, 3), settings: { gameCount: 3 }, set: 3 })
  for (const roundId of event.roundIds) await enterResult(host(ctx), event.slug, roundId, placesOf([3, 1, 2]))
  const say = (tab, text) => ok(api(tab, 'POST', `/api/e/${event.slug}/messages`, { id: randomUUID(), text }), 'write a Message')
  await say(host(ctx), 'Willkommen zur Runde, schön dass ihr da seid.')
  await say(second, 'Das war knapp, aber verdient.')
  await say(member(ctx), 'Glückwunsch!')
  await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/finish`, { outcome: 'winner', winners: [3] }), 'finish the Event')
  const { endsAt } = await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/ceremony`), 'start the ceremony')
  await sleep(Math.max(0, Date.parse(endsAt) - Date.now()) + 800)
  // The one deletion of the walk: a User of its own, who is made again by the next dev sign-in.
  await ok(api(second, 'DELETE', '/api/me'), 'delete the Dev Member 2')
  return event
}

/** The ceremony's end frame, as the finished states read it. */
const ceremonyStop = stop('siegerehrung', async (tab) => {
  await press(tab, 'button', COPY.ceremony.watch)
  await layerOpen(tab, 'the ceremony')
  await until(tab, `(() => {
    const layer = document.querySelector('[role=dialog]')
    const share = layer?.querySelector('[data-part="share"]')
    const button = share?.querySelector('button')
    if (!button || !(button.getBoundingClientRect().width > 0)) return false
    return !layer.getAnimations({ subtree: true }).some(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().iterations ?? 1))
  })()`, 'the ceremony end frame', 40_000)
  await sleep(500)
})

/** The phone's tab bar of the Event page: one view of it. */
const phoneView = (tab, label) => press(tab, `nav[aria-label*=${JSON.stringify(COPY.event.tabs.label)}] button`, label)

/** The Chat's log has loaded. */
const CHAT_READY = `(() => { const log = document.querySelector('[role=log]'); return !!log && log.getAttribute('aria-busy') !== 'true' })()`

const geloescht = pair({
  name: 'geloescht',
  group: 'event-konto',
  hostStops: [
    // The side panel's feed beside the stage; „Siegerehrung ansehen“ is on the stage.
    stop('aktivitaet', async (tab) => {
      await press(tab, '[role=tab], button', COPY.nav.tabs.activity)
      await sleep(600)
    }),
    ceremonyStop,
  ],
  spielerStops: [
    stop('aktivitaet', async (tab) => {
      await phoneView(tab, COPY.nav.tabs.activity)
      await sleep(600)
    }),
    stop('tabelle', async (tab) => {
      await phoneView(tab, COPY.nav.tabs.table)
      await sleep(600)
    }),
    stop('siegerehrung', async (tab, ctx) => {
      await phoneView(tab, COPY.event.tabs.event)
      await sleep(400)
      await ceremonyStop.go(ctx)
    }, { keep: true }),
  ],
  async prepare(ctx) {
    // The phone's Event page opens on the stage: the Chat is its own view.
    if (ctx.width === 390) await phoneView(ctx.tab, COPY.nav.tabs.chat)
    await until(ctx.tab, CHAT_READY, 'the Chat')
    await sleep(400)
  },
})

// ---------------------------------------------------------------------------------------------------------------------------------
// An Event page whose Event is gone

/** The Member's page of an Event of the Host's, which the Host then deletes; the Event is made in every `open`, since the state ends it. */
BUILDS['geloescht-weg'] = async (ctx) => {
  await signIn(ctx, 'member')
  const { slug } = await createEvent(host(ctx), { name: `${ctx.data.prefix}Geloescht weg`, pool: (await pool(ctx, 3)).map(game => game.id) })
  await joinEvent(member(ctx), slug, host(ctx))
  return { slug }
}

/** Asks the page to read the Event again, as a window coming back to the front does (`focus`). */
const reread = tab => tab.evaluate(`window.dispatchEvent(new Event('focus'))`)

/**
 * The page of the Member's Event stays open while the Event goes. `how`: `'deleted'` is the Host's „Event löschen“ (the read then answers 410, „Event gelöscht“); `'vanished'`
 * is an Event that has no row any more (the read answers 404, „Link ungültig“): no route of the app removes a row under an open page but a Host's account deletion, and the walk
 * has only one deletion, so the 404 is the page's own fetch answering it.
 */
const weg = how => pair({
  name: how === 'deleted' ? 'geloescht-weg-geloescht' : 'geloescht-weg-ungueltig',
  key: 'geloescht-weg',
  group: 'event-konto',
  fresh: true,
  only: 'spieler',
  async prepare(ctx) {
    const slug = ctx.event.slug
    if (how === 'deleted') {
      await ok(api(host(ctx), 'DELETE', `/api/e/${slug}`), 'delete the Event')
    }
    else {
      await ctx.tab.evaluate(`(() => {
        const real = window.fetch
        window.fetch = (input, init) => {
          const url = new URL(typeof input === 'string' ? input : input.url, location.href)
          if (url.pathname === ${JSON.stringify(`/api/e/${slug}`)} && (init?.method ?? 'GET').toUpperCase() === 'GET') return Promise.resolve(new Response(JSON.stringify({ statusCode: 404, statusMessage: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } }))
          return real(input, init)
        }
      })()`)
    }
    await reread(ctx.tab)
    await until(ctx.tab, shows(how === 'deleted' ? COPY.errorPage.deleted.title : COPY.errorPage.invalid.title), 'the full-page state', 20_000)
    await sleep(400)
  },
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The states

export const STATES = [
  // The crop of a picked picture: the tile, the slider, the round preview, „Speichern“ and „Abbrechen“.
  bild('profil-bild-zuschneiden', { act: tab => pick(tab, 'picture') }),
  // The conversion that has not ended: „Bild wird zugeschnitten …“ beside the card's picture.
  bild('profil-bild-umwandeln', {
    fake: { bitmap: 'hold' },
    async act(tab) {
      await pickFile(tab, 'picture')
      await until(tab, shows(COPY.profile.imageConverting), 'the conversion\'s line')
    },
  }),
  // A file the browser cannot decode: the notice, the picture as it was.
  bild('profil-bild-umwandeln-fehler', {
    async act(tab) {
      await pick(tab, 'text')
      await until(tab, shows(COPY.profile.imageConvertFailed), 'the conversion\'s notice')
    },
  }),
  // „Speichern“ with a request that never answers: the line „Bild lädt hoch“ under the crop, its controls locked.
  bild('profil-bild-laedt-hoch', {
    fake: { put: 'pending' },
    async act(tab) {
      await pick(tab, 'picture')
      await saveCrop(tab)
      await until(tab, shows(COPY.profile.imageUploading), 'the upload\'s line')
    },
  }),
  // A save the server does not take: the notice under the crop, which stays open.
  bild('profil-bild-hochladen-fehler', {
    fake: { put: 'fail' },
    async act(tab) {
      await pick(tab, 'picture')
      await saveCrop(tab)
      await until(tab, shows(COPY.profile.imageUploadFailed), 'the upload\'s notice')
    },
  }),
  // The real upload: the card with the User's own picture, the hint that says so and „Eigenes Bild entfernen“. `after` takes the picture away again.
  bild('profil-bild-eigenes', {
    async act(tab) {
      await pick(tab, 'picture')
      await saveCrop(tab)
      await until(tab, shows(COPY.profile.removeImage), 'the card with the own picture', 20_000)
    },
  }),
  // The removal that fails: the notice and the picture that stays.
  bild('profil-bild-entfernen-fehler', {
    async act(tab, ctx) {
      const status = await uploadOwn(tab)
      if (status !== 200) throw new Error(`the own picture was not saved for the state: ${status}`)
      await open(tab, '/profil', ctx.width, ctx.height, 'h1', { appearance: ctx.appearance })
      await tab.evaluate(kontoFake({ removeFail: true }))
      if (!await clickText(tab, 'button', COPY.profile.removeImage)) throw new Error('no „Eigenes Bild entfernen“ on the card')
      await until(tab, shows(COPY.profile.imageRemoveFailed), 'the removal\'s notice')
    },
  }),

  // The sheet of „Konto löschen“ for a User who hosts nothing, then for a Host with one Event and with several, while the counts are read and when the read fails; and the notice of a
  // refusal. The counts are faked (see the top of the file); the sheet, its hold and the refusal are the page's own.
  konto('konto-loeschen-ohne-events', 'member', { events: 0, games: 0 }, { ready: COUNTED }),
  konto('konto-loeschen-ein-event', 'host', { events: 1, games: 12 }, { ready: COUNTED }),
  konto('konto-loeschen-mehrere', 'host', { events: 3, games: 12 }, { ready: COUNTED }),
  konto('konto-loeschen-zaehlt', 'member', 'hold', { ready: shows(COPY.accountDelete.counting) }),
  konto('konto-loeschen-zaehlen-fehler', 'member', 'fail', { ready: shows(COPY.accountDelete.countFailed) }),
  konto('konto-loeschen-fehler', 'member', { events: 0, games: 0 }, {
    ready: COUNTED,
    async act(tab) {
      await holdPress(tab, '[role=dialog] button', COPY.accountDelete.hold)
      await until(tab, shows(COPY.accountDelete.failed), 'the refusal\'s notice')
      await sleep(300)
    },
  }),

  // The finished Event with a Deleted User and the Event pages that are gone.
  ...geloescht,
  ...weg('deleted'),
  ...weg('vanished'),
]

/** The source of the fake, for the tests: what the page's calls answer to it. */
export { kontoFake }

/** Closes the Dev Member 2's Chrome and takes the own picture off every dev User the walk touched: the log says whether one is left. */
export async function cleanup({ tabs, log }) {
  if (fourth) (await fourth).close()
  fourth = null
  const left = []
  for (const account of ['host', 'member', 'admin']) {
    // A tab that never left about:blank (a partial run) never signed in, so the walk gave that User nothing.
    if (!/^https?:$/.test(await tabs[account].evaluate('location.protocol'))) continue
    const image = await removeOwn(tabs[account])
    if (image?.startsWith('/api/images/')) left.push(account)
  }
  log?.check('no dev User keeps a Profile picture of the run', left.length === 0, `${left.length} of 3 kept one`)
}
