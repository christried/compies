// The wording walk's states of the forms (#630, spec #620): the forms with errors, a form saved with its toast, the create stepper at its limits and with its errors,
// and the changelog's copy toasts. The dark check's lists never open these, so the texts that only a wrong input shows get a picture here. Only the walk loads this
// file (`states.mjs` with `extra: 'walk-states-'`); the dark check never does. `dark.mjs` documents the State shape.
// Nothing is sent but three things the states say: F3 renames the Dev Host and puts the name back, F5 and F7 save unchanged data. Texts that need a real failure
// (`error.*` of a server answer, `profile.saveFailed`, `share.error`, `connection.*`) stay unscripted, and the Share image's canvas keys too (O2 of #629).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sleep } from './chrome.mjs'
import { api, BASE, clickText, inDays, open, openSignedOut, stepperNext } from './kit.mjs'
import { closeSheet, next, noAutoLoad, page, step, until } from './dark-states-app.mjs'
import { clipboard, keepToasts, stop, toastShown } from './dark-states-event.mjs'
import { fieldByLabel, setField, stepBy, toLimit, typeDateTime, UNTAG } from './walk-kit.mjs'

const COPY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/de.json'), 'utf8'))

const invalid = `!!document.querySelector('[aria-invalid="true"]')`
const exactly = text => `const same = el => el.textContent.replace(${UNTAG}, '').trim() === ${JSON.stringify(text)}`

/** The page expression for the radio whose text is `text` (a card of a RadioCardGroup, a segment of a SegmentedControl). */
const radioClicked = (tab, text) => tab.evaluate(`(() => { ${exactly(text)}; const el = [...document.querySelectorAll('[role=radio]')].find(e => e.getBoundingClientRect().width > 0 && [...e.querySelectorAll('*'), e].some(same)); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.click(); return true })()`)

/** One click on a radio, and a throw when there is none. */
async function pickRadio(tab, text) {
  if (!await radioClicked(tab, text)) throw new Error(`no radio „${text}“ on the page`)
  await sleep(300)
}

/** The Dev Host's Display name before F3 renamed it, so `after` and `cleanup` can put it back; null while nothing was changed. */
let renamed = null

/** Puts the Dev Host's name back (idempotent). */
async function restoreName(tab) {
  if (renamed === null) return
  const answer = await api(tab, 'POST', '/api/profile/setup', { displayName: renamed })
  if (answer.status !== 200) throw new Error(`the Display name was not restored: ${answer.status}`)
  renamed = null
}

const displayName = fieldByLabel(COPY.profile.displayName)
const GAME = {
  name: fieldByLabel(COPY.gameEdit.name),
  youtube: fieldByLabel(COPY.gameEdit.youtube),
  start: fieldByLabel(COPY.gameEdit.start),
  length: fieldByLabel(COPY.gameEdit.length),
  playersFrom: fieldByLabel(COPY.gameEdit.playersFrom),
  notes: fieldByLabel(COPY.gameEdit.notes),
  tags: fieldByLabel(COPY.gameEdit.tags),
  priceAmount: fieldByLabel(COPY.gameEdit.priceAmount),
}

/** The Info button of a step on a phone (the sheet exists below md; from md up the info is a column of the page). */
async function openInfo(tab) {
  if (!await tab.evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').replace(${UNTAG}, '') === 'Info' && b.getBoundingClientRect().width > 0); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.click(); return true })()`)) throw new Error('no Info button on the step')
  await until(tab, `!!document.querySelector('[role=dialog]')`, 'the Info sheet')
}

/**
 * A save navigates on after its toast (the game's page, the Event page): the reading waits until the new page is there and nothing on it is loading, so no text node it
 * measures is gone on the way (measured: the full walk's F7 read the Event page while it was still replacing the form, #630).
 */
async function landed(tab, path) {
  await until(tab, `location.pathname === ${JSON.stringify(path)} && !!document.querySelector('h1') && !document.querySelector('[aria-busy="true"], .animate-pulse')`, 'the page after the save', 30_000)
  await sleep(500)
}

/** The create stepper's library step: waits for the first cards and takes the auto-load sentinel away (rule 6 of the brief). */
async function libraryLoaded(tab) {
  await until(tab, `!!document.querySelector('button[aria-label*="in den Pool"]')`, 'the library in the pool step', 30_000)
  await noAutoLoad(tab)
}

export const STATES = [
  // F1: the setup page with the name field emptied (the same page as `einrichten`); `after` signs the Dev Admin in plainly, which puts the name back.
  {
    name: 'einrichten-fehler',
    group: 'hub',
    account: 'admin',
    async open(ctx) {
      await open(ctx.tab, '/', ctx.width, ctx.height, 'form input', { appearance: ctx.appearance, setup: true })
      await setField(ctx.tab, displayName, '')
      await until(ctx.tab, invalid, 'the name error')
    },
    async after() {
      await fetch(`${BASE}/api/dev/sign-in?as=admin`, { redirect: 'manual' })
    },
  },
  // F2: Profil with the name field emptied; nothing is sent.
  page('profil-fehler', 'hub', 'host', () => '/profil', {
    async after(ctx) {
      await setField(ctx.tab, displayName, '')
      await until(ctx.tab, invalid, 'the name error')
    },
  }),
  // F3: the one state that writes a dev User's data: the name gets ` W`, is saved, and `after` (or the file's `cleanup`) puts it back.
  {
    ...page('profil-gespeichert', 'hub', 'host', () => '/profil', {
      async after(ctx) {
        const { tab } = ctx
        renamed = await tab.evaluate(`${displayName}.value`)
        await keepToasts(tab)
        await setField(tab, displayName, `${renamed} W`)
        await until(tab, `(() => { const el = ${displayName}; return !!el && el.value.endsWith(' W') })()`, 'the new name in the field')
        const form = `${displayName}.closest('form')`
        if (!await tab.evaluate(`(() => { const form = ${form}; const button = [...form.querySelectorAll('button[type=submit]')].find(b => b.textContent.replace(${UNTAG}, '').includes(${JSON.stringify(COPY.common.save)})); if (!button) return false; button.click(); return true })()`)) throw new Error('no save button on the Profil form')
        await toastShown(tab, COPY.profile.saved)
      },
    }),
    widths: [1440],
    async after(ctx) {
      await restoreName(ctx.tab)
    },
  },
  // F4: the game form with wrong input, field by field. Never saved: the sending button refuses.
  page('bibliothek-neu-eingaben', 'library', 'host', () => '/bibliothek/neu', {
    waitFor: 'form',
    stops: [
      step('link-fehler', async (tab) => {
        await setField(tab, GAME.youtube, 'kein link')
        await until(tab, invalid, 'the link error')
      }),
      // A real public video: the preview's labels (mono) render without the YouTube script, so the times are there at once.
      step('clip', async (tab) => {
        await setField(tab, GAME.youtube, 'https://youtu.be/dQw4w9WgXcQ')
        await until(tab, `!!document.querySelector('[aria-label*=${JSON.stringify(COPY.gameEdit.barLabel)}]') && !document.querySelector('[aria-invalid="true"]')`, 'the clip preview')
        await setField(tab, GAME.start, 'x')
        await setField(tab, GAME.length, '5')
        await until(tab, invalid, 'the clip errors')
      }),
      step('zahlen', async (tab) => {
        await setField(tab, GAME.playersFrom, 'x')
        await setField(tab, GAME.notes, 'x'.repeat(2001))
        await setField(tab, GAME.tags, 'x'.repeat(21))
        await setField(tab, GAME.priceAmount, 'abc')
        await sleep(300)
      }),
      step('preis-quelle', async (tab) => {
        await setField(tab, GAME.priceAmount, '5')
        if (!await clickText(tab, 'button[type=submit]', COPY.library.create)) throw new Error('no submit button on the game form')
        await sleep(300)
      }),
    ],
  }),
  // F5: the unchanged game saved, and the toast that stays.
  page('bibliothek-bearbeiten-gespeichert', 'library', 'host', ctx => `/bibliothek/${ctx.data.game.id}/bearbeiten`, {
    waitFor: 'form',
    widths: [1440],
    async after(ctx) {
      await keepToasts(ctx.tab)
      if (!await clickText(ctx.tab, 'button[type=submit]', COPY.gameEdit.saveChanges)) throw new Error('no save button on the edit form')
      await toastShown(ctx.tab, COPY.library.saveDone)
      await landed(ctx.tab, `/bibliothek/${ctx.data.game.id}`)
    },
  }),

  // F6: the create stepper at its limits and with its errors. Every stop goes on from the page the last one left.
  page('neu-fehler', 'stepper', 'host', () => '/neu', {
    waitFor: 'form h1',
    stops: [
      step('name-zu-lang', async (tab) => {
        await setField(tab, `document.querySelector('form input')`, 'x'.repeat(61))
        await until(tab, invalid, 'the name error')
      }),
      step('format-teams-max', async (tab) => {
        await setField(tab, `document.querySelector('form input')`, 'W Fehler')
        await next(tab)
        await toLimit(tab, COPY.stepper.format.teamCount, 'mehr')
      }),
      step('format-team-min', tab => toLimit(tab, COPY.stepper.format.teamSize, 'weniger')),
      step('format-team-max', async (tab) => {
        await toLimit(tab, COPY.stepper.format.teamCount, 'weniger')
        await toLimit(tab, COPY.stepper.format.teamSize, 'mehr')
      }),
      step('spiele-min', async (tab) => {
        await next(tab)
        await toLimit(tab, COPY.stepper.games.label, 'weniger')
      }),
      step('spiele-max', tab => toLimit(tab, COPY.stepper.games.label, 'mehr')),
      // The custom table starts from the two rows on screen; Platz 2 two up is more than Platz 1 has.
      step('punkte-aufsteigend', async (tab) => {
        await next(tab)
        await pickRadio(tab, COPY.setup.points.custom.name)
        await stepBy(tab, COPY.stepper.points.stepper.replace('{n}', '2'), 'mehr', 2)
        await until(tab, `!!document.querySelector('[role=alert]')`, 'the rising-table error')
      }),
      // A rising table blocks Weiter: Linear again puts the rows right before the step goes on.
      step('modus-rad', async (tab) => {
        await pickRadio(tab, COPY.setup.points.linear.name)
        await next(tab)
        await pickRadio(tab, COPY.setup.mode.wheel.name)
      }),
      step('vetos-max', tab => toLimit(tab, COPY.setup.mode.vetoes, 'mehr')),
      step('vetos-min', tab => toLimit(tab, COPY.setup.mode.vetoes, 'weniger')),
      step('rad-verdeckt', async (tab) => {
        if (!await tab.evaluate(`(() => { const el = [...document.querySelectorAll('[role=switch]')].find(s => s.getBoundingClientRect().width > 0); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.click(); return true })()`)) throw new Error('no switch on the mode step')
        await sleep(300)
      }),
      step('modus-info', async (tab) => {
        await openInfo(tab)
      }, { widths: [390] }),
      // The pool step with nothing in it: the empty line and the hint of the wheel.
      step('pool-leer', async (tab) => {
        await closeSheet(tab)
        await next(tab)
        await libraryLoaded(tab)
      }),
      // With no Vetos the pool's hint is the Host pick's; one step back, one Veto, and it is the wheel's.
      step('pool-leer-rad', async (tab) => {
        if (!await clickText(tab, '[data-testid=stepper-footer] button', COPY.stepper.back)) throw new Error('no „Zurück“ in the stepper')
        await until(tab, `!!document.querySelector('[role=switch]')`, 'the mode step')
        await stepBy(tab, COPY.setup.mode.vetoes, 'mehr', 1)
        await next(tab)
        await libraryLoaded(tab)
      }),
      step('sessions-vergangenheit', async (tab) => {
        await next(tab)
        await typeDateTime(tab, '[role=group]', '01012020', '1900')
        await until(tab, invalid, 'the past-date error')
      }),
      step('sessions-zu-wenig', async (tab) => {
        await typeDateTime(tab, '[role=group]', inDays(10))
        if (!await clickText(tab, 'button', COPY.mvp.create.sessionsMore)) throw new Error('no „more Sessions“ button')
        await sleep(300)
      }),
      step('sessions-direkt', async (tab) => {
        await pickRadio(tab, COPY.mvp.create.modeDirect)
      }),
      step('sessions-direkt-doppelt', async (tab) => {
        await typeDateTime(tab, '[role=group]', inDays(12), undefined, { nth: 0 })
        await typeDateTime(tab, '[role=group]', inDays(12), undefined, { nth: 1 })
        await until(tab, invalid, 'the duplicate-date error')
      }),
    ],
  }),
  // F7: the settings of the walk's Event saved unchanged; the toast stays.
  page('einstellungen-gespeichert', 'stepper', 'host', ctx => `/e/${ctx.data.slug}/einstellungen`, {
    waitFor: 'form h1',
    widths: [1440],
    async after(ctx) {
      const { tab } = ctx
      for (let i = 0; i < 4; i++) await next(tab)
      await until(tab, `!!document.querySelector('ul[aria-label*=${JSON.stringify(COPY.library.title)}] li')`, 'the library in the pool step', 30_000)
      await noAutoLoad(tab)
      await keepToasts(tab)
      await stepperNext(tab)
      await toastShown(tab, COPY.eventSettings.saved)
      await landed(tab, `/e/${ctx.data.slug}`)
    },
  }),

  // F8: the changelog's copy button, with the clipboard answering yes, then no.
  {
    name: 'neuigkeiten-kopieren',
    group: 'signed-out',
    account: 'member',
    async open(ctx) {
      ctx.signOut(await openSignedOut(ctx.tab, '/neuigkeiten', ctx.width, ctx.height, 'h1', { appearance: ctx.appearance }))
    },
    stops: [
      stop('kopiert', async (tab) => {
        await keepToasts(tab)
        await clipboard(tab, 'ok')
        if (!await clickText(tab, 'button', COPY.news.copy.split('{v}')[0])) throw new Error('no copy button on Neuigkeiten')
        await toastShown(tab, COPY.news.copied)
      }, { viewport: true }),
      stop('kopieren-fehlt', async (tab) => {
        await clipboard(tab, 'denied')
        if (!await clickText(tab, 'button', COPY.news.copy.split('{v}')[0])) throw new Error('no copy button on Neuigkeiten')
        await toastShown(tab, COPY.news.copyFailed.split('{url}')[0])
      }, { viewport: true }),
    ],
  },
]

/** The Dev Host's name is put back also when F3's `after` never ran (the run stopped). */
export async function cleanup({ tabs }) {
  await restoreName(tabs.host)
}
