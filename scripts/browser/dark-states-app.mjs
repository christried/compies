// The signed-in states of the Dunkel-Check (#407): the hub pages, the library and the two steppers. `dark.mjs` documents the
// State shape every `dark-states-*.mjs` file exports. Every state opens through the kit's `open`, so the look comes from the
// dev sign-in (`?appearance=`), as a User gets it. Nothing is saved or sent: the forms are filled and never submitted, and
// the one thing written is the dev Users' Appearance and the Dev Admin's Display name, which the sign-in puts back.
// #408 owns the Event page: the only `/e/<slug>` pages here are the settings editor and a Construction page.
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUT, sleep } from './chrome.mjs'
import { BASE, clickText, open, pressKey, stepperNext, typeInto } from './kit.mjs'

const COPY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/de.json'), 'utf8'))
const run = process.argv.slice(2).find(arg => arg.startsWith('--run='))?.slice('--run='.length) ?? 'dark'

/** A NOTE line in the run's results.log, like `log.note` writes it (the runner owns the log, a state file has no handle on it). */
function note(text) {
  console.log(`NOTE  ${text}`)
  appendFileSync(join(OUT, run, 'results.log'), `NOTE  ${text}\n`)
}

/** Polls a page expression until it is true, at most `ms`. */
async function until(tab, expression, what, ms = 10_000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await tab.evaluate(expression).catch(() => false)) return
    await sleep(200)
  }
  throw new Error(`${what} never came`)
}

// `einrichten` signs the Dev Admin in without a Display name. The next state of the run signs the Dev Admin in plainly
// again, from here, so the name is back as soon as the read is over; the runner's `finally` does it too, for a run that
// stops after `einrichten`. A plain sign-in puts the dev name back where there is none (`server/dev/sign-in.ts`).
let adminNameless = false
async function adminNamed() {
  if (!adminNameless) return
  await fetch(`${BASE}/api/dev/sign-in?as=admin`, { redirect: 'manual' })
  adminNameless = false
}

/** The first of Dev Admin and Dev Member whose Home has no Event, else null (then `home-leer` fakes the answer). */
async function accountWithoutEvents() {
  for (const account of ['admin', 'member']) {
    try {
      const signIn = await fetch(`${BASE}/api/dev/sign-in?as=${account}`, { redirect: 'manual' })
      const cookie = signIn.headers.getSetCookie().map(header => header.split(';')[0]).join('; ')
      const { events } = await (await fetch(`${BASE}/api/e`, { headers: { cookie } })).json()
      if (Array.isArray(events) && events.length === 0) return account
    }
    catch {
      // The server is not up (a run that lists the states only): the fallback answers.
    }
  }
  return null
}

/** A state that opens `address(ctx)` as `account` and waits for `waitFor`. */
function page(name, group, account, address, { waitFor = 'h1', after, ...rest } = {}) {
  return {
    name,
    group,
    account,
    async open(ctx) {
      await adminNamed()
      await open(ctx.tab, address(ctx), ctx.width, ctx.height, waitFor, { appearance: ctx.appearance })
      await after?.(ctx)
    },
    ...rest,
  }
}

// The close button, not Escape: after the reading focus is on the page, not in the sheet, and Escape would not reach it.
const closeSheet = async (tab) => {
  if (!await tab.evaluate(`!!document.querySelector('[role=dialog]')`)) return
  if (!await clickText(tab, '[role=dialog] button', COPY.common.close)) await pressKey(tab, 'Escape')
  await until(tab, `!document.querySelector('[role=dialog]')`, 'the sheet to close')
}

// The game browser loads the next 40 cards when its sentinel scrolls into view, and the runner scrolls every page through
// once before it reads: the dev library has 1598 games, and a page with all of them cannot be read inside the protocol's
// 30 s. The sentinel goes, so only „Mehr laden“ loads cards, and a state decides how many.
const noAutoLoad = tab => tab.evaluate(`document.querySelectorAll('div[aria-hidden="true"].h-px').forEach(el => el.remove())`)

const stepHeading = `document.querySelector('form h1')?.textContent ?? ''`

/** One step on: Weiter, then waits until the step's heading is another. A sheet that is open is closed first. */
async function next(tab) {
  await closeSheet(tab)
  const before = await tab.evaluate(stepHeading)
  await stepperNext(tab)
  await until(tab, `(${stepHeading}) !== ${JSON.stringify(before)}`, 'the next step')
  await sleep(300)
}

const step = (name, go, rest = {}) => ({
  name,
  go: ctx => go(ctx.tab),
  ...rest,
})
const forward = name => step(name, next)

/** The library up to the card of `gameId` (the 60-character name, at about 360 of 1598): „Mehr laden“ until its link is on the page. */
async function loadUpTo(tab, gameId) {
  await until(tab, `!!document.querySelector('ul[aria-label=${JSON.stringify(COPY.library.title)}] li')`, 'the library', 30_000)
  await noAutoLoad(tab)
  const there = `!!document.querySelector('a[href$="/bibliothek/${gameId}"]')`
  for (let i = 0; i < 100 && !await tab.evaluate(there) && await clickText(tab, 'button', COPY.library.loadMore); i++) await sleep(250)
  if (!await tab.evaluate(there)) throw new Error('the 60-character game is not on the library page')
}

// Home without an Event (`mvp.home.titleEmpty`). When Dev Admin and Dev Member each have an Event, the Dev Member opens Profil, the page's
// `fetch` answers `GET /api/e` with no Events, and the nav link to Home (a client navigation, so the page fetches) shows the empty Home.
const nobody = await accountWithoutEvents()
const FAKE_NO_EVENTS = `(() => {
  const real = window.fetch
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    const method = (init?.method ?? input.method ?? 'GET').toUpperCase()
    if (url.pathname === '/api/e' && method === 'GET') return Promise.resolve(new Response('{"events":[]}', { headers: { 'content-type': 'application/json' } }))
    return real(input, init)
  }
})()`
let homeNoted = false

export const STATES = [
  // Profile setup: the Dev Admin without a Display name (`?name=unset`). The page redirects there from every address.
  {
    name: 'einrichten',
    group: 'hub',
    account: 'admin',
    async open(ctx) {
      adminNameless = true
      await open(ctx.tab, '/', ctx.width, ctx.height, 'form input', { appearance: ctx.appearance, setup: true })
    },
  },
  {
    name: 'home-leer',
    group: 'hub',
    account: nobody ?? 'member',
    async open(ctx) {
      await adminNamed()
      const title = JSON.stringify(COPY.mvp.home.titleEmpty)
      if (nobody) {
        await open(ctx.tab, '/', ctx.width, ctx.height, 'h1', { appearance: ctx.appearance })
      }
      else {
        await open(ctx.tab, '/profil', ctx.width, ctx.height, 'h1', { appearance: ctx.appearance })
        await ctx.tab.evaluate(FAKE_NO_EVENTS)
        if (!await clickText(ctx.tab, 'a[href="/"]')) throw new Error('no link to Home on Profil')
      }
      await until(ctx.tab, `document.querySelector('h1')?.textContent.trim() === ${title}`, 'the empty Home')
      if (!homeNoted) note(nobody ? `home-leer: the Dev ${nobody === 'admin' ? 'Admin' : 'Member'} has no Event, the page is real` : 'home-leer: Dev Admin and Dev Member each have an Event, the Dev Member\'s `GET /api/e` answered no Events by a replaced `window.fetch`, Home reached by the nav link')
      homeNoted = true
    },
  },
  page('home', 'hub', 'host', () => '/', { waitFor: 'a[href^="/e/"]' }),
  page('home-menue', 'hub', 'host', () => '/', {
    waitFor: 'button[aria-haspopup=menu]',
    async after(ctx) {
      await clickText(ctx.tab, 'button[aria-haspopup=menu]')
      await until(ctx.tab, `!!document.querySelector('[role=menu]')`, 'the profile menu')
    },
  }),
  // Both cards; „Darstellung“ and „Speichern“ are never clicked.
  // The control „Darstellung“ shows the stored choice, so it is „Dunkel“ in one pass and „System“ in the other: it stays out of the comparison.
  page('profil', 'hub', 'host', () => '/profil', { differs: '[role="radiogroup"]' }),
  page('baustelle-archiv', 'hub', 'host', () => '/archiv'),
  page('baustelle-admin', 'hub', 'admin', () => '/admin'),
  page('baustelle-allgemein', 'hub', 'member', () => '/gibt-es-nicht'),
  // The Construction page in the Event shell.
  page('baustelle-event', 'hub', 'host', ctx => `/e/${ctx.data.slug}/gibt-es-nicht`),
  // The pop-up opens when the browser is idle (up to 3 s) and stays open: the page under its overlay is covered.
  {
    name: 'was-ist-neu',
    group: 'hub',
    account: 'member',
    async open(ctx) {
      await adminNamed()
      await open(ctx.tab, '/', ctx.width, ctx.height, '[role=dialog]', { appearance: ctx.appearance, news: true })
    },
  },

  // The whole dev library with the 60-character name on the page, then a search that finds nothing.
  page('bibliothek', 'library', 'host', () => '/bibliothek', {
    after: ctx => loadUpTo(ctx.tab, ctx.data.longGame.id),
    stops: [step('bibliothek-leer', async (tab) => {
      await typeInto(tab, 'input[type=search]', 'zzzqqq')
      await until(tab, `!document.querySelector('ul[aria-label=${JSON.stringify(COPY.library.title)}] li')`, 'the empty search')
    })],
  }),
  page('bibliothek-spiel', 'library', 'host', ctx => `/bibliothek/${ctx.data.longGame.id}`),
  // The empty form sent: error borders and error lines. Nothing is saved.
  page('bibliothek-neu', 'library', 'host', () => '/bibliothek/neu', {
    waitFor: 'form',
    stops: [step('bibliothek-neu-fehler', async (tab) => {
      if (!await clickText(tab, 'button[type=submit]', COPY.library.create)) throw new Error('no submit button on the game form')
      await until(tab, `!!document.querySelector('[aria-invalid="true"]')`, 'the error lines')
    })],
  }),
  page('bibliothek-bearbeiten', 'library', 'host', ctx => `/bibliothek/${ctx.data.game.id}/bearbeiten`, { waitFor: 'form' }),

  // The create stepper: the draft is filled as a Host would, the last step is never sent.
  page('neu-name', 'stepper', 'host', () => '/neu', {
    waitFor: 'form h1',
    stops: [
      step('neu-format', async (tab) => {
        await typeInto(tab, 'form input', 'R011 Dunkel-Check Neu')
        await next(tab)
      }),
      // The „Info“ sheet exists on a phone only: from md up the info is a column of the page.
      step('neu-info', async (tab) => {
        if (!await clickText(tab, 'button[aria-label="Info"]')) throw new Error('no Info button on the Format step')
        await until(tab, `!!document.querySelector('[role=dialog]')`, 'the Info sheet')
      }, { widths: [390] }),
      forward('neu-games'),
      forward('neu-points'),
      forward('neu-mode'),
      step('neu-pool', async (tab) => {
        await next(tab)
        await until(tab, `!!document.querySelector('button[aria-label$="in den Pool"]')`, 'the library in the pool step', 30_000)
        await noAutoLoad(tab)
        await clickText(tab, 'button[aria-label$="in den Pool"]')
        await sleep(300)
      }),
      // The new-game sheet of the pool step; never saved.
      step('neu-pool-spiel', async (tab) => {
        if (!await clickText(tab, 'button', COPY.stepper.pool.create)) throw new Error('no „Neues Spiel anlegen“ button')
        await until(tab, `!!document.querySelector('[role=dialog]')`, 'the new-game sheet')
      }),
      forward('neu-sessions'),
    ],
  }),
  // The settings editor of the Event: every step is a link, the last button is „Speichern“ and is never pressed.
  page('einstellungen-format', 'stepper', 'host', ctx => `/e/${ctx.data.slug}/einstellungen`, {
    waitFor: 'form h1',
    stops: [
      ...['games', 'points', 'mode'].map(key => forward(`einstellungen-${key}`)),
      step('einstellungen-pool', async (tab) => {
        await next(tab)
        await until(tab, `!!document.querySelector('ul[aria-label=${JSON.stringify(COPY.library.title)}] li')`, 'the library in the pool step', 30_000)
        await noAutoLoad(tab)
      }),
    ],
  }),
]
