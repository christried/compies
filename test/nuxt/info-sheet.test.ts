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

  it('tells the Host that they see the hidden wheel’s games too, under the hidden wheel option (#145)', async () => {
    const page = await mountSuspended(InfoSheet, { props: { topic: 'wheel' } })

    const hidden = page.findAll('section').find(section => section.find('h3').text() === 'Option „Rad verdecken“')
    expect(hidden!.text()).toContain('Du als Host siehst die Spiele auf dem verdeckten Rad trotzdem, auch wenn du mitspielst.')
  })

  it('explains the Veto allowance in the words of the product brief (#145)', async () => {
    const page = await mountSuspended(InfoSheet, { props: { topic: 'wheel' } })

    expect(page.text()).toContain('Jede Partei hat gleich viele Vetos für das ganze Event, die Zahl legst du fest. Im Team darf jedes Mitglied sie einsetzen.')
    expect(page.text()).not.toContain('Jeder Spieler bringt 1 Veto mit')
  })

  it('switches with the topic', async () => {
    const page = await mountSuspended(InfoSheet, { props: { topic: 'teams' } })

    await page.setProps({ topic: 'admin' })

    expect(page.text()).toContain('Du als Host bestimmst jedes Spiel selbst.')
    expect(page.text()).not.toContain('Du legst fest, wie viele Teams es gibt')
  })
})
