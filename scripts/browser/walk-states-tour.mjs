// The wording walk's states for the Tour's texts and the Hidden wheel's placeholders (#810, spec #790 story 74; the Tour is #622, ADR 0017). Only the walk loads this
// file (`states.mjs` with `extra: 'walk-states-'`); the dark check never does. `dark.mjs` documents the State shape, `dark-states-event.mjs` the pair of readers
// (`<name>-host` at 1440, `<name>-spieler` at 390) and the Events it makes.
//
// A plain dev sign-in marks the Rundgang seen (`server/dev/sign-in.ts`), so no other state is covered by it. Only the three Rundgang states here sign in with `tour: true`
// (the Dev Member: the Tour is the Member's), and `walk.mjs` fails a state whose page carries the layer unasked. Each step is read as a stop: „Weiter“ is clicked, but
// never „Fertig“ or „Überspringen“, which save: the Dev Member's Tour stays unseen until the next plain sign-in. The page behind the bubble is covered, so the pictures are
// of the bubble's texts.
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGame, api, clickText, eventView, ok } from './kit.mjs'
import { OUT, sleep } from './chrome.mjs'
import { page } from './dark-states-app.mjs'
import { BUILDS, host, keepToasts, pair, press, running, stop, toastShown, TOUR_BUBBLE, until } from './dark-states-event.mjs'
import { UNTAG } from './walk-kit.mjs'

const COPY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/de.json'), 'utf8'))
const run = process.argv.slice(2).find(arg => arg.startsWith('--run='))?.slice('--run='.length) ?? 'dark'

/** A NOTE line in the run's results.log, like `log.note` writes it (the runner owns the log, a state file has no handle on it). */
function note(text) {
  console.log(`NOTE  ${text}`)
  appendFileSync(join(OUT, run, 'results.log'), `NOTE  ${text}\n`)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The Rundgang

/**
 * The runs the three states read, with the page each one opens on (`TourPage` of `shared/tour.ts`): the Event's build (a key of `BUILDS`), its Phase and whether
 * Team choice is open, and how many steps the run holds at each width. Together they reach every step of `MEMBER_TOUR`: `board`, `boardOpen` and `boardLocked` by
 * the three pages, `activity` at 1440 and `tabs` at 390. `test/unit/wording-walk-tour.test.ts` pins the lengths and the union of the steps against `shared/tour.ts`.
 */
export const TOUR_RUNS = [
  { name: 'rundgang-umfrage', build: 'poll', page: { phase: 'poll', teamChoiceOpen: false }, steps: { 390: 8, 1440: 8 } },
  { name: 'rundgang-termin', build: 'datiert', page: { phase: 'date_set', teamChoiceOpen: true }, steps: { 390: 8, 1440: 8 } },
  { name: 'rundgang-gesperrt', build: 'rundgang-gesperrt', page: { phase: 'running', teamChoiceOpen: false }, steps: { 390: 8, 1440: 8 } },
]

/** The Tour's own Event of the last state: the Session started and ended, so the Event is `running` and the Tour may start (it never starts over a Running Session). */
BUILDS['rundgang-gesperrt'] = async (ctx) => {
  const event = await running(ctx, 'Rundgang gesperrt', { n: 3, settings: { gameCount: 3 } })
  await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/sessions/end`), 'end the Session')
  return event
}

/** The bubble's step counter („2 von 8“) without key tags: what changes when the Tour goes on. */
const countOf = tab => tab.evaluate(`(document.querySelector(${JSON.stringify(`${TOUR_BUBBLE} span[aria-label]`)})?.textContent ?? '').replace(${UNTAG}, '').trim()`)

/**
 * One step on: „Weiter“ in the bubble, then until the counter has changed and the bubble is painted again (it hides while it moves to the next thing). When only
 * „Fertig“ is there, the run is shorter than planned: nothing is clicked (it would save), the same last step is read again and the walk's budget keeps it from
 * counting twice.
 */
async function nextStep(tab, where) {
  const before = await countOf(tab)
  if (!await clickText(tab, `${TOUR_BUBBLE} button`, COPY.common.next)) {
    note(`${where}: no „${COPY.common.next}“ after „${before}“: the run is shorter than planned, the last step is read again`)
    return
  }
  await until(tab, `(() => {
    const bubble = document.querySelector(${JSON.stringify(TOUR_BUBBLE)})
    const count = (bubble?.querySelector('span[aria-label]')?.textContent ?? '').replace(${UNTAG}, '').trim()
    return !!bubble && count !== ${JSON.stringify(before)} && getComputedStyle(bubble).visibility !== 'hidden' && getComputedStyle(bubble).opacity !== '0'
  })()`, `the next step of the Rundgang after „${before}“`)
  await sleep(500)
}

/** The stops `schritt-2` … `schritt-N` of a run: plain objects, since `stop()` closes layers and the bubble is the layer. A step the narrower width does not have is skipped there. */
function stepStops(tourRun) {
  const most = Math.max(...Object.values(tourRun.steps))
  return Array.from({ length: most - 1 }, (_, index) => index + 2).map(number => ({
    name: `schritt-${number}`,
    widths: Object.entries(tourRun.steps).filter(([, steps]) => steps >= number).map(([width]) => Number(width)),
    go: ctx => nextStep(ctx.tab, `${tourRun.name} ${ctx.width}`),
  }))
}

const tourStates = TOUR_RUNS.flatMap(tourRun => pair({
  name: tourRun.name,
  key: tourRun.build,
  group: 'event-tour',
  only: 'spieler',
  spielerWidths: [390, 1440],
  tour: true,
  spielerStops: stepStops(tourRun),
}))

// ---------------------------------------------------------------------------------------------------------------------------------
// The Profil row „Rundgang“

/** The texts the Profil states of this file show; the plan test checks that every `settings.tour*` key of the copy is here. */
export const CLAIMED_KEYS = ['settings.tour', 'settings.tourHelp', 'settings.tourAgain', 'settings.tourResetDone', 'settings.tourResetFailed']

/** `POST /api/me/tour-reset` answers 500 from now on (the pattern of `abstimmung-fehler`): the row's inline failure line. */
const FAIL_RESET = `(() => {
  const real = window.fetch
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (url.pathname === '/api/me/tour-reset' && (init?.method ?? 'GET').toUpperCase() === 'POST') return Promise.resolve(new Response('{"statusCode":500}', { status: 500, headers: { 'content-type': 'application/json' } }))
    return real(input, init)
  }
})()`

// The Host's Profil, the row clicked: the success toast (kept past its 4 s) on the page, the 500 in the stop. The reset leaves the Dev Host's `tourSeen` at 0 until its next
// sign-in, which is the next state's `open`: nothing to clean up, and the Host never sees the Tour on its own Events.
const profilState = page('profil-rundgang', 'hub', 'host', () => '/profil', {
  async after(ctx) {
    await keepToasts(ctx.tab)
    await press(ctx.tab, 'button', COPY.settings.tourAgain)
    await toastShown(ctx.tab, COPY.settings.tourResetDone.slice(0, 15))
  },
  stops: [
    stop('fehlgeschlagen', async (tab) => {
      await tab.evaluate(FAIL_RESET)
      await press(tab, 'button', COPY.settings.tourAgain)
      await until(tab, `document.body.textContent.replace(${UNTAG}, '').includes(${JSON.stringify(COPY.settings.tourResetFailed)})`, 'the failed reset line')
    }),
  ],
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The Hidden wheel's placeholders

/** The pool of the placeholders' Event: 30 games, the most a Hidden wheel can show placeholders for (`de.wheel.placeholders`). The first 30 of the library, and named ones if it holds fewer. */
let thirty
function thirtyGames(ctx) {
  thirty ??= (async () => {
    const known = (await ok(api(host(ctx), 'GET', '/api/games'), 'GET /api/games')).games.slice(0, COPY.wheel.placeholders.length)
    const list = [...known]
    for (let n = list.length + 1; n <= COPY.wheel.placeholders.length; n++) list.push(await createGame(host(ctx), { name: `R011 Dunkel-Check Spiel ${n}`, playersMin: 1, playersMax: 8, clipLength: 60 }))
    return list
  })()
  return thirty
}

BUILDS['rad-platzhalter'] = async ctx => running(ctx, 'Rad Platzhalter', { list: await thirtyGames(ctx), settings: { selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 0, gameCount: 6 } })

/** The Hidden wheel shows its placeholders only while a spin runs, and a spin lasts 6 to 10 s: the read ends the state when the spin's stop is no longer ahead (the walk then reads it again from `open`). */
async function spinStillRuns(ctx) {
  const spin = (await eventView(ctx.tabs.host, ctx.event.slug)).wheel?.spin
  if (!spin || Date.parse(spin.stopAt) <= Date.now()) throw new Error('the spin had ended')
}

// The Host starts the spin, the Member reads it: the placeholders are the labels of the Member's view, the picture is the disc (`SERVER_SIGHTINGS` of `walk.mjs`, which reads the
// keys from the Member's own view and never the Host's, so no real name of the pool reaches the recording).
const placeholderStates = pair({
  name: 'rad-platzhalter',
  group: 'event-live',
  fresh: true,
  only: 'spieler',
  spielerWidths: [390, 1440],
  stillHolds: spinStillRuns,
  spielerStops: [
    {
      ...stop('dreht', async (_tab, ctx) => {
        await ok(api(ctx.tabs.host, 'POST', `/api/e/${ctx.event.slug}/rounds/spin`), 'spin the wheel')
        await until(ctx.tab, `[...document.querySelectorAll('[data-testid^="wheel-label-"]')].some((el) => { const text = el.textContent.replace(${UNTAG}, '').trim(); return text !== '' && text !== ${JSON.stringify(COPY.wheel.placeholderQ)} })`, 'the labels of the spinning wheel')
      }),
      // The placeholders last at most 6 s: the stop is read for its server sightings only (the page was read before it).
      serverOnly: true,
    },
  ],
})

export const STATES = [...tourStates, profilState, ...placeholderStates]
