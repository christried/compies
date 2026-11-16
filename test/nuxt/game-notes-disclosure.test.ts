import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import GameNotesDisclosure from '~/components/GameNotesDisclosure.vue'
import { notesFromLines } from '~~/shared/notes-doc'
import { BLANK_NOTES } from './helpers/formatted-notes'

// The Game notes under a game in „So wird gespielt“ (#224): a disclosure that starts collapsed, announces whether it is
// open, and shows the notes formatted, a line per paragraph (#728).

const NOTES = 'Settings: 3 Runden\nWarmup: Lobby'
const lines = (root: { findAll: (selector: string) => { element: Element }[] }) => root.findAll('p').map(p => p.element.textContent)

describe('GameNotesDisclosure (#224)', () => {
  it('shows a Notizen button that starts collapsed, with no panel', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(NOTES.split('\n')) } })

    const button = disclosure.get('button')
    expect(button.text()).toBe('Notizen')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-expanded')).toBe('false')
    // No panel, so nothing to control: aria-controls would point at an id that is not in the page.
    expect(button.attributes('aria-controls')).toBeUndefined()
    expect(disclosure.find('p').exists()).toBe(false)
    expect(disclosure.text()).not.toContain('Warmup')
  })

  it('is plain underlined text like Bearbeiten, with no outline-memphis box around it', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(NOTES.split('\n')) } })

    expect(disclosure.get('button').classes()).not.toContain('outline-memphis')
    expect(disclosure.get('button').classes()).toContain('underline')
  })

  it('opens on a click, shows the notes with their line breaks, and names its panel', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(NOTES.split('\n')) } })
    const button = disclosure.get('button')

    await button.trigger('click')

    expect(button.attributes('aria-expanded')).toBe('true')
    const panelId = button.attributes('aria-controls')
    expect(panelId).toBeTruthy()
    const panel = disclosure.get(`[id="${panelId}"]`)
    expect(lines(panel)).toEqual(NOTES.split('\n'))
  })

  it.each(BLANK_NOTES)('renders no button for a document without a visible character (#728)', async (blank) => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: blank } })

    expect(disclosure.find('button').exists()).toBe(false)
  })

  it('closes again on the second click, and the panel goes', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(NOTES.split('\n')) } })
    const button = disclosure.get('button')

    await button.trigger('click')
    await button.trigger('click')

    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('aria-controls')).toBeUndefined()
    expect(disclosure.find('p').exists()).toBe(false)
  })

  it('starts open on the Round card, with its panel and the notes (#228)', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(NOTES.split('\n')), startOpen: true } })

    const button = disclosure.get('button')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(lines(disclosure.get(`[id="${button.attributes('aria-controls')}"]`))).toEqual(NOTES.split('\n'))

    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('false')
  })

  it('shows its slot instead of the notes, with its own label: the Vote notes of a Slot (#349) take no document', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { label: '2 Notizen' }, slots: { default: '<ul><li>Eine Stimme</li></ul>' } })

    expect(disclosure.get('button').text()).toContain('2 Notizen')
    await disclosure.get('button').trigger('click')

    expect(disclosure.get('li').text()).toBe('Eine Stimme')
    expect(disclosure.find('p').exists()).toBe(false)
  })

  it('shows markup in the notes as text, never as an element or a link', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(['<b>x</b> https://example.com']) } })

    await disclosure.get('button').trigger('click')

    expect(disclosure.find('b').exists()).toBe(false)
    expect(disclosure.find('a').exists()).toBe(false)
    expect(lines(disclosure)).toEqual(['<b>x</b> https://example.com'])
  })
})
