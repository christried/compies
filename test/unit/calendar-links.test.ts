import { describe, expect, it } from 'vitest'
import { calendarLinks } from '../../shared/calendar-links'

// „Google Kalender“ and „Outlook“ in the calendar sheet (#81): one address each that opens a new, pre-filled
// event, with the calendar file's title and description, UTC times and the end 7 h after the start.

const entry = {
  title: 'Freitags-Zocken (Compies)',
  description: 'Zum Event: https://compies.example/e/freitags-zocken-k7q2',
  startsAt: new Date('2026-10-24T18:00:00.000Z'),
}

describe('calendarLinks', () => {
  it('opens Google Calendar’s new-event template with the title, the description and UTC start and end, 7 h apart', () => {
    const google = new URL(calendarLinks(entry).google)

    expect(`${google.origin}${google.pathname}`).toBe('https://calendar.google.com/calendar/render')
    expect(google.searchParams.get('action')).toBe('TEMPLATE')
    expect(google.searchParams.get('text')).toBe('Freitags-Zocken (Compies)')
    expect(google.searchParams.get('details')).toBe('Zum Event: https://compies.example/e/freitags-zocken-k7q2')
    expect(google.searchParams.get('dates')).toBe('20261024T180000Z/20261025T010000Z')
  })

  it('opens Outlook.com’s compose-event deep link with the subject, the body and UTC start and end, 7 h apart', () => {
    const outlook = new URL(calendarLinks(entry).outlook)

    expect(`${outlook.origin}${outlook.pathname}`).toBe('https://outlook.live.com/calendar/0/action/compose')
    expect(outlook.searchParams.get('rru')).toBe('addevent')
    expect(outlook.searchParams.get('subject')).toBe('Freitags-Zocken (Compies)')
    expect(outlook.searchParams.get('body')).toBe('Zum Event: https://compies.example/e/freitags-zocken-k7q2')
    expect(outlook.searchParams.get('startdt')).toBe('2026-10-24T18:00:00Z')
    expect(outlook.searchParams.get('enddt')).toBe('2026-10-25T01:00:00Z')
  })

  it('carries an Event name with &, #, ?, +, umlauts and emoji as typed, percent-encoded in plain ASCII', () => {
    const title = 'Zocken & Chill #3? 1+1 Spieleabend für Bären 🎲 (Compies)'
    const links = calendarLinks({ ...entry, title })

    for (const [link, param] of [[links.google, 'text'], [links.outlook, 'subject']] as const) {
      const address = new URL(link)
      expect(address.searchParams.get(param)).toBe(title)
      expect(address.searchParams.get('details') ?? address.searchParams.get('body')).toBe(entry.description)
      // Nothing of the name leaks into the address as a separator, a fragment or a space.
      expect(address.hash).toBe('')
      expect(link.split('?')).toHaveLength(2)
      expect(link).toMatch(/^[\x21-\x7E]+$/)
      expect(link).toContain('Zocken%20%26%20Chill%20%233%3F%201%2B1%20Spieleabend%20f%C3%BCr%20B%C3%A4ren%20%F0%9F%8E%B2')
    }
  })

  it('ends 7 h after the start in UTC, across the night the clocks go back in Berlin', () => {
    const late = calendarLinks({ ...entry, startsAt: new Date('2026-10-24T22:30:00.000Z') })

    expect(new URL(late.google).searchParams.get('dates')).toBe('20261024T223000Z/20261025T053000Z')
    expect(new URL(late.outlook).searchParams.get('enddt')).toBe('2026-10-25T05:30:00Z')
  })
})
