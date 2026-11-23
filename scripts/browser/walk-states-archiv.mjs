// The wording walk's states for the texts of the Archive (#882 to #885, spec #683 story 68): the list with its count, a card with its Winner strip, „Platz {n}“,
// „Tribüne“, „Host“ and „Die Siegerehrung steht noch aus.“, the chips, the search, the no-results states, the empty state and the loading state. Only the walk loads
// this file (`states.mjs` with `extra: 'walk-states-'`); the dark check never does. `dark-states-app.mjs` keeps the plain page as `archiv`.
// The Events are made through the API, as the Dev Host and the Dev Admin, once per run (`events`): a finished Event each, the Award ceremony run for the open cards.
// They are named `<prefix>Archiv …` (`ctx.data.prefix`, `W<run> `) and `cleanup` deletes them, which the runner calls last.
// The list is read by the page's own request, after a client navigation from Profil: the server renders the first load, so a fake in the tab (`archiveFake`) can only
// answer a read the page makes itself. The fake keeps the list to the walk's own Events, because the dev database holds every User's finished Events of earlier checks:
// the counts of a state are then the walk's. It is the server's own answer, filtered; two shapes no Event can reach are made by the fake too, and the report says so:
// a Member with no finished Event (`archiv-leer`: every dev User has some), an Event without a date (`archiv-ohne-datum`: only a hand-edited row has none), and an
// Event of one Person (`archiv-eine`: a Session cannot start with an empty Team, so no Event of one Person exists). The count and the date of that one entry are changed.
// The read held back (`archiv-laedt`) is the same fake, a request that never answers.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sleep } from './chrome.mjs'
import { signIn, pool, until } from './dark-states-event.mjs'
import { api, clickText, enterResult, joinEvent, ok, open, placesOf, runningEvent, setGame, typeInto } from './kit.mjs'
import { UNTAG } from './walk-kit.mjs'

const COPY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/de.json'), 'utf8'))

// ---------------------------------------------------------------------------------------------------------------------------------
// The plan

/**
 * The state that shows each text of the Archive (key → state name). A `archiveList.*`, `board.stands`, `common.host` or `ceremony.pending.member` key of `de.json`
 * that is in neither this table nor `UNREACHED` fails `test/unit/wording-walk-archiv.test.ts`, so a text added later is planned before it is merged.
 */
export const CLAIMS = {
  'archiveList.title': 'archiv',
  'archiveList.count': 'archiv-eine',
  'archiveList.meta': 'archiv-eine',
  'archiveList.metaNoDate': 'archiv-ohne-datum',
  'archiveList.games': 'archiv-eine',
  'archiveList.people': 'archiv-eine',
  'archiveList.place': 'archiv-spieler',
  'board.stands': 'archiv-tribuene',
  'common.host': 'archiv-host',
  'ceremony.pending.member': 'archiv-siegerehrung-offen',
  'archiveList.search': 'archiv-alle',
  'archiveList.all': 'archiv-alle',
  'archiveList.won': 'archiv-gewonnen',
  'archiveList.asHost': 'archiv-als-host',
  'archiveList.noMatch': 'archiv-kein-treffer',
  'archiveList.noMatchText': 'archiv-kein-treffer',
  'archiveList.noWin': 'archiv-noch-kein-sieg',
  'archiveList.showAll': 'archiv-noch-kein-sieg',
  'archiveList.emptyTitle': 'archiv-leer',
  'archiveList.emptyText': 'archiv-leer',
  'archiveList.loading': 'archiv-laedt',
}

/** The texts no state can show (key → why). Empty: every text of the Archive has a state. */
export const UNREACHED = {}

// ---------------------------------------------------------------------------------------------------------------------------------
// The fake of the read

/**
 * The source of the fake of `GET /api/archive`, for the tab's page from now on. `keep` names the Events the list shows (`null`: all), `edit` changes fields of
 * one entry the server answered (`{ slug: { finishedAt: null } }`), `hold` keeps the read unanswered. `window.__archiveFake = null` switches it off for the page.
 */
const archiveFake = config => `(() => {
  window.__archiveFake = ${JSON.stringify(config)}
  const real = window.fetch
  window.fetch = (input, init) => {
    const faked = window.__archiveFake
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!faked || url.pathname !== '/api/archive' || (init?.method ?? 'GET').toUpperCase() !== 'GET') return real(input, init)
    if (faked.hold) return new Promise(() => {})
    return real(input, init).then(async (response) => {
      const view = await response.json()
      const events = view.events
        .filter(entry => faked.keep === null || faked.keep.includes(entry.slug))
        .map(entry => (faked.edit?.[entry.slug] ? { ...entry, ...faked.edit[entry.slug] } : entry))
      return new Response(JSON.stringify({ events }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
  }
})()`

// ---------------------------------------------------------------------------------------------------------------------------------
// The Events

/** Makes the Events of the states once per run: every one is finished, the Award ceremony run for the open cards. Keyed by what a state needs. */
let built = null
const events = ctx => (built ??= build(ctx))

/** Sets each game of `games` as a Round, enters the Result `orders[i]` (Place 1 down) for it, and finishes the Event. */
async function play(host, slug, games, orders, outcome, winners) {
  const roundIds = []
  for (const game of games) roundIds.push(await setGame(host, slug, game.id))
  for (const [index, roundId] of roundIds.entries()) await enterResult(host, slug, roundId, placesOf(orders[index]))
  await ok(api(host, 'POST', `/api/e/${slug}/finish`, { outcome, winners }), 'finish the Event')
}

/** Starts the Award ceremony of each Event named (tab and slug), then waits until the longest run is over. */
async function ceremonies(list) {
  const ends = []
  for (const [tab, slug] of list) ends.push(Date.parse((await ok(api(tab, 'POST', `/api/e/${slug}/ceremony`), 'start the ceremony')).endsAt))
  await sleep(Math.max(0, Math.max(...ends) - Date.now()) + 500)
}

async function build(ctx) {
  const { prefix } = ctx.data
  const { host, member, admin } = ctx.tabs
  await signIn(ctx, 'host')
  await signIn(ctx, 'member')
  await signIn(ctx, 'admin')
  const [one, two] = await pool(ctx, 2)

  // The one-Game Event: its card has the singular „1 Spiel“; the Result is the Dev Host's (rank 1), the Dev Member's rank 2.
  const sieger = await runningEvent([host, member], { name: `${prefix}Archiv Sieger`, pool: [one], settings: { gameCount: 1 } })
  await play(host, sieger.slug, [one], [[1, 2]], 'winner', [1])

  const gleichstand = await runningEvent([host, member], { name: `${prefix}Archiv Gleichstand`, pool: [one, two], settings: { gameCount: 2 } })
  await play(host, gleichstand.slug, [one, two], [[1, 2], [2, 1]], 'tie', [1, 2])

  // The Member joins after the Session started, so the Member is on the Stands (`seated` false).
  const tribuene = await runningEvent([host, admin], { name: `${prefix}Archiv Tribüne`, pool: [one, two], settings: { gameCount: 2 } })
  await joinEvent(member, tribuene.slug, host)
  await play(host, tribuene.slug, [one, two], [[1, 2], [1, 2]], 'winner', [1])

  const offen = await runningEvent([host, member], { name: `${prefix}Archiv Offen`, pool: [one, two], settings: { gameCount: 2 } })
  await play(host, offen.slug, [one, two], [[1, 2], [1, 2]], 'winner', [1])

  // Hosted by the Dev Admin: the Dev Host is a Member, so the list has an Event the „Als Host“ chip leaves out. A pool holds only the games of its Host's
  // library (`unknown_game`), so this one takes a game of the Dev Admin's own library: no game is made, and none is left to clean up.
  const adminPool = (await ok(api(admin, 'GET', '/api/games'), 'GET /api/games')).games.slice(0, 1)
  const fremd = await runningEvent([admin, host], { name: `${prefix}Archiv Fremd`, pool: adminPool, settings: { gameCount: 1 } })
  await play(admin, fremd.slug, adminPool, [[1, 2]], 'winner', [1])

  await ceremonies([
    [host, sieger.slug],
    [host, gleichstand.slug],
    [host, tribuene.slug],
    [admin, fremd.slug],
  ])
  return { sieger: sieger.slug, gleichstand: gleichstand.slug, tribuene: tribuene.slug, offen: offen.slug, fremd: fremd.slug }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The states

const TITLE = JSON.stringify(COPY.archiveList.title)
const HEADING = `(document.querySelector('h1')?.textContent ?? '').replace(${UNTAG}, '').trim() === ${TITLE}`
/** A text is on the page, the way the walk reads a tagged text. */
const shows = text => `document.body.textContent.replace(${UNTAG}, '').includes(${JSON.stringify(text)})`
/** The list has answered: no skeleton is on the page. */
const SETTLED = `!document.querySelector('[aria-busy="true"]')`

/**
 * Opens the Archive as the state's account: the page loads on Profil, the fake goes in, and the Archive is reached by the nav link, a client navigation, so
 * the page's own read is the faked one. Then the chip, or the search, the state chooses; then the page is ready when `ready` says.
 */
async function archive(ctx, config, { chip, search, ready = SETTLED }) {
  const { tab } = ctx
  await open(tab, '/profil', ctx.width, ctx.height, 'h1', { appearance: ctx.appearance })
  await tab.evaluate(archiveFake(config))
  if (!await clickText(tab, 'a[href="/archiv"]')) throw new Error('no link to the Archive on Profil')
  await until(tab, HEADING, 'the Archive')
  await sleep(400)
  await until(tab, ready, 'the Archive\'s list')
  if (chip) {
    if (!await clickText(tab, `button[data-chip="${chip}"]`)) throw new Error(`no „${chip}“ chip`)
    await until(tab, `document.querySelector('button[data-chip="${chip}"]')?.getAttribute('aria-pressed') === 'true'`, `the ${chip} chip pressed`)
    await sleep(300)
  }
  if (search) {
    await typeInto(tab, 'input[type=search]', search)
    await until(tab, `document.querySelector('input[type=search]')?.value === ${JSON.stringify(search)}`, 'the search term')
    await sleep(300)
  }
}

/** Switches the fake off for the page: the states after it read the page as the server answers. */
const faked = tab => tab.evaluate('window.__archiveFake = null')

/**
 * A state of the Archive whose list is the walk's own Events: `keep` names them (of the built ones); `rest` is the chip or the search the state chooses, and
 * `edit(made)` the fields the list changes of one entry (`archiv-eine`'s one Person, `archiv-ohne-datum`'s missing date).
 */
function list(name, account, keep, { edit, ...view } = {}) {
  return {
    name,
    group: 'archiv',
    account,
    async open(ctx) {
      const made = await events(ctx)
      await archive(ctx, { keep: keep(made), edit: edit ? edit(made) : null, hold: false }, view)
    },
    after: ctx => faked(ctx.tab),
  }
}

const ALL = made => Object.values(made)
const MEMBER = made => [made.sieger, made.gleichstand, made.tribuene, made.offen]

export const STATES = [
  {
    name: 'archiv-laedt',
    group: 'archiv',
    account: 'host',
    async open(ctx) {
      await archive(ctx, { keep: null, hold: true }, { ready: shows(COPY.archiveList.loading) })
    },
    after: ctx => faked(ctx.tab),
  },
  {
    name: 'archiv-leer',
    group: 'archiv',
    account: 'member',
    async open(ctx) {
      await archive(ctx, { keep: [], hold: false }, { ready: shows(COPY.archiveList.emptyTitle) })
    },
    after: ctx => faked(ctx.tab),
  },
  list('archiv-eine', 'host', made => [made.sieger], { edit: made => ({ [made.sieger]: { memberCount: 1 } }) }),
  list('archiv-ohne-datum', 'host', made => [made.sieger], { edit: made => ({ [made.sieger]: { finishedAt: null } }) }),
  list('archiv-mehrere', 'member', MEMBER),
  list('archiv-spieler', 'member', made => [made.sieger]),
  list('archiv-gleichstand', 'member', made => [made.gleichstand]),
  list('archiv-tribuene', 'member', made => [made.tribuene]),
  list('archiv-host', 'host', made => [made.sieger]),
  list('archiv-siegerehrung-offen', 'member', made => [made.offen]),
  list('archiv-alle', 'host', ALL),
  list('archiv-gewonnen', 'member', MEMBER, { chip: 'won' }),
  list('archiv-als-host', 'host', ALL, { chip: 'host' }),
  list('archiv-suche', 'host', ALL, { search: 'Gleich' }),
  list('archiv-kein-treffer', 'host', ALL, { search: 'zzzqqq' }),
  list('archiv-kein-treffer-gewonnen', 'member', MEMBER, { chip: 'won', search: 'zzzqqq' }),
  list('archiv-noch-kein-sieg', 'member', made => [made.sieger, made.tribuene, made.offen], { chip: 'won' }),
]

/** The walk's Events of the Archive, deleted at its end: the Dev Host's and the Dev Admin's, by the prefix of the run. */
export async function cleanup({ tabs, data }) {
  for (const account of ['host', 'admin']) {
    const { events: listed } = await ok(api(tabs[account], 'GET', '/api/e'), 'GET /api/e')
    for (const event of listed.filter(entry => entry.name.startsWith(data.prefix) && entry.isHost)) {
      await api(tabs[account], 'POST', `/api/e/${event.slug}/sessions/end`)
      await api(tabs[account], 'DELETE', `/api/e/${event.slug}`)
    }
  }
}

/** The source of the fake, for the tests: what it answers to the list, given the server's answer. */
export { archiveFake }
