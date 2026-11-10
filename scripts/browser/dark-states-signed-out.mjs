// The signed-out states of the Dunkel-Check (#407): the pages a visitor sees. `dark.mjs` documents the State shape every
// `dark-states-*.mjs` file exports. All of them open through `openSignedOut`, the way a User gets there: signed in with
// the Appearance, then signed out, the cookie left (#398: „Sign-out does not touch the cookie.“).
import { openSignedOut } from './kit.mjs'

const group = 'signed-out'

/** A state that opens `address(ctx)` signed out and waits for `waitFor`. */
function page(name, address, { waitFor = 'h1', ...rest } = {}) {
  return {
    name,
    group,
    account: 'member',
    signedOut: true,
    async open(ctx) {
      ctx.signOut(await openSignedOut(ctx.tab, address(ctx), ctx.width, ctx.height, waitFor, { appearance: ctx.appearance, plain: rest.plain }))
    },
    ...rest,
  }
}

export const STATES = [
  page('anmelden', () => '/anmelden'),
  // The notice names the Event and the Dev Host: the page of a visitor who came by an Invite link.
  page('anmelden-einladung', ctx => `/anmelden?redirect=${encodeURIComponent(ctx.data.invitePath)}`),
  page('anmelden-fehler', () => '/anmelden?error=access_denied&provider=discord'),
  page('impressum', () => '/impressum', { static: true }),
  page('datenschutz', () => '/datenschutz', { static: true }),
  page('neuigkeiten', () => '/neuigkeiten', { static: true }),
  // The invite preview.
  page('einladung', ctx => ctx.data.invitePath),
  // An Invite link nobody issued draws FullScreenState (app/error.vue draws the same component and has no address a browser can call).
  page('fehlerseite', () => '/e/r011-dunkel-check-000000000000'),
  // The offline page follows the device only (#398): no data-theme, no Nuxt.
  page('offline', () => '/offline.html', { waitFor: 'body', plain: true, static: true, appearances: ['system'] }),
]
