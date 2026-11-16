// The wording walk's states of the Event page (#630, spec #620): the menus, sheets, dialogs and toasts the dark check never opens, so more texts get a picture. Only the
// walk loads this file (`states.mjs` with `extra: 'walk-states-'`); the dark check never does. `dark.mjs` documents the State shape, `dark-states-event.mjs` the pair of
// readers (`<name>-host` at 1440, `<name>-spieler` at 390) and the Events it makes. Nothing is confirmed that changes an Event, but E9 and E10, which reset a Team word and
// delete an Event of their own (`fresh: true`), so the shared Events of the walk stay as the dark states built them.
// Texts that need a real failure (`error.*` of a server answer, `connection.*`) stay unscripted, and the Share image's canvas keys too (O2 of #629).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sleep } from './chrome.mjs'
import { api, clickText, createEvent, eventView, finishedEvent, inDays, joinEvent, ok, open } from './kit.mjs'
import {
  admin, BUILDS, dock, host, keepToasts, layerOpen, member, moreEntry, pair, pool, press, running, signIn, stop, toastShown, until,
} from './dark-states-event.mjs'
import { holdPress, keepToastsFromLoad, releaseToasts, typeDateTime, UNTAG } from './walk-kit.mjs'

const COPY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/locales/de.json'), 'utf8'))

/** The text before its first placeholder: a part of a message with `{n}` in it that the page shows as it is. */
const before = text => text.split('{')[0]

/** A dialog or sheet whose text holds `text` is open (the menu that was open a moment ago has gone). */
const dialogWith = (tab, text, what) => until(tab, `[...document.querySelectorAll('[role=dialog]')].some(el => el.textContent.replace(${UNTAG}, '').includes(${JSON.stringify(text)}))`, what).then(() => sleep(400))

/** The Session menu is a popover with `role=menu` at 1440 and a sheet with `role=dialog` at 390. */
const menuOpen = (tab, what) => until(tab, `!!document.querySelector('[role=menu], [role=dialog]')`, what).then(() => sleep(300))

/** The Sessions card's „Mehr: …“ trigger of its first row. The dock's „Mehr“ has no colon. */
const sessionMenu = async (tab) => {
  await press(tab, 'button[aria-haspopup=menu]', before(COPY.event.sessions.more))
  await menuOpen(tab, 'the Session menu')
}

const dockMenu = async (tab) => {
  await press(tab, '[role=toolbar] button[aria-haspopup=menu]', COPY.dock.more)
  await until(tab, `!!document.querySelector('[role=menu]')`, 'the Mehr menu')
  await sleep(300)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The data: Events the shared builds of the dark file do not give

/** The board of `teamwahl-wort` without the word: the Host in team 1, the Member in team 2, the Admin on the Stands. Two equal Parties, so „Session starten“ asks (E2). */
BUILDS['teamwahl-gleich'] = async (ctx) => {
  await signIn(ctx, 'member')
  await signIn(ctx, 'admin')
  const given = await pool(ctx, 3)
  const { slug } = await createEvent(host(ctx), { name: `${ctx.data.prefix}Teamwahl gleich`, settings: { teamCount: 2, teamSize: 3 }, pool: given.map(game => game.id) })
  await joinEvent(member(ctx), slug, host(ctx))
  await joinEvent(admin(ctx), slug, host(ctx))
  for (const [tab, team] of [[host(ctx), 1], [member(ctx), 2]]) await ok(api(tab, 'POST', `/api/e/${slug}/move`, { userId: (await eventView(tab, slug)).viewerId, to: { zone: 'team', team } }), 'move')
  return { slug }
}

// The finished Event of E3 is its own: the dark `fertig-offen` ends with a purge of the Events of the pass, which would take its memoised Event away from a state read later.
BUILDS['fertig-menue'] = async (ctx) => {
  await signIn(ctx, 'member')
  return finishedEvent([host(ctx), member(ctx)], { name: `${ctx.data.prefix}Fertig Menue`, outcome: 'winner', pool: await pool(ctx, 3) })
}

/** A running Event with the Countdown set to two minutes (ready), or started and paused on top of it (paused). */
const countdownBuild = paused => async (ctx) => {
  const event = await running(ctx, paused ? 'Countdown pausiert' : 'Countdown bereit', { n: 3 })
  await ok(api(host(ctx), 'PUT', `/api/e/${event.slug}/countdown`, { seconds: 120 }), 'set the Countdown')
  if (paused) {
    await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/countdown/start`), 'start the Countdown')
    await ok(api(host(ctx), 'POST', `/api/e/${event.slug}/countdown/pause`), 'pause the Countdown')
  }
  return event
}
BUILDS['countdown-bereit'] = countdownBuild(false)
BUILDS['countdown-pausiert'] = countdownBuild(true)

/** An Event of the Host that the Admin is not in: the Admin joins it by the Invite link (E8). */
BUILDS.einladung = async (ctx) => {
  const given = await pool(ctx, 3)
  const { slug } = await createEvent(host(ctx), { name: `${ctx.data.prefix}Einladung`, settings: { teamCount: 2, teamSize: 3 }, pool: given.map(game => game.id) })
  const { inviteUrl } = await eventView(host(ctx), slug)
  return { slug, invitePath: new URL(inviteUrl, 'http://x').pathname }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// States

let joinedScript = null

export const STATES = [
  // E1: the Sessions card's menu of a dated Event (a popover at 1440, a sheet at 390), the calendar sheet, the dialogs the menu and the card open, and the dock's menu.
  ...pair({
    name: 'datiert-menues',
    group: 'event-poll',
    key: 'datiert',
    hostStops: [
      stop('session-mehr', sessionMenu),
      stop('kalender', async (tab) => {
        await press(tab, '[role=menuitem]', COPY.event.sessions.calendarSingle)
        await dialogWith(tab, COPY.mvp.calendar.title, 'the calendar sheet')
      }, { keep: true }),
      // The dialog has no error line of its own (the field takes no `error`), so the stop opens it and types a date; what it shows is read as it is.
      stop('verschieben', async (tab) => {
        await sessionMenu(tab)
        await press(tab, '[role=menuitem]', COPY.poll.reschedule)
        await dialogWith(tab, COPY.mvp.reschedule.title, 'the reschedule dialog')
        await typeDateTime(tab, '[role=dialog] [role=group]', '01012020', '1900')
        await sleep(300)
      }),
      stop('session-hinzufuegen', async (tab) => {
        await press(tab, 'button', COPY.mvp.sessions.add)
        await dialogWith(tab, COPY.mvp.sessions.addText, 'the Session sheet')
        await typeDateTime(tab, '[role=dialog] [role=group]', '01012020', '1900')
        await sleep(300)
      }),
      stop('dock-mehr', dockMenu),
    ],
    spielerStops: [
      stop('session-mehr', sessionMenu),
      stop('kalender', async (tab) => {
        await press(tab, '[role=menuitem]', COPY.event.sessions.calendarSingle)
        await dialogWith(tab, COPY.mvp.calendar.title, 'the calendar sheet')
      }, { keep: true }),
    ],
  }),

  // E2: Team choice with two equal Parties: „Session starten“ asks first. Never confirmed.
  ...pair({
    name: 'teamwahl-start',
    group: 'event-board',
    key: 'teamwahl-gleich',
    only: 'host',
    hostStops: [
      stop('start-dialog', async (tab) => {
        await dock(tab, COPY.dock.start)
        await dialogWith(tab, COPY.dock.startDialog.title, 'the start question')
      }),
    ],
  }),

  // E3: the dock's menu of a finished Event.
  ...pair({
    name: 'fertig-menue',
    group: 'event-finished',
    only: 'host',
    hostStops: [stop('mehr', dockMenu)],
  }),

  // E4: the history of a played Round and its correction sheet. Never saved.
  ...pair({
    name: 'tabelle-korrigieren',
    group: 'event-live',
    key: 'tabelle',
    only: 'host',
    hostStops: [
      stop('panel-tabelle', tab => press(tab, '[role=tab]', COPY.nav.tabs.table)),
      stop('korrigieren', async (tab) => {
        await press(tab, 'button', COPY.history.correct.split('{n}')[1].trim())
        await dialogWith(tab, COPY.result.cancelCorrection, 'the correction sheet')
      }),
    ],
  }),

  // E5: the Slots sheet with its errors. Never confirmed.
  ...pair({
    name: 'termine-fehler',
    group: 'event-poll',
    key: 'poll',
    only: 'host',
    hostStops: [
      stop('termine', async (tab) => {
        await moreEntry(tab, COPY.mvp.slots.title)
        await layerOpen(tab, 'the Slots sheet')
      }),
      stop('termin-vergangen', async (tab) => {
        await typeDateTime(tab, `[role=dialog] [role=group][aria-label*=${JSON.stringify(COPY.mvp.slots.newLabel)}]`, '01012020', '1900')
        await until(tab, `!!document.querySelector('[role=dialog] [aria-invalid="true"]')`, 'the past-date error')
      }, { keep: true }),
      stop('termin-doppelt', async (tab) => {
        // The poll's first Slot: ten days ahead at 19:00 (`BUILDS.poll`).
        await typeDateTime(tab, `[role=dialog] [role=group][aria-label*=${JSON.stringify(COPY.mvp.slots.newLabel)}]`, inDays(10))
        await until(tab, `!!document.querySelector('[role=dialog] [aria-invalid="true"]')`, 'the duplicate-date error')
      }, { keep: true }),
      stop('termin-aendern', async (tab) => {
        if (!await clickText(tab, '[role=dialog] button', COPY.mvp.slots.change)) throw new Error('no „Ändern“ in the Slots sheet')
        await until(tab, `!!document.querySelector('[role=dialog] form [role=group]')`, 'the change field')
        await typeDateTime(tab, '[role=dialog] form [role=group]', '01012020', '1900')
        await until(tab, `!!document.querySelector('[role=dialog] [aria-invalid="true"]')`, 'the past-date error of the row')
      }, { keep: true }),
    ],
  }),

  // E6: a Member's note on a Slot (B3's `NoteEditor.vue:118`, the mono counter).
  ...pair({
    name: 'poll-notiz',
    group: 'event-poll',
    key: 'poll',
    only: 'spieler',
    spielerStops: [
      stop('anmerkung', async (tab) => {
        if (!await clickText(tab, '[data-note-trigger]')) throw new Error('no note trigger')
        await until(tab, `!!document.querySelector('textarea')`, 'the note field')
        await sleep(300)
      }),
    ],
  }),

  // E7: the Countdown set and ready, and paused, as the Host and as a Player; the Host's sheet.
  ...['bereit', 'pausiert'].flatMap(kind => pair({
    name: `countdown-${kind}`,
    group: 'event-live',
    hostStops: [
      stop('sheet', async (tab) => {
        await moreEntry(tab, COPY.countdown.title)
        await layerOpen(tab, 'the Countdown sheet')
      }),
    ],
  })),

  // E8: the Admin joins an Event by its Invite link; the toast of the join stands (a success toast leaves after 4 s, so the script that keeps it runs from the load).
  {
    name: 'einladung-beitritt',
    group: 'event-board',
    account: 'admin',
    async open(ctx) {
      const { tab } = ctx
      ctx.event = await BUILDS.einladung(ctx)
      joinedScript = await keepToastsFromLoad(tab)
      await open(tab, ctx.event.invitePath, ctx.width, ctx.height, 'h1', { appearance: ctx.appearance })
      await until(tab, `location.pathname === ${JSON.stringify(`/e/${ctx.event.slug}`)}`, 'the Event page after the join')
      await toastShown(tab, COPY.invite.joinedToast.slice(0, 15))
    },
    async after(ctx) {
      if (joinedScript !== null) await releaseToasts(ctx.tab, joinedScript)
      joinedScript = null
    },
  },

  // E9: the Host's Team word reset: the question, then the answer with its toast. `fresh`: the word is gone afterwards.
  ...pair({
    name: 'teamwahl-wort-zuruecksetzen',
    group: 'event-board',
    key: 'teamwahl-wort',
    fresh: true,
    only: 'host',
    hostStops: [
      stop('frage', async (tab) => {
        await press(tab, 'button', COPY.team.word.reset)
        await layerOpen(tab, 'the reset question')
      }),
      stop('erledigt', async (tab) => {
        await keepToasts(tab)
        await press(tab, '[role=dialog] button', COPY.team.word.resetConfirm)
        await toastShown(tab, before(COPY.team.word.resetDone).slice(0, 15))
      }, { keep: true }),
    ],
  }),

  // E10: the Host deletes an Event of its own (held for a second), and lands on Home with the toast. `fresh`: the Event is gone afterwards.
  ...pair({
    name: 'event-loeschen',
    group: 'event-board',
    key: 'teamwahl',
    fresh: true,
    only: 'host',
    hostStops: [
      stop('geloescht', async (tab) => {
        await keepToasts(tab)
        await moreEntry(tab, COPY.dock.delete)
        await layerOpen(tab, 'the delete sheet')
        await holdPress(tab, '[role=dialog] button', COPY.eventDelete.hold)
        await until(tab, `location.pathname === '/'`, 'Home after the delete')
        await toastShown(tab, COPY.eventDelete.done)
      }),
    ],
  }),
]
