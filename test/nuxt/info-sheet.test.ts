import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import InfoSheet from '~/components/InfoSheet.vue'

// InfoSheet (02-components § InfoSheet): what a Format or Selection mode means, from the product brief §17.

describe('InfoSheet', () => {
  it('explains Teams with „So läuft’s“, „Gut für“ and „Achtung“ as headings', async () => {
    const page = await mountSuspended(InfoSheet, { props: { topic: 'teams' } })

    expect(page.findAll('h3').map(heading => heading.text())).toEqual(['So läuft’s', 'Gut für', 'Achtung'])
    expect(page.text()).toContain('Du legst fest, wie viele Teams es gibt (2 bis 8).')
    expect(page.text()).toContain('1v1 bis 6v6')
  })

  it('leaves out the sections a topic does not have', async () => {
    const page = await mountSuspended(InfoSheet, { props: { topic: 'tiebreaker' } })

    expect(page.findAll('h3').map(heading => heading.text())).toEqual(['So läuft’s'])
  })

  it('adds the hidden wheel option for the Lucky Wheel', async () => {
    const page = await mountSuspended(InfoSheet, { props: { topic: 'wheel' } })

    expect(page.findAll('h3').map(heading => heading.text())).toEqual(['So läuft’s', 'Option „Rad verdecken“', 'Gut für', 'Achtung'])
  })

  it('switches with the topic', async () => {
    const page = await mountSuspended(InfoSheet, { props: { topic: 'teams' } })

    await page.setProps({ topic: 'admin' })

    expect(page.text()).toContain('Du als Host bestimmst jedes Spiel selbst.')
    expect(page.text()).not.toContain('Du legst fest, wie viele Teams es gibt')
  })
})
