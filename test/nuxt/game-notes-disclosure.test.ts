import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import GameNotesDisclosure from '~/components/GameNotesDisclosure.vue'

// The Game notes under a game in „So wird gespielt“ (#224): a disclosure that starts collapsed, announces whether it is
// open, and shows the notes as plain text with their line breaks.

const NOTES = 'Settings: 3 Runden\nWarmup: Lobby'

describe('GameNotesDisclosure (#224)', () => {
  it('shows a Notizen button that starts collapsed, with no panel', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: NOTES } })

    const button = disclosure.get('button')
    expect(button.text()).toBe('Notizen')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(disclosure.find('p').exists()).toBe(false)
    expect(disclosure.text()).not.toContain('Warmup')
  })

  it('opens on a click, shows the notes with their line breaks, and names its panel', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: NOTES } })
    const button = disclosure.get('button')

    await button.trigger('click')

    expect(button.attributes('aria-expanded')).toBe('true')
    const panelId = button.attributes('aria-controls')
    expect(panelId).toBeTruthy()
    const panel = disclosure.get(`[id="${panelId}"]`)
    expect(panel.get('p').element.textContent).toBe(NOTES)
  })

  it('closes again on the second click, and the panel goes', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: NOTES } })
    const button = disclosure.get('button')

    await button.trigger('click')
    await button.trigger('click')

    expect(button.attributes('aria-expanded')).toBe('false')
    expect(disclosure.find('p').exists()).toBe(false)
  })

  it('shows markup in the notes as text, never as an element or a link', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: '<b>x</b> https://example.com' } })

    await disclosure.get('button').trigger('click')

    expect(disclosure.find('b').exists()).toBe(false)
    expect(disclosure.find('a').exists()).toBe(false)
    expect(disclosure.get('p').text()).toBe('<b>x</b> https://example.com')
  })
})
