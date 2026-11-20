// The wording walk's states for the texts Release 0.18 added (#773, spec #719): the Chat and the Emotes of the Event page. Only the walk loads this file (`states.mjs` with
// `extra: 'walk-states-'`); the dark check never does. `dark.mjs` documents the State shape, `dark-states-event.mjs` the pair of readers (`<name>-host`, the Dev Host at 1440, and
// `<name>-spieler`, the Dev Member at 390) and the Events it makes; `walk-states-notes.mjs` is the model for a plan (`CLAIMS`, `UNREACHED`) and for a fake `fetch` from the load.
// Every state builds its own Event in every `open` (`fresh: true`): the Chat's states write and delete Messages, so a memoised Event would carry one state's Messages into the next.
// The Events are named `W<run> Chat …` (`ctx.data.prefix`) and deleted at the end of the run by the dark file's `cleanup`, which the runner calls last (the walk then checks that none is left).
// The Messages are written through the API as the dev Users (`say`), paced under the server's limit of 5 per User in 10 s; the composer's own controls are used where a state is
// about sending. The fakes are walk-only, like #810's: a script from the load (or a one-off call in the page) wraps `fetch` and `setTimeout`, and `after` switches it off.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sleep } from './chrome.mjs'
import { api, enterResult, eventView, ok, placesOf, runningEvent } from './kit.mjs'
import { admin, BUILDS, host, layerOpen, member, pair, pool, press, running, signIn, stop, until } from './dark-states-event.mjs'
import { fieldByLabel, releaseToasts, scriptFromLoad, setField, UNTAG } from './walk-kit.mjs'

const COPY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/de.json'), 'utf8'))

// ---------------------------------------------------------------------------------------------------------------------------------
// The plan

/** How long the page waits after an Emote's tap (`EMOTE_PAGE_WAIT_MS` of `shared/emote.ts`: the room's 2000 ms and a margin of 150): a literal, since Node cannot import `shared/*.ts` here. `test/unit/wording-walk-chat.test.ts` pins it. */
export const WAIT_MS = 2150
/** The Undo toast of a delete (`UNDO_MS` of `ChatPanel.vue`). */
const UNDO_MS = 5000

/**
 * The state that shows each text of the Chat and the Emotes (key → state name, the pair's `-host` and `-spieler` left off). A `chat.*`, `emote.*` or `empty.chat.*` key of `de.json`, or one of
 * the four reasons the Chat's calls show, that is in neither this table nor `UNREACHED` fails `test/unit/wording-walk-chat.test.ts`, so a text added later is planned before it is merged.
 */
export const CLAIMS = {
  'emote.label': 'emote-leerlauf',
  'emote.send': 'emote-leerlauf',
  'emote.clap': 'emote-leerlauf',
  'emote.tears': 'emote-leerlauf',
  'emote.angry': 'emote-leerlauf',
  'emote.roar': 'emote-leerlauf',
  'emote.wait': 'emote-warten',
  'chat.logAria': 'chat-nachrichten',
  'chat.placeholder': 'chat-nachrichten',
  'chat.send': 'chat-nachrichten',
  'empty.chat.title': 'chat-leer',
  'empty.chat.text': 'chat-leer',
  'chat.loadFailed': 'chat-laden-fehler',
  'chat.retry': 'chat-laden-fehler',
  'chat.older': 'chat-aeltere',
  'chat.remaining': 'chat-zaehler',
  'chat.failed': 'chat-fehlgeschlagen',
  'chat.sending': 'chat-sendet',
  'error.rateLimited': 'chat-gedrosselt',
  'chat.delete': 'chat-schreiber-loescht',
  'chat.deleteAria': 'chat-schreiber-loescht',
  'chat.deletedToast': 'chat-schreiber-loescht',
  'chat.undo': 'chat-schreiber-loescht',
  'chat.deletedByWriter': 'chat-schreiber-loescht',
  'chat.deleted': 'chat-host-loescht',
  'error.messageNotFound': 'chat-loeschen-nicht-gefunden',
  'error.messageNotYours': 'chat-loeschen-fremd',
  'chat.deleteAnyAria': 'chat-nicht-gelistet',
  'chat.finished': 'chat-fertig',
}

/** The texts no state can show (key → why). */
export const UNREACHED = {
  'error.messageInvalid': 'No surface shows it. The composer sends only a text `parseMessageText` accepts, and `ChatPanel.vue`\'s send failure shows `chat.failed` without mapping the code; the delete\'s toast maps any code of `DELETE`, which never answers `invalid_message`.',
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The fakes

/**
 * The source of the walk's fakes, for a script from the load or a call in the page: `config` says which of the Chat's calls answer as faked. `read` answers the Messages' `GET` with a 500,
 * `post` the `POST` with a failure (`'fail'`) or never (`'pending'`), `del` the `DELETE` with `{ status, code }` (the body carries the code in `statusMessage`, which `apiFailure` reads),
 * `drop` leaves the Member with that id out of the Event read, and `hold` keeps a timer of exactly that many ms from ever firing until `window.__chatFakes.release()` (only while
 * `window.__chatFakes.holding` is true, so no other timer of that length is caught). `window.__chatFakes = null` switches all of it off for the page that has it.
 */
const fakesScript = config => `(() => {
  const state = { config: ${JSON.stringify(config)}, holding: false, held: [], release() { this.held.splice(0).forEach(fn => fn()) } }
  window.__chatFakes = state
  const answer = (status, code) => Promise.resolve(new Response(JSON.stringify({ statusCode: status, statusMessage: code }), { status, headers: { 'content-type': 'application/json' } }))
  const real = window.fetch
  window.fetch = (input, init) => {
    const faked = window.__chatFakes?.config
    if (!faked) return real(input, init)
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    const method = (init?.method ?? input.method ?? 'GET').toUpperCase()
    const parts = url.pathname.split('/')
    const isEvent = parts[1] === 'api' && parts[2] === 'e' && parts.length >= 4
    if (isEvent && parts[4] === 'messages' && parts.length === 5) {
      if (method === 'GET' && faked.read) return answer(500, 'internal')
      if (method === 'POST' && faked.post === 'fail') return Promise.reject(new TypeError('Failed to fetch'))
      if (method === 'POST' && faked.post === 'pending') return new Promise(() => {})
    }
    if (isEvent && parts[4] === 'messages' && parts.length === 6 && method === 'DELETE' && faked.del) return answer(faked.del.status, faked.del.code)
    if (isEvent && parts.length === 4 && method === 'GET' && faked.drop) {
      return real(input, init).then(async (response) => {
        const view = await response.json()
        return new Response(JSON.stringify({ ...view, members: view.members.filter(entry => entry.id !== faked.drop) }), { status: response.status, headers: { 'content-type': 'application/json' } })
      })
    }
    return real(input, init)
  }
  const realTimeout = window.setTimeout
  window.setTimeout = (fn, ms, ...rest) => {
    const current = window.__chatFakes
    if (current?.holding && current.config.hold?.includes(ms)) {
      current.held.push(fn)
      return 0
    }
    return realTimeout(fn, ms, ...rest)
  }
})()`

/** Starts holding the timers the fakes' `hold` names, from now on. */
const startHold = tab => tab.evaluate('window.__chatFakes.holding = true')
/** Lets every held timer fire. */
const release = tab => tab.evaluate('window.__chatFakes.release()')

// ---------------------------------------------------------------------------------------------------------------------------------
// What the states write and press

/** The page expression for the text `value` being on the page. */
const shows = value => `document.body.textContent.replace(${UNTAG}, '').includes(${JSON.stringify(value)})`

/** The `log` is on the page and has loaded: the Chat is ready. */
const READY = `(() => { const log = document.querySelector('[role=log]'); return !!log && log.getAttribute('aria-busy') !== 'true' })()`

const WINDOW_MS = 10_500
const PER_WINDOW = 5
/** When each User posted a Message through this file, for the server's limit of 5 in 10 s (`messages/index.post.ts`). The window is 500 ms longer than the server's. */
const posted = { host: [], member: [], admin: [] }

/** Waits until `account` may post one more Message, and counts it. */
async function pace(account) {
  const times = posted[account]
  for (;;) {
    while (times.length && Date.now() - times[0] > WINDOW_MS) times.shift()
    if (times.length < PER_WINDOW) break
    await sleep(times[0] + WINDOW_MS - Date.now() + 50)
  }
  times.push(Date.now())
}

/** Waits until nothing this file posted for `account` is inside the window, so the next five Messages are the window's only ones. */
async function drain(account) {
  const last = posted[account].at(-1)
  if (last !== undefined) await sleep(Math.max(0, last + WINDOW_MS - Date.now()))
  posted[account].length = 0
}

/** `account` writes `text` into the Event as a Message, through the API with a uuid; returns the Message. */
async function say(ctx, account, slug, text) {
  await pace(account)
  return ok(api(ctx.tabs[account], 'POST', `/api/e/${slug}/messages`, { id: randomUUID(), text }), `post a Message of ${account}`)
}

/** The account of the state's own tab, and the other one of the pair. */
const ownOf = ctx => ctx.tab.account
const otherOf = ctx => (ownOf(ctx) === 'host' ? 'member' : 'host')

/** The phone's tab bar item „Chat“. */
const chatTab = tab => press(tab, `nav[aria-label*=${JSON.stringify(COPY.event.tabs.label)}] button`, COPY.nav.tabs.chat)

const FIELD = fieldByLabel(COPY.chat.placeholder)

/** The composer's text, and with `send` its button (found by its `aria-label`), as a User's hands: nothing is sent when `send` is false. */
async function compose(tab, text, { send = true } = {}) {
  await setField(tab, FIELD, text)
  await sleep(200)
  if (!send) return
  const pressed = await tab.evaluate(`(() => {
    const button = [...document.querySelectorAll('button[aria-label]')].find(b => b.getBoundingClientRect().width > 0 && b.getAttribute('aria-label').replace(${UNTAG}, '') === ${JSON.stringify(COPY.chat.send)})
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!pressed) throw new Error('no send button in the composer')
}

/** The control of the delete next to the Message `id` (a sibling of its bubble), the page expression. */
const controlOf = id => `(() => { const bubble = [...document.querySelectorAll('[data-message-id]')].find(el => el.dataset.messageId === ${JSON.stringify(id)}); return bubble?.parentElement?.querySelector('button') ?? null })()`

/** One press on the delete control of the Message `id`. */
async function deleteMessage(tab, id) {
  const pressed = await tab.evaluate(`(() => { const el = ${controlOf(id)}; if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.click(); return true })()`)
  if (!pressed) throw new Error('no delete control on the Message')
}

/** An Event of the Host and the Member (and the Admin as a third Party with `three`), the Session started, named `W<run> Chat <kind>`. */
async function chatEvent(ctx, kind, { three = false } = {}) {
  await signIn(ctx, 'member')
  if (!three) return running(ctx, `Chat ${kind}`, { n: 3, settings: { gameCount: 3 } })
  await signIn(ctx, 'admin')
  return runningEvent([host(ctx), member(ctx), admin(ctx)], { name: `${ctx.data.prefix}Chat ${kind}`, pool: await pool(ctx, 3), settings: { gameCount: 3 } })
}

/**
 * What every state of the file does after its reading, on either side: the fakes of the load and of the page off. The Event is not deleted here: the page that still shows it would
 * read it again and meet a 404 (a page error in the run), so the dark file's `cleanup`, which the runner calls last, deletes every Event of the prefix.
 */
async function done(ctx) {
  if (ctx.fakeScript !== undefined) await releaseToasts(ctx.tab, ctx.fakeScript).catch(() => {})
  ctx.fakeScript = undefined
  await ctx.tab.evaluate('window.__chatFakes = null').catch(() => {})
}

/**
 * One state as the pair of readers. `build(ctx)` makes the Event of every `open`; `fakes(ctx, event)` is the fakes' config, installed as a script from the load before the page opens;
 * `phone` (default) presses the phone's Chat tab at 390; `ready` is the page expression that says the state's page has come (default: the Chat has loaded); `prepare(ctx)` then does what
 * the reading needs. The pair's own `after` is the Member's only, so each state gets `done` on both sides.
 */
function chatPair({ name, group, only, build, fakes, phone = true, ready = READY, prepare, hostStops, spielerStops }) {
  BUILDS[name] = async (ctx) => {
    const event = await build(ctx)
    if (fakes) ctx.fakeScript = await scriptFromLoad(ctx.tab, fakesScript(fakes(ctx, event)))
    return event
  }
  return pair({
    name,
    group,
    only,
    fresh: true,
    hostStops,
    spielerStops,
    async prepare(ctx) {
      if (phone && ctx.width === 390) await chatTab(ctx.tab)
      if (phone || ready !== READY) await until(ctx.tab, ready, `the page of ${name}`)
      await sleep(300)
      await prepare?.(ctx)
    },
  }).map(state => ({ ...state, after: done }))
}

/** One press on the visible `selector` whose `aria-label`, key tags left off, is `label`: a label with a name put into it carries tags inside, which `press` (a plain `includes`) would not match. */
async function pressLabelled(tab, selector, label) {
  const pressed = await tab.evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.getBoundingClientRect().width > 0 && (b.getAttribute('aria-label') ?? '').replace(${UNTAG}, '') === ${JSON.stringify(label)})
    if (!el) return false
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    el.click()
    return true
  })()`)
  if (!pressed) throw new Error(`no ${selector} „${label}“ on the page`)
}

/** The Emote is tapped: on the row at 1440, through the phone's button and its sheet at 390. */
async function tapClap(tab, width) {
  const clap = COPY.emote.send.replace('{name}', COPY.emote.clap)
  if (width === 390) {
    await press(tab, 'button[aria-haspopup=dialog]', COPY.emote.label)
    await layerOpen(tab, 'the Emotes\' sheet')
    await pressLabelled(tab, '[role=dialog] button', clap)
    await until(tab, `!document.querySelector('[role=dialog]')`, 'the sheet to close')
  }
  else await pressLabelled(tab, 'button', clap)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The Emotes

const emoteStates = [
  // The row of four on the board (1440) and the phone's one button (390), nothing tapped.
  ...chatPair({
    name: 'emote-leerlauf',
    group: 'event-emote',
    phone: false,
    build: ctx => chatEvent(ctx, 'Emote leerlauf'),
  }),

  // One tap: every button is disabled and described by „Kurz warten“. The page's 2150 ms timer is held from the tap on, so the reading, which takes longer, sees the wait.
  ...chatPair({
    name: 'emote-warten',
    group: 'event-emote',
    phone: false,
    build: ctx => chatEvent(ctx, 'Emote warten'),
    fakes: () => ({ hold: [WAIT_MS] }),
    async prepare(ctx) {
      await startHold(ctx.tab)
      await tapClap(ctx.tab, ctx.width)
      await until(ctx.tab, `${shows(COPY.emote.wait)} && !!document.querySelector('[aria-disabled=true][aria-describedby]')`, 'the Emotes\' wait')
      await sleep(300)
    },
  }),

  // The phone's sheet with the four Emotes.
  ...chatPair({
    name: 'emote-blatt',
    group: 'event-emote',
    only: 'spieler',
    phone: false,
    build: ctx => chatEvent(ctx, 'Emote Blatt'),
    async prepare(ctx) {
      await press(ctx.tab, 'button[aria-haspopup=dialog]', COPY.emote.label)
      await layerOpen(ctx.tab, 'the Emotes\' sheet')
    },
  }),
]

// ---------------------------------------------------------------------------------------------------------------------------------
// The Chat

/** The Message of the plain and the link kind, as the pair of states reads them. */
const TEXTS = {
  welcome: 'Willkommen zur Runde, schön dass ihr da seid.',
  hello: 'Hallo zusammen, ich bin schon da.',
  games: 'Welche Spiele stehen heute an?',
  rules: 'Die Hausregeln stehen hier: https://example.com/regeln',
  own: 'Das ist meine Nachricht.',
  other: 'Das ist die Nachricht eines anderen.',
}

/** The Member's Message that the delete states press, written before the page opens; `ctx.ids` holds its id and the other's. */
async function ownAndOther(ctx, kind) {
  const event = await chatEvent(ctx, kind)
  const own = await say(ctx, ownOf(ctx), event.slug, TEXTS.own)
  const other = await say(ctx, otherOf(ctx), event.slug, TEXTS.other)
  ctx.ids = { own: own.id, other: other.id }
  return event
}

const chatStates = [
  // Messages of the Host (one with a link, one plain) and of the Member (two, one group).
  ...chatPair({
    name: 'chat-nachrichten',
    group: 'event-chat',
    async build(ctx) {
      const event = await chatEvent(ctx, 'Nachrichten')
      await say(ctx, 'host', event.slug, TEXTS.welcome)
      await say(ctx, 'member', event.slug, TEXTS.hello)
      await say(ctx, 'member', event.slug, TEXTS.games)
      await say(ctx, 'host', event.slug, TEXTS.rules)
      return event
    },
  }),

  ...chatPair({
    name: 'chat-leer',
    group: 'event-chat',
    build: ctx => chatEvent(ctx, 'leer'),
  }),

  // The first read fails from the load on: the notice with its button. Nothing is written.
  ...chatPair({
    name: 'chat-laden-fehler',
    group: 'event-chat',
    build: ctx => chatEvent(ctx, 'Laden Fehler'),
    fakes: () => ({ read: true }),
    ready: shows(COPY.chat.loadFailed),
  }),

  // 51 Messages (a page holds 50) of three writers, so the top of the log offers „Ältere laden“. 17 each, paced: about 35 s.
  ...chatPair({
    name: 'chat-aeltere',
    group: 'event-chat',
    only: 'host',
    async build(ctx) {
      const event = await chatEvent(ctx, 'Aeltere', { three: true })
      const writers = ['host', 'member', 'admin']
      await Promise.all(writers.map(async (account, w) => {
        for (let n = w; n < 51; n += writers.length) await say(ctx, account, event.slug, `Zwischenruf Nummer ${n + 1}`)
      }))
      return event
    },
  }),

  // 420 characters typed: the counter and the remaining characters appear from 400 (80 % of 500).
  ...chatPair({
    name: 'chat-zaehler',
    group: 'event-chat',
    build: ctx => chatEvent(ctx, 'Zaehler'),
    prepare: ctx => compose(ctx.tab, 'Test '.repeat(84), { send: false }),
  }),

  // A send that cannot reach the server: the line „Nicht gesendet. Erneut senden?“.
  ...chatPair({
    name: 'chat-fehlgeschlagen',
    group: 'event-chat',
    build: ctx => chatEvent(ctx, 'Fehlgeschlagen'),
    fakes: () => ({ post: 'fail' }),
    async prepare(ctx) {
      await compose(ctx.tab, TEXTS.hello)
      await until(ctx.tab, shows(COPY.chat.failed), 'the failed line')
      await sleep(300)
    },
  }),

  // A sixth send inside 10 seconds: the server answers 429 and the line says „Langsam, langsam“ above the failed one. Five Messages are written through the API first, in one burst.
  ...chatPair({
    name: 'chat-gedrosselt',
    group: 'event-chat',
    build: ctx => chatEvent(ctx, 'Gedrosselt'),
    async prepare(ctx) {
      const account = ownOf(ctx)
      await drain(account)
      for (let n = 1; n <= PER_WINDOW; n++) await say(ctx, account, ctx.event.slug, `Schnell hintereinander ${n}`)
      await compose(ctx.tab, TEXTS.hello)
      await until(ctx.tab, shows(COPY.error.rateLimited), 'the limiter\'s line')
      await sleep(300)
    },
  }),

  // A send that never settles: the line stays „wird gesendet …“.
  ...chatPair({
    name: 'chat-sendet',
    group: 'event-chat',
    build: ctx => chatEvent(ctx, 'Sendet'),
    fakes: () => ({ post: 'pending' }),
    async prepare(ctx) {
      await compose(ctx.tab, TEXTS.hello)
      await until(ctx.tab, shows(COPY.chat.sending), 'the sending line')
      await sleep(300)
    },
  }),

  // Each side deletes its own Message by its control: the Undo toast, held for the reading (its 5 s timer), then released, and the line „Gelöscht“.
  ...(() => {
    const stops = [
      stop('loeschen', async (tab, ctx) => {
        await startHold(tab)
        await deleteMessage(tab, ctx.ids.own)
        await until(tab, `${shows(COPY.chat.deletedToast)} && ${shows(COPY.chat.undo)}`, 'the Undo toast')
        await sleep(300)
      }),
      // Inside the toast's lifetime: the stop must not press its „Rückgängig“.
      stop('geloescht', async (tab, ctx) => {
        await release(tab)
        await until(tab, `(() => { const line = [...document.querySelectorAll('[data-message-id]')].find(el => el.dataset.messageId === ${JSON.stringify(ctx.ids.own)}); return !!line && line.textContent.replace(${UNTAG}, '').trim() === ${JSON.stringify(COPY.chat.deletedByWriter)} })()`, 'the writer\'s deleted line')
        await sleep(300)
      }, { keep: true }),
    ]
    return chatPair({
      name: 'chat-schreiber-loescht',
      group: 'event-chat',
      build: ctx => ownAndOther(ctx, 'Schreiber loescht'),
      fakes: () => ({ hold: [UNDO_MS] }),
      hostStops: stops,
      spielerStops: stops,
    })
  })(),

  // The Host deletes a Member's Message before the page opens: both sides show „Vom Host gelöscht“, and the Host's control on the Member's other Message names the Member.
  ...chatPair({
    name: 'chat-host-loescht',
    group: 'event-chat',
    async build(ctx) {
      const event = await chatEvent(ctx, 'Host loescht')
      const first = await say(ctx, 'member', event.slug, TEXTS.hello)
      await say(ctx, 'member', event.slug, TEXTS.games)
      await say(ctx, 'host', event.slug, TEXTS.welcome)
      await ok(api(host(ctx), 'DELETE', `/api/e/${event.slug}/messages/${first.id}`), 'delete the Member\'s Message as the Host')
      return event
    },
  }),

  // The delete's call answers „not found“: the Message comes back and the error toast stands once the Undo toast has ended (the page's own 5 s).
  ...chatPair({
    name: 'chat-loeschen-nicht-gefunden',
    group: 'event-chat',
    only: 'spieler',
    build: ctx => ownAndOther(ctx, 'Loeschen nicht gefunden'),
    fakes: () => ({ del: { status: 404, code: 'message_not_found' } }),
    async prepare(ctx) {
      await deleteMessage(ctx.tab, ctx.ids.own)
      await until(ctx.tab, shows(COPY.error.messageNotFound), 'the error toast of the delete', 20_000)
      await sleep(300)
    },
  }),

  // The delete's call answers „not yours“.
  ...chatPair({
    name: 'chat-loeschen-fremd',
    group: 'event-chat',
    only: 'spieler',
    build: ctx => ownAndOther(ctx, 'Loeschen fremd'),
    fakes: () => ({ del: { status: 403, code: 'not_your_message' } }),
    async prepare(ctx) {
      await deleteMessage(ctx.tab, ctx.ids.own)
      await until(ctx.tab, shows(COPY.error.messageNotYours), 'the error toast of the delete', 20_000)
      await sleep(300)
    },
  }),

  // A writer the Event no longer lists: no real route removes a Member, so the Host's page reads the Event again (the window's focus) with the Member left out, and the control on the
  // Member's Message loses the name.
  ...chatPair({
    name: 'chat-nicht-gelistet',
    group: 'event-chat',
    only: 'host',
    async build(ctx) {
      const event = await chatEvent(ctx, 'Nicht gelistet')
      await say(ctx, 'member', event.slug, TEXTS.hello)
      await say(ctx, 'host', event.slug, TEXTS.welcome)
      ctx.memberId = (await eventView(member(ctx), event.slug)).viewerId
      return event
    },
    async prepare(ctx) {
      await ctx.tab.evaluate(fakesScript({ drop: ctx.memberId }))
      await ctx.tab.evaluate(`window.dispatchEvent(new Event('focus'))`)
      await until(ctx.tab, `[...document.querySelectorAll('button[aria-label]')].some(b => b.getAttribute('aria-label').replace(${UNTAG}, '') === ${JSON.stringify(COPY.chat.deleteAnyAria)})`, 'the control without a name')
      await sleep(300)
    },
  }),

  // The finished page: the note instead of the composer. Two Messages are written before the Finish, since a finished Event takes no Message.
  ...chatPair({
    name: 'chat-fertig',
    group: 'event-finished',
    async build(ctx) {
      await signIn(ctx, 'member')
      const event = await runningEvent([host(ctx), member(ctx)], { name: `${ctx.data.prefix}Chat fertig`, pool: await pool(ctx, 3), settings: { gameCount: 3 }, set: 3 })
      for (const roundId of event.roundIds) await enterResult(host(ctx), event.slug, roundId, placesOf([1, 2]))
      await say(ctx, 'host', event.slug, TEXTS.welcome)
      await say(ctx, 'member', event.slug, TEXTS.hello)
      await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/finish`, { outcome: 'winner', winners: [1] }), 'finish the Event')
      return event
    },
  }),
]

export const STATES = [...emoteStates, ...chatStates]
