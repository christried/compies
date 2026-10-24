import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SignInCard from '~/components/SignInCard.vue'
import SignInPage from '~/pages/anmelden.vue'
import { signInAs } from './auth'

const button = (card: VueWrapper, label: string) =>
  card.findAll('button').find(b => b.text().includes(label))!

describe('SignInCard', () => {
  it('Standard: offers Discord and Twitch, without an alert', async () => {
    const card = await mountSuspended(SignInCard)

    expect(card.get('h1').text()).toBe('Anmelden')
    expect(card.findAll('button').map(b => b.text())).toEqual(['Mit Discord anmelden', 'Mit Twitch anmelden'])
    expect(card.find('[role="alert"]').exists()).toBe(false)
    expect(card.text()).toContain('Einfach nur mit dem Konto, mit dem du eh schon zockst, und das war’s.')
    expect(card.text()).toContain('Die Konten lassen sich später im Profil verknüpfen.')
  })

  it('Über Einladung: names the Host and the Event', async () => {
    const card = await mountSuspended(SignInCard, {
      props: { invited: true, invite: { eventName: 'Freitags-Zocken', host: { name: 'Sanne', image: null } } },
    })

    expect(card.get('h1').text()).toBe('Erst kurz anmelden')
    expect(card.text()).toContain('Sanne hat dich zu Freitags-Zocken eingeladen. Melde dich an, dann geht’s direkt auf die Bench.')
  })

  it('Weiterleitung: shows where it goes and blocks a second click', async () => {
    const card = await mountSuspended(SignInCard, { props: { busy: 'twitch' } })

    expect(button(card, 'Twitch').text()).toBe('Weiter zu Twitch …')
    expect(card.findAll('button').every(b => b.attributes('disabled') !== undefined)).toBe(true)
  })

  it('Abgebrochen: says which provider sent nothing, and keeps both buttons active', async () => {
    const card = await mountSuspended(SignInCard, { props: { failed: 'discord' } })

    expect(card.get('[role="alert"]').text()).toBe('Anmeldung abgebrochen. Discord hat uns nichts geschickt. Einfach nochmal versuchen.')
    expect(card.findAll('button').every(b => b.attributes('disabled') === undefined)).toBe(true)
  })

  it('Abgebrochen without a known provider: a general message', async () => {
    const card = await mountSuspended(SignInCard, { props: { failed: true } })

    expect(card.get('[role="alert"]').text()).toBe('Anmelden hat nicht geklappt. Versuch’s nochmal.')
  })

  it('asks to sign in with the chosen provider', async () => {
    const card = await mountSuspended(SignInCard)

    await button(card, 'Twitch').trigger('click')

    expect(card.emitted('signIn')).toEqual([['twitch']])
  })
})

describe('sign-in page', () => {
  beforeEach(() => signInAs(null))

  it('switches to the invite state when the target is an Invite link', async () => {
    const page = await mountSuspended(SignInPage, { route: '/anmelden?redirect=%2Fe%2Ffreitags-zocken-k7q2-Ab3dE6gH9jK1' })

    expect(page.get('h1').text()).toBe('Erst kurz anmelden')
  })

  it('shows the new hero title', async () => {
    const page = await mountSuspended(SignInPage, { route: '/anmelden' })

    expect(page.text()).toContain('Wer gewinnt diesmal?')
    expect(page.text()).not.toContain('Wer gewinnt heute Abend?')
  })

  it('shows the cancelled state when the provider sent the visitor back', async () => {
    const page = await mountSuspended(SignInPage, { route: '/anmelden?provider=twitch&error=access_denied' })

    expect(page.get('[role="alert"]').text()).toContain('Twitch hat uns nichts geschickt.')
  })

  it('starts the round trip back to the target, and back here on failure', async () => {
    const started = vi.fn()
    registerEndpoint('/api/auth/sign-in/social', {
      method: 'POST',
      handler: async (event) => {
        started(await readBody(event))
        throw new Error('stop before leaving the app')
      },
    })
    const page = await mountSuspended(SignInPage, { route: '/anmelden?redirect=%2Farchiv' })

    await button(page, 'Discord').trigger('click')
    await vi.waitFor(() => expect(started).toHaveBeenCalled())

    expect(started).toHaveBeenCalledWith({
      provider: 'discord',
      callbackURL: '/archiv',
      errorCallbackURL: '/anmelden?provider=discord&redirect=%2Farchiv',
      disableRedirect: true,
    })
    // The request failed, so the page offers a retry instead of hanging in Weiterleitung.
    await vi.waitFor(() => expect(page.find('[role="alert"]').exists()).toBe(true))
  })
})
