import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import EventPage from '~/pages/e/[slug].vue'
import { kitty, signInAs } from './auth'
import { clickButton, dialog, serve, view, viewWithSessions } from './event-page'

// „In den Kalender“ (#81): one button for the Event opens the sheet where a Member picks their calendar. Google and
// Outlook get the calendar file's title and description, the Date in UTC and an end 7 h later.

/** The query of a link's address, decoded. */
function query(link: HTMLAnchorElement | undefined) {
  return Object.fromEntries(new URL(link!.href).searchParams)
}

function linksIn(root: ParentNode) {
  return [...root.querySelectorAll('a')]
}

describe('the calendar sheet', () => {
  beforeEach(() => {
    signInAs(kitty)
    document.body.innerHTML = ''
  })

  it('offers Google Kalender, Outlook and the calendar file for an Event with one dated Session', async () => {
    const { slug } = serve(s => view(s, [], {
      event: { phase: 'date_set', startsAt: '2026-10-30T19:00:00.000Z' },
      slots: [],
      bestSlotId: null,
    }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickButton(page.element, 'In den Kalender')

    const sheet = dialog()!
    expect(sheet.textContent).toContain('In welchen Kalender?')
    const links = linksIn(sheet)
    expect(links.map(link => link.textContent?.trim())).toEqual(['Google Kalender', 'Outlook', 'Apple & andere (.ics)'])
    const [google, outlook, file] = links
    const description = `Zum Event: ${window.location.origin}/e/${slug}`

    expect(google!.href.startsWith('https://calendar.google.com/calendar/render?')).toBe(true)
    expect(query(google)).toEqual({
      action: 'TEMPLATE',
      text: 'Freitags-Zocken (Compies)',
      dates: '20261030T190000Z/20261031T020000Z',
      details: description,
    })
    expect(outlook!.href.startsWith('https://outlook.live.com/calendar/0/action/compose?')).toBe(true)
    expect(query(outlook)).toEqual({
      rru: 'addevent',
      subject: 'Freitags-Zocken (Compies)',
      startdt: '2026-10-30T19:00:00Z',
      enddt: '2026-10-31T02:00:00Z',
      body: description,
    })
    for (const link of [google!, outlook!]) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
    }

    // The calendar file is today's download, unchanged.
    expect(file!.getAttribute('href')).toBe(`/api/e/${slug}/ics`)
    expect(file!.hasAttribute('download')).toBe(true)
    expect(file!.hasAttribute('target')).toBe(false)

    // Every button is 48 px tall (h-12), above the 44 px hit target.
    expect(links.every(link => link.classList.contains('h-12'))).toBe(true)
  })

  it('puts the calendar file with every Date first, then a row per dated Session with its own Google and Outlook', async () => {
    const { slug } = serve(s => viewWithSessions(s, [
      { number: 1, startsAt: '2026-10-30T19:00:00.000Z' },
      { number: 2, startsAt: '2026-10-31T19:00:00.000Z' },
      { number: null, startsAt: null },
    ], 1, { event: { phase: 'poll' } }))
    const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    await clickButton(page.element, 'In den Kalender')

    const sheet = dialog()!
    const links = linksIn(sheet)
    expect(links.map(link => link.textContent?.trim())).toEqual(['Apple & andere (.ics) – alle Termine', 'Google', 'Outlook', 'Google', 'Outlook'])
    expect(links[0]!.getAttribute('href')).toBe(`/api/e/${slug}/ics`)
    expect(links[0]!.hasAttribute('download')).toBe(true)

    // One row per dated Session, named by its shown number and day; the Session without a Date gets none.
    const rows = [...sheet.querySelectorAll<HTMLElement>('[role="group"]')]
    expect(rows.map(row => document.getElementById(row.getAttribute('aria-labelledby')!)?.textContent?.trim()))
      .toEqual(['Session 1 · Fr 30.10.', 'Session 2 · Sa 31.10.'])

    const [google, outlook] = linksIn(rows[1]!)
    const description = `Zum Event: ${window.location.origin}/e/${slug}`
    expect(query(google)).toMatchObject({
      text: 'Freitags-Zocken · Session 2 (Compies)',
      dates: '20261031T190000Z/20261101T020000Z',
      details: description,
    })
    expect(query(outlook)).toMatchObject({
      subject: 'Freitags-Zocken · Session 2 (Compies)',
      startdt: '2026-10-31T19:00:00Z',
      enddt: '2026-11-01T02:00:00Z',
      body: description,
    })
    expect(query(linksIn(rows[0]!)[0])).toMatchObject({ text: 'Freitags-Zocken · Session 1 (Compies)', dates: '20261030T190000Z/20261031T020000Z' })
    expect(links.every(link => link.classList.contains('h-12'))).toBe(true)
  })
})
