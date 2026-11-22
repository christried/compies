// The wording walk's states for the texts Release 0.16 added (#810 part b, spec #790): the notes editor, the Event notes, the game's Events and the archive. Only the walk loads
// this file (`states.mjs` with `extra: 'walk-states-'`); the dark check never does. `dark.mjs` documents the State shape, `dark-states-event.mjs` the pair of readers
// (`<name>-host` at 1440, `<name>-spieler` at 390) and the Events it makes. 0.16's texts count as approved (the operator, 2026-11-18): these states make the NEXT walk picture them.
// Nothing is saved but two things the states say: `bibliothek-spiel-notizen` archives `Spiel Notizen` and restores it (its `after` and the file's `cleanup` put it back), and
// the Event states make Event notes with the Host's own requests. A form is typed into and never sent: the CTA refuses, or its request is held back by a replaced `fetch`.
// `bibliothek-neu-editor-ladefehler` blocks the editor's chunk through the tab's CDP session (`blockUrls`) and lifts the block in its `after` (#826).
// Only the Host's tab ever reads Event notes (a Member's read carries none, `CODING_STANDARDS.md` § Secrecy), so no Event state of this file opens on a Member's tab.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sleep } from './chrome.mjs'
import { api, centre, clickText, createGame, enterResult, open, ok, placesOf, runningEvent, typeInto } from './kit.mjs'
import { next, noAutoLoad, page, step } from './dark-states-app.mjs'
import { BUILDS, host, keepToasts, layerOpen, member, pair, pool, press, running, signIn, stop, toastShown, until } from './dark-states-event.mjs'
import { backspace, blockUrls, fieldByLabel, focusNotes, releaseToasts, scriptFromLoad, setField, typeNotes, unblockUrls, UNTAG } from './walk-kit.mjs'

const COPY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/de.json'), 'utf8'))
const GAME_PREFIX = 'R011 Dunkel-Check '

// ---------------------------------------------------------------------------------------------------------------------------------
// The plan

/** The limit of Game notes and of Event notes (`GAME_NOTES_MAX`, `EVENT_NOTES_MAX`): a literal, since Node cannot import `shared/*.ts` here. `test/unit/wording-walk-notes.test.ts` pins it. */
export const NOTES_LIMIT = 2000

/**
 * The state that shows each text of 0.16 (key → state name). A key of the notes' namespaces, or of the archive, the game's Events and „Alle Tags“, that is in neither this table nor
 * `UNREACHED` fails `test/unit/wording-walk-notes.test.ts`, so a text added later is planned before it is merged. A text that a ticket removes drops its line here.
 */
export const CLAIMS = {
  'empty.library.title': 'bibliothek-leer-admin',
  'empty.library.text': 'bibliothek-leer-admin',
  'library.filterArchived': 'bibliothek-archiviert',
  'library.archivedMark': 'bibliothek-archiviert',
  'library.restore': 'bibliothek-archiviert',
  'library.restoreLabel': 'bibliothek-archiviert',
  'library.archiveSwitch': 'bibliothek-spiel-notizen',
  'library.archiveHelp': 'bibliothek-spiel-notizen',
  'library.archivedDone': 'bibliothek-spiel-notizen',
  'library.restoredDone': 'bibliothek-spiel-notizen',
  'gameEvents.none': 'bibliothek-spiel-notizen',
  'notes.link.new_tab': 'bibliothek-spiel-notizen',
  'gameEvents.failed': 'bibliothek-spiel-events-fehler',
  // The dark check's own states reach these: the 60-character game sits in the walk's Event, and the library's cards count the live Events.
  'gameEvents.title': 'bibliothek-spiel',
  'library.inEvents': 'bibliothek',
  'notesEditor.label': 'bibliothek-neu-editor',
  'notesEditor.help': 'bibliothek-neu-editor',
  'notesEditor.placeholder': 'bibliothek-neu-editor',
  'notesEditor.toolbar': 'bibliothek-neu-editor',
  'notesEditor.bold': 'bibliothek-neu-editor',
  'notesEditor.italic': 'bibliothek-neu-editor',
  'notesEditor.heading': 'bibliothek-neu-editor',
  'notesEditor.bulletList': 'bibliothek-neu-editor',
  'notesEditor.orderedList': 'bibliothek-neu-editor',
  'notesEditor.link': 'bibliothek-neu-editor',
  'notesEditor.linkAddress': 'bibliothek-neu-editor',
  'notesEditor.linkApply': 'bibliothek-neu-editor',
  'notesEditor.linkCancel': 'bibliothek-neu-editor',
  'notesEditor.linkError': 'bibliothek-neu-editor',
  'notesEditor.loadFailed': 'bibliothek-neu-editor-ladefehler',
  'notesEditor.unlink': 'bibliothek-bearbeiten-notizen',
  'notesEditor.boldInHeading': 'bibliothek-bearbeiten-notizen',
  'notesEditor.counter': 'bibliothek-bearbeiten-notizen',
  'notesEditor.liveRemaining': 'bibliothek-bearbeiten-notizen',
  'notesEditor.over': 'bibliothek-bearbeiten-notizen',
  'notesEditor.errorMax': 'bibliothek-bearbeiten-notizen',
  'notesEditor.saveBlocked': 'bibliothek-bearbeiten-notizen',
  'gameEdit.allTags': 'bibliothek-bearbeiten-notizen',
  'notesEditor.saving': 'bibliothek-bearbeiten-speichert',
  'eventNotes.title': 'spiel-notizen-host',
  'eventNotes.edit': 'spiel-notizen-host',
  'eventNotes.add': 'spiel-notizen-host',
  'notes.edit_a11y': 'spiel-notizen-host',
  'notes.add': 'spiel-notizen-host',
  'notesEditor.eventLabel': 'spiel-notizen-host',
  'notesEditor.eventHelp': 'spiel-notizen-host',
  'notesEditor.eventPlaceholder': 'spiel-notizen-host',
  'notes.from_library': 'spiel-notizen-host',
  'notes.finished.chip': 'fertig-notizen-host',
  'notes.open_a11y': 'picker-notizen-host',
  // The texts 0.19 adds or changes (#861, spec #856): the game form's duplicate hint, the settings row „Weniger Bewegung“ and § 9 of the Datenschutzerklärung.
  'gameEdit.duplicate': 'bibliothek-neu-doppelt',
  'gameEdit.useExisting': 'bibliothek-neu-doppelt',
  'gameEdit.duplicateArchived': 'bibliothek-neu-doppelt-archiviert',
  'gameEdit.openArchived': 'bibliothek-neu-doppelt-archiviert',
  'settings.motion': 'profil',
  'settings.motionHelp': 'profil',
  'settings.motionSaveFailed': 'profil-weniger-bewegung-fehler',
  'legal.datenschutz.cookies.text': 'datenschutz',
  'legal.datenschutz.changes.text': 'datenschutz',
}

/** The texts of 0.16 no state can show (key → why). */
export const UNREACHED = {
  'notesEditor.loading': 'The text is `sr-only` inside the placeholder box of `RichNotesEditorFallback` and exists only while the editor\'s chunk loads. Every state waits for the editor (or, in `bibliothek-neu-editor-ladefehler`, for the failure), so no reading holds it and no picture could show it (#826).',
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The data

const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const item = value => ({ type: 'listItem', content: [{ type: 'paragraph', content: [text(value)] }] })

/** The Game notes of `Spiel Notizen`: a heading, a paragraph with a bold and an italic run, a bullet list, an ordered list and a paragraph with a link. A document `parseNotes` takes unchanged (the test runs it). */
export const WALK_NOTES = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 3 }, content: [text('Aufbau')] },
    { type: 'paragraph', content: [text('Jede Runde dauert '), text('zehn Minuten', [{ type: 'bold' }]), text(', gespielt wird '), text('ohne Pause', [{ type: 'italic' }]), text('.')] },
    { type: 'bulletList', content: [item('Controller vorher koppeln'), item('Lautstärke auf die Hälfte')] },
    { type: 'orderedList', content: [item('Karte wählen'), item('Sieger zählen')] },
    { type: 'paragraph', content: [text('Regeln: '), text('example.invalid/regeln', [{ type: 'link', attrs: { href: 'https://example.invalid/regeln' } }])] },
  ],
}

/** The Event notes of a game: a bold run and a link. A document `parseNotes` takes unchanged. */
export const EVENT_NOTES = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [text('Heute nur ', [{ type: 'bold' }]), text('Bo1'), text(', Hausregeln unter '), text('example.invalid/haus', [{ type: 'link', attrs: { href: 'https://example.invalid/haus' } }])] },
  ],
}

let library
/** The Tags of `Spiel Schlagworte`: the most a game may have (`TAGS_PER_GAME_MAX`, 8), so the card's Tags take two rows and a „+X“ at the widths of the library. */
const TAGGED_TAGS = ['Koop', 'Schnell', 'Familie', 'Party', 'Taktik', 'Retro', 'Rätselspaß', 'Wortspiele']

/** The library games of the states, found by name or made once: `Spiel Notizen` (2 to 6 players, 60 s, Tags, Game notes), `Spiel Archiv` (plain, archived) and `Spiel Schlagworte` (the most Tags). Library data, never purged, as `Spiel 2`. */
function libraryGames(ctx) {
  library ??= (async () => {
    const tab = host(ctx)
    const known = (await ok(api(tab, 'GET', '/api/games'), 'GET /api/games')).games
    const named = async (name, fields) => known.find(game => game.name === `${GAME_PREFIX}${name}`) ?? await createGame(tab, { name: `${GAME_PREFIX}${name}`, clipLength: 60, ...fields })
    const notes = await named('Spiel Notizen', { playersMin: 2, playersMax: 6, tags: ['Koop', 'Schnell'], notes: WALK_NOTES })
    const archive = await named('Spiel Archiv', { playersMin: 1, playersMax: 8 })
    const tagged = await named('Spiel Schlagworte', { playersMin: 1, playersMax: 4, tags: TAGGED_TAGS })
    // Idempotent: a game that is archived already is answered as it is.
    await ok(api(tab, 'PUT', `/api/games/${archive.id}/archived`, { archived: true }), 'archive Spiel Archiv')
    return { notes, archive, tagged }
  })()
  return library
}

/** `Spiel Notizen` is unarchived again (idempotent): where the stop that archives it ended, or never ran. */
async function unarchive(tab) {
  if (!library) return
  const { notes } = await library
  await ok(api(tab, 'PUT', `/api/games/${notes.id}/archived`, { archived: false }), 'restore Spiel Notizen')
}

/** The Host's Event notes for the first two games of the event (the Round and the next one); the third has none. */
async function eventNotes(ctx, event) {
  for (const game of event.games.slice(0, 2)) await ok(api(host(ctx), 'PUT', `/api/e/${event.slug}/games/${game.id}/notes`, { notes: EVENT_NOTES }), 'save the Event notes')
}

// The Round (the first game) holds both blocks, the second game only the Event block, the third none (its dialog has the add button „Notizen hinzufügen“, #835), and the fourth,
// `Spiel Notizen`, only Game notes (its dialog has „Notizen für dieses Event hinzufügen“ above them).
BUILDS.notizen = async (ctx) => {
  const event = await running(ctx, 'Notizen', { list: [...await pool(ctx, 3), (await libraryGames(ctx)).notes], settings: { gameCount: 3 }, set: 1 })
  await eventNotes(ctx, event)
  return event
}

// The lines of the kit's `finishedEvent`, with the Event notes written before the Finish: a finished Event refuses the write (`wrong_phase`).
BUILDS['notizen-fertig'] = async (ctx) => {
  await signIn(ctx, 'member')
  const event = await runningEvent([host(ctx), member(ctx)], { name: `${ctx.data.prefix}Notizen fertig`, pool: await pool(ctx, 3), settings: { gameCount: 3 }, set: 3 })
  for (const roundId of event.roundIds) await enterResult(host(ctx), event.slug, roundId, placesOf([1, 2]))
  await eventNotes(ctx, event)
  await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/finish`, { outcome: 'winner', winners: [1] }), 'finish the Event')
  return event
}

// ---------------------------------------------------------------------------------------------------------------------------------
// What the stops press

/** The page expression for the text `value` being on the page. */
const shows = value => `document.body.textContent.replace(${UNTAG}, '').includes(${JSON.stringify(value)})`

/** The visible `[role=toolbar]` button of the notes editor whose `aria-label` (after `UNTAG`) is `label`. */
const toolbarButton = label => `[...document.querySelectorAll('[role=toolbar] button')].find(b => (b.getAttribute('aria-label') ?? '').replace(${UNTAG}, '') === ${JSON.stringify(label)})`

/** The link control (`RichNotesLinkControl.vue`): a `dialog` from md up and a `group` below it, both labelled „Link“. */
const LINK_CONTROL = `[...document.querySelectorAll('[role=dialog], [role=group]')].find(el => (el.getAttribute('aria-label') ?? '').replace(${UNTAG}, '') === ${JSON.stringify(COPY.notesEditor.link)})`

/** One click on a toolbar button of the editor. Throws when there is none. */
async function toolbar(tab, label) {
  if (!await tab.evaluate(`(() => { const el = ${toolbarButton(label)}; if (!el) return false; el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); el.click(); return true })()`)) throw new Error(`no toolbar button „${label}“`)
}

/** The toolbar's Link button, and the wait until the control it opens is there. */
async function openLink(tab) {
  await toolbar(tab, COPY.notesEditor.link)
  await until(tab, `!!(${LINK_CONTROL})`, 'the link control')
  await sleep(400)
}

/** A button of the link control, by its text. */
async function linkButton(tab, label) {
  if (!await tab.evaluate(`(() => { const el = [...((${LINK_CONTROL})?.querySelectorAll('button') ?? [])].find(b => b.textContent.replace(${UNTAG}, '').trim() === ${JSON.stringify(label)}); if (!el) return false; el.click(); return true })()`)) throw new Error(`no „${label}“ in the link control`)
}

/** An address the control refuses („Nur Adressen mit http oder https“), typed and applied: the control shows its error. */
async function badLink(tab) {
  await setField(tab, `(${LINK_CONTROL})?.querySelector('input[type=url]')`, 'ftp://example.invalid')
  await linkButton(tab, COPY.notesEditor.linkApply)
  await until(tab, `!!(${LINK_CONTROL})?.querySelector('[role=alert]')`, 'the link error')
  await sleep(300)
}

/** The mouse at the centre of the first match of `selector`, pressed and let go: a real click, as the editor's selection follows the pointer. */
async function pressMouse(tab, selector) {
  const at = await centre(tab, selector)
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at })
  await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 })
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(300)
}

/** The pointer on the toolbar's button `label`, the hover tooltip's 500 ms and a little more waited out. */
async function hoverToolbar(tab, label) {
  const at = await tab.evaluate(`(() => { const el = ${toolbarButton(label)}; if (!el) return null; el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  if (!at) throw new Error(`no toolbar button „${label}“`)
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at })
  await sleep(700)
}

/** The sheet or dialog that is open goes away by its close button, asked up to three times: an edit in the Event notes dialog is cancelled by the first press, the dialog closes by the next. */
async function closeDialogs(tab) {
  const close = `(() => { const layer = document.querySelector('[role=dialog]'); const button = [...(layer?.querySelectorAll('button') ?? [])].find(b => (b.getAttribute('aria-label') ?? '').replace(${UNTAG}, '') === ${JSON.stringify(COPY.common.close)}); button?.click(); return !!layer })()`
  for (let i = 0; i < 3 && await tab.evaluate(close); i++) await sleep(600)
  if (await tab.evaluate(`!!document.querySelector('[role=dialog]')`)) throw new Error('a dialog stays open after its close button')
}

/** A copy of `openTile` of `dark-states-event.mjs` (not exported there): the name button of the game tile `game` in the block under the heading or label `anchor`, pressed. */
async function openTile(tab, anchor, game) {
  const pressed = await tab.evaluate(`(() => {
    const seen = el => el.getBoundingClientRect().width > 0
    const label = [...document.querySelectorAll('h2, h3, p')].find(el => seen(el) && el.textContent.replace(${UNTAG}, '').trim() === ${JSON.stringify(anchor)})
    for (let block = label?.parentElement; block; block = block.parentElement) {
      const button = [...block.querySelectorAll('button')].find(el => seen(el) && el.textContent.includes(${JSON.stringify(game)}))
      if (!button) continue
      button.scrollIntoView({ block: 'center', behavior: 'instant' })
      button.click()
      return true
    }
    return false
  })()`)
  if (!pressed) throw new Error(`no tile „${game}“ under „${anchor}“`)
}

/** The button `label` (its text, or with `byLabel` its `aria-label`) in the nearest block under the heading `anchor` that has one: pressed. Throws when there is none. */
async function pressUnder(tab, anchor, label, { byLabel = false } = {}) {
  const pressed = await tab.evaluate(`(() => {
    const seen = el => el.getBoundingClientRect().width > 0
    const named = el => (${byLabel} ? el.getAttribute('aria-label') ?? '' : el.textContent).replace(${UNTAG}, '').trim()
    const heading = [...document.querySelectorAll('h2, h3, p')].find(el => seen(el) && el.textContent.replace(${UNTAG}, '').trim() === ${JSON.stringify(anchor)})
    for (let block = heading?.parentElement; block; block = block.parentElement) {
      const button = [...block.querySelectorAll('button')].find(el => seen(el) && named(el) === ${JSON.stringify(label)})
      if (!button) continue
      button.scrollIntoView({ block: 'center', behavior: 'instant' })
      button.click()
      return true
    }
    return false
  })()`)
  if (!pressed) throw new Error(`no „${label}“ under „${anchor}“`)
}

/** The Event notes' and the Game notes' first words in the walk's copy: the popover and the dialog show them, so a reading waits for them. */
const GAME_NOTES_TEXT = 'Aufbau'
const EVENT_NOTES_TEXT = 'Heute nur'

/** The button „Bearbeiten“ of the popover or sheet that is open (`GameNotesButton`'s footer): pressed, the dialog of the game opens in edit mode after it. */
async function editFromPopover(tab) {
  await layerOpen(tab, 'the notes popover')
  if (!await clickText(tab, '[role=dialog] button', COPY.library.edit)) throw new Error('no „Bearbeiten“ in the notes popover')
  await until(tab, `!!document.querySelector('[role=dialog] [data-notes-editor]')`, 'the editor of the dialog')
}

/** The library list with `name` typed in its search: the card of the game is on the page, and the auto-load sentinel is taken away. Nothing is changed. */
async function searchLibrary(tab, name) {
  await until(tab, `!!document.querySelector('ul[aria-label*=${JSON.stringify(COPY.library.title)}] li')`, 'the library', 30_000)
  await noAutoLoad(tab)
  await typeInto(tab, 'input[type=search]', name)
  await until(tab, shows(name), `the card of ${name}`)
  await sleep(300)
}

/** `name` typed into the game form's name field, and the duplicate hint `copy` (its `{name}` filled in) waited for. Nothing is sent. */
async function typeName(tab, name, copy) {
  await setField(tab, fieldByLabel(COPY.gameEdit.name), name)
  await until(tab, shows(copy.replace('{name}', name)), 'the duplicate hint')
}

/** The `aria-label` of the notes button of the card or tile of `game` (`notes.open_a11y`). */
const notesButtonOf = game => COPY.notes.open_a11y.replace('{game}', game)

/** A state of the library of the Host (or `account`) that needs the two library games first: `before` runs ahead of the page, and `ctx.games` holds them for the address and the stops. */
function libraryPage(name, account, address, { before, ...rest } = {}) {
  const state = page(name, 'library', account, address, rest)
  return {
    ...state,
    async open(ctx) {
      ctx.games = await libraryGames(ctx)
      await before?.(ctx)
      await state.open(ctx)
    },
  }
}

const gamePath = (ctx, suffix = '') => `/bibliothek/${ctx.games.notes.id}${suffix}`

/** `GET /api/games/<id>/events` answers 500 from the load on (the page's `useFetch` runs in the browser): the page's notice. */
const FAKE_EVENTS_FAIL = `(() => {
  const real = window.fetch
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (/^\\/api\\/games\\/[^/]+\\/events$/.test(url.pathname) && (init?.method ?? input.method ?? 'GET').toUpperCase() === 'GET') return Promise.resolve(new Response('{"statusCode":500}', { status: 500, headers: { 'content-type': 'application/json' } }))
    return real(input, init)
  }
})()`

/** `PATCH /api/games/<id>` never answers: the form stays in its save. */
const NEVER_SAVES = `(() => {
  const real = window.fetch
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (/^\\/api\\/games\\/[^/]+$/.test(url.pathname) && (init?.method ?? input.method ?? 'GET').toUpperCase() === 'PATCH') return new Promise(() => {})
    return real(input, init)
  }
})()`

// ---------------------------------------------------------------------------------------------------------------------------------
// The library

const libraryStates = [
  // The Dev Admin owns no game (the library is the viewer's own): the empty state with its new text. A list means the data is not as planned, which is a FAIL line, never a wrong picture.
  libraryPage('bibliothek-leer-admin', 'admin', () => '/bibliothek', {
    async after(ctx) {
      const list = `!!document.querySelector('ul[aria-label*=${JSON.stringify(COPY.library.title)}] li')`
      await until(ctx.tab, `(${shows(COPY.empty.library.title)}) || ${list}`, 'the empty library or a list', 30_000)
      if (await ctx.tab.evaluate(list)) throw new Error('the Dev Admin\'s library is not empty')
    },
  }),

  // The Archived filter: `Spiel Archiv` with its mark and „Wiederherstellen“. Nothing is restored here.
  libraryPage('bibliothek-archiviert', 'host', () => '/bibliothek', {
    async after(ctx) {
      const { tab } = ctx
      await until(tab, `!!document.querySelector('ul[aria-label*=${JSON.stringify(COPY.library.title)}] li')`, 'the library', 30_000)
      await noAutoLoad(tab)
      if (!await clickText(tab, 'button[aria-pressed]', COPY.library.filterArchived)) throw new Error('no „Archiviert“ filter on the library')
      await until(tab, `${shows(ctx.games.archive.name)} && [...document.querySelectorAll('button')].some(b => b.textContent.replace(${UNTAG}, '').trim() === ${JSON.stringify(COPY.library.restore)})`, 'the archived game with its restore button', 30_000)
      await noAutoLoad(tab)
    },
  }),

  // The card with the most Tags (#711): two rows of Tags and „+X“ on the card of `Spiel Schlagworte`, found by the search. Nothing is changed.
  libraryPage('bibliothek-karte-schlagworte', 'host', () => '/bibliothek', {
    after: ctx => searchLibrary(ctx.tab, ctx.games.tagged.name),
  }),

  // The card's notes (#837, #859): the button of `Spiel Notizen` opens its popover at 1440 px and its sheet at 390 px, with „Bearbeiten“ in the footer. Nothing is saved.
  libraryPage('bibliothek-karte-notizen', 'host', () => '/bibliothek', {
    async after(ctx) {
      const { tab } = ctx
      await searchLibrary(tab, ctx.games.notes.name)
      if (!await tab.evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').replace(${UNTAG}, '') === ${JSON.stringify(notesButtonOf(ctx.games.notes.name))}); if (!el) return false; el.click(); return true })()`)) throw new Error('no notes button on the card of Spiel Notizen')
      await until(tab, shows(GAME_NOTES_TEXT), 'the Game notes of the card')
    },
  }),

  // The game page of `Spiel Notizen` (in no Event): the Game notes with their link, no Events, the archive switch with its help. The stops archive it and restore it, the toasts kept.
  {
    ...libraryPage('bibliothek-spiel-notizen', 'host', ctx => gamePath(ctx), {
      stops: [
        step('archiviert', async (tab) => {
          await keepToasts(tab)
          if (!await clickText(tab, '[role=switch]')) throw new Error('no archive switch on the game page')
          await toastShown(tab, COPY.library.archivedDone)
        }),
        step('wiederhergestellt', async (tab) => {
          if (!await clickText(tab, '[role=switch]')) throw new Error('no archive switch on the game page')
          await toastShown(tab, COPY.library.restoredDone)
        }),
      ],
    }),
    // The game ends as it began, also when a stop failed in between.
    after: ctx => unarchive(ctx.tabs.host),
  },

  // The game's Events cannot be read: the notice, the game stays. The fake runs from the load (the page asks for them on mount) and is taken away again afterwards.
  (() => {
    let identifier = null
    return {
      name: 'bibliothek-spiel-events-fehler',
      group: 'library',
      account: 'host',
      async open(ctx) {
        ctx.games = await libraryGames(ctx)
        identifier = await scriptFromLoad(ctx.tab, FAKE_EVENTS_FAIL)
        await open(ctx.tab, gamePath(ctx), ctx.width, ctx.height, 'h1', { appearance: ctx.appearance })
        await until(ctx.tab, shows(COPY.gameEvents.failed), 'the notice of the failed Events')
      },
      async after(ctx) {
        if (identifier !== null) await releaseToasts(ctx.tab, identifier)
        identifier = null
      },
    }
  })(),

  // The empty editor of a new game, the caret in it (the placeholder shows where the caret is): label, help, placeholder, toolbar; then the link control empty and with its error. Never saved.
  libraryPage('bibliothek-neu-editor', 'host', () => '/bibliothek/neu', {
    waitFor: 'form',
    after: ctx => focusNotes(ctx.tab),
    stops: [
      step('link-leer', openLink),
      step('link-fehler', badLink),
    ],
  }),

  // The editor's chunk cannot be loaded (#826): `RichNotesEditorLoader` shows the critical notice with its button in place of the editor's box. On `pnpm dev` the chunk is
  // `/_nuxt/components/RichNotesEditor.vue` (with a `?t=` query after an edit); the request is blocked through the tab's CDP session from before the page opens, and
  // unblocked in `after`, or every later state of the tab would lose its editor. The pattern ends in `*` for the query and names `.vue` right after the name, so the
  // Loader and the Fallback, which load, stay out of it. No `[data-notes-editor]` ever mounts here, so the wait is for the notice's text. Never saved.
  {
    name: 'bibliothek-neu-editor-ladefehler',
    group: 'library',
    account: 'host',
    async open(ctx) {
      await blockUrls(ctx.tab, ['*/_nuxt/components/RichNotesEditor.vue*'])
      await open(ctx.tab, '/bibliothek/neu', ctx.width, ctx.height, 'form', { appearance: ctx.appearance })
      await until(ctx.tab, shows(COPY.notesEditor.loadFailed), 'the notice of the editor that cannot load')
    },
    after: ctx => unblockUrls(ctx.tab),
  },

  // The name of a library game typed into the new game's form (#689): the hint under the name field, with „Das nehmen“ (the form never navigates). Never saved.
  libraryPage('bibliothek-neu-doppelt', 'host', () => '/bibliothek/neu', {
    waitFor: 'form',
    after: ctx => typeName(ctx.tab, ctx.games.notes.name, COPY.gameEdit.duplicate),
  }),
  // The same with an Archived game (#689): the hint says so and „Zum Spiel“ links to its page; „Das nehmen“ is not offered for it here. Never saved.
  libraryPage('bibliothek-neu-doppelt-archiviert', 'host', () => '/bibliothek/neu', {
    waitFor: 'form',
    after: ctx => typeName(ctx.tab, ctx.games.archive.name, COPY.gameEdit.duplicateArchived),
  }),

  // The editor of `Spiel Notizen`; every stop goes on from the page the last one left. Never saved.
  libraryPage('bibliothek-bearbeiten-notizen', 'host', ctx => gamePath(ctx, '/bearbeiten'), {
    waitFor: 'form',
    after: ctx => focusNotes(ctx.tab),
    stops: [
      // The caret in the heading turns Fett off, and its tooltip says why: a hover, so never on a phone.
      step('ueberschrift', async (tab) => {
        await pressMouse(tab, '[data-notes-editor] h3')
        await hoverToolbar(tab, COPY.notesEditor.bold)
      }, { widths: [1440] }),
      step('alle-tags', async (tab) => {
        // The pointer leaves the toolbar, or its tooltip would stand in this reading too.
        await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 })
        if (!await clickText(tab, 'button', COPY.gameEdit.allTags)) throw new Error('no „Alle Tags“ disclosure on the game form')
        await sleep(400)
      }),
      // The caret on the link: the control opens with its address filled and „Link entfernen“.
      step('link-aendern', async (tab) => {
        await pressMouse(tab, '[data-notes-editor] a')
        await openLink(tab)
        await until(tab, `((${LINK_CONTROL})?.textContent ?? '').replace(${UNTAG}, '').includes(${JSON.stringify(COPY.notesEditor.unlink)})`, '„Link entfernen“ in the link control')
      }),
      step('link-fehler', badLink),
      // 1700 of 2000: the counter, and the live region that spoke when the count crossed 80 %. The control is cancelled first (its error would stand in this reading).
      step('fast-voll', async (tab) => {
        await linkButton(tab, COPY.notesEditor.linkCancel)
        await typeNotes(tab, 'x'.repeat(1700))
      }),
      // 2001: one too many, the help line's error and the CTA's blocker; the CTA refuses, nothing is sent.
      step('zu-lang', async (tab) => {
        await typeNotes(tab, 'x'.repeat(301), { replace: false })
        await until(tab, shows(COPY.notesEditor.saveBlocked), 'the blocker beside the save button')
        if (!await clickText(tab, 'button[type=submit]', COPY.gameEdit.saveChanges)) throw new Error('no save button on the edit form')
        await sleep(300)
      }),
    ],
  }),

  // The save runs and never answers: the editor is locked, its help line says so. The next state's `open` abandons the page.
  libraryPage('bibliothek-bearbeiten-speichert', 'host', ctx => gamePath(ctx, '/bearbeiten'), {
    waitFor: 'form',
    async after(ctx) {
      const { tab } = ctx
      await focusNotes(tab)
      await tab.evaluate(NEVER_SAVES)
      if (!await clickText(tab, 'button[type=submit]', COPY.gameEdit.saveChanges)) throw new Error('no save button on the edit form')
      await until(tab, `!!document.querySelector('[data-notes-editor][aria-disabled="true"]')`, 'the locked editor')
    },
  }),
]

// ---------------------------------------------------------------------------------------------------------------------------------
// The Event: the Host's tab only

const eventStates = [
  // The open Round's „Notizen“ disclosure with both blocks; the Round's dialog with its pencil and the edit's states; the pool tile of the game without Event notes. Nothing is saved.
  ...pair({
    name: 'spiel-notizen',
    group: 'event-live',
    key: 'notizen',
    only: 'host',
    hostWidths: [390, 1440],
    hostStops: [
      // The open Round card's „Bearbeiten“ (#836): the footer opens the game's dialog in edit mode, both fields. The panel is open from the page's first reading.
      stop('runde-bearbeiten', async (tab) => {
        await pressUnder(tab, COPY.rounds.title, COPY.library.edit)
        await layerOpen(tab, 'the game dialog of the Round in edit mode')
        await until(tab, `!!document.querySelector('[role=dialog] [data-notes-editor]')`, 'the editors of the dialog')
      }),
      // Keeps the layer of the stop before: an edit-mode dialog takes two presses of its close button (`closeDialogs`), which `closeLayer` does not make.
      stop('dialog-runde', async (tab, ctx) => {
        await closeDialogs(tab)
        await openTile(tab, COPY.rounds.title, ctx.event.games[0].name)
        await layerOpen(tab, 'the game dialog of the Round')
      }, { keep: true }),
      stop('bearbeiten', async (tab) => {
        await press(tab, 'button', COPY.eventNotes.edit)
        await focusNotes(tab, { scope: '[role=dialog]' })
      }, { keep: true }),
      stop('leer', async (tab) => {
        await focusNotes(tab, { scope: '[role=dialog]', select: true })
        await backspace(tab)
      }, { keep: true }),
      stop('zu-lang', async (tab) => {
        await typeNotes(tab, 'x'.repeat(NOTES_LIMIT + 1), { scope: '[role=dialog]' })
        await until(tab, shows(COPY.notesEditor.saveBlocked), 'the blocker in the dialog\'s footer')
      }, { keep: true }),
      // The pool tile's notes button (#858): the popover of `Spiel Notizen` with its Game notes and „Bearbeiten“, then that footer's dialog in edit mode.
      // The popover closes on a window scroll (`GameNotesButton`'s `onScroll`), and the reading scrolls the page: its picture is taken on a phone's sheet only,
      // and the popover does not open in this stop at 1440 px (#861: not measured there, the Bearbeiten stop below covers the desktop dialog).
      stop('notizen-pool', async (tab, ctx) => {
        await closeDialogs(tab)
        await pressUnder(tab, COPY.howWePlay.mainPool, notesButtonOf(ctx.event.games[3].name), { byLabel: true })
        await until(tab, `!!document.querySelector('[role=dialog]')`, 'the notes popover of the pool tile')
      }, { keep: true, widths: [390] }),
      // Opens the popover again within the same stop (no reading between), then its „Bearbeiten“: the dialog in edit mode. Closes what is open first.
      stop('notizen-pool-bearbeiten', async (tab, ctx) => {
        await closeDialogs(tab)
        await pressUnder(tab, COPY.howWePlay.mainPool, notesButtonOf(ctx.event.games[3].name), { byLabel: true })
        await until(tab, `!!document.querySelector('[role=dialog]')`, 'the notes popover of the pool tile')
        await editFromPopover(tab)
      }, { keep: true, widths: [390] }),
      stop('dialog-pool-leer', async (tab, ctx) => {
        await closeDialogs(tab)
        await openTile(tab, COPY.howWePlay.mainPool, ctx.event.games[3].name)
        await layerOpen(tab, 'the game dialog of the pool')
        await until(tab, shows(COPY.eventNotes.add), 'the add button of the Event notes')
      }, { keep: true }),
      stop('dialog-pool-keine', async (tab, ctx) => {
        await closeDialogs(tab)
        await openTile(tab, COPY.howWePlay.mainPool, ctx.event.games[2].name)
        await layerOpen(tab, 'the game dialog of the pool')
        await until(tab, shows(COPY.notes.add), 'the button for a game with no notes')
      }, { keep: true }),
    ],
  }),

  // The finished Event: the Event block of a game with the lock chip and the dashed frame, in the pool tile's dialog (a finished stage lists no Round cards, so this is where the chip is), no pencil.
  ...pair({
    name: 'fertig-notizen',
    group: 'event-finished',
    key: 'notizen-fertig',
    only: 'host',
    hostWidths: [390, 1440],
    hostStops: [
      stop('dialog-pool', async (tab, ctx) => {
        await openTile(tab, COPY.howWePlay.mainPool, ctx.event.games[0].name)
        await layerOpen(tab, 'the game dialog of the pool')
        await until(tab, shows(COPY.notes.finished.chip), 'the chip of the finished Event\'s notes')
      }),
      // A game with no Game notes in the finished Event: the dialog shows „Notizen hinzufügen“ (#857: the Game field stays open).
      stop('dialog-pool-keine', async (tab, ctx) => {
        await openTile(tab, COPY.howWePlay.mainPool, ctx.event.games[2].name)
        await layerOpen(tab, 'the game dialog of the pool')
        await until(tab, shows(COPY.notes.add), 'the add button of the Game notes')
      }),
      // The Event notes' popover of the first game (#858), then „Bearbeiten“: the dialog of the finished Event in edit mode, the Event notes locked (#857).
      stop('notizen-bearbeiten', async (tab, ctx) => {
        await pressUnder(tab, COPY.howWePlay.mainPool, notesButtonOf(ctx.event.games[0].name), { byLabel: true })
        await until(tab, shows(EVENT_NOTES_TEXT), 'the Event notes of the popover')
        await editFromPopover(tab)
      }),
    ],
  }),
]

// The create stepper's pool step: the new-game sheet with the name of a library game, the hint with „Das nehmen“ (#860); then the name of an Archived one, with
// its archived hint and no „Das nehmen“ (#689). The stepper is walked from its first step as a Host walks it. Nothing is saved.
const stepperStates = [
  {
    name: 'neu-spiele-doppelt',
    group: 'stepper',
    account: 'host',
    async open(ctx) {
      await libraryGames(ctx)
      await open(ctx.tab, '/neu', ctx.width, ctx.height, 'form h1', { appearance: ctx.appearance })
      await typeInto(ctx.tab, 'form input', 'R011 Dunkel-Check Neu')
      // Five „Weiter“ of the stepper: the format, the games, the points, the mode, and the pool step.
      for (let i = 0; i < 5; i++) await next(ctx.tab)
      await until(ctx.tab, `!!document.querySelector('button[aria-label*="in den Pool"]')`, 'the library in the pool step', 30_000)
      await noAutoLoad(ctx.tab)
      if (!await clickText(ctx.tab, 'button', COPY.stepper.pool.create)) throw new Error('no „Neues Spiel“ button')
      await until(ctx.tab, `!!document.querySelector('[role=dialog]')`, 'the new-game sheet')
      await typeName(ctx.tab, `${GAME_PREFIX}Spiel Notizen`, COPY.gameEdit.duplicate)
    },
    stops: [
      step('archiviert', tab => typeName(tab, `${GAME_PREFIX}Spiel Archiv`, COPY.gameEdit.duplicateArchived)),
    ],
  },
]

export const STATES = [...libraryStates, ...eventStates, ...stepperStates]

/** `Spiel Notizen` is unarchived also when the state that archives it never got to its `after` (the run stopped). */
export async function cleanup({ tabs }) {
  await unarchive(tabs.host)
}
