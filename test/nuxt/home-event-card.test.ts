import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HomeEventCard from '~/components/HomeEventCard.vue'
import type { HomeEvent } from '~~/shared/event'

// The Home card (screen M1, #347): one type hierarchy, the PhasePill, the Host line, the Best slot or the
// Date, the voted count while a poll is open, the own status and the CTA per role.
const host = { name: 'Hostess' }

function card(overrides: Partial<HomeEvent>): HomeEvent {
  return {
    slug: 'freitags-zocken-k7q2',
    name: 'Freitags-Zocken',
    host,
    phase: 'poll',
    sessionCount: 1,
    missingDates: 1,
    nextSession: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    bestSlot: null,
    progress: { voted: 1, total: 3 },
    viewerVoted: false,
    isHost: false,
    action: 'vote',
    noDate: false,
    ...overrides,
  }
}

async function mountCard(event: HomeEvent) {
  return mountSuspended(HomeEventCard, { props: { event } })
}

function article(wrapper: VueWrapper) {
  return wrapper.get('article')
}

// The first element whose own text is exactly the given line, so a status line is found by its words.
function lineWith(wrapper: VueWrapper, selector: string, text: string) {
  return wrapper.findAll(selector).find(element => element.text() === text)
}

describe('HomeEventCard (#347)', () => {
  it('shows the Host card for the Host: Host: du, the voted count, the own status, and an Öffnen link without the primary fill', async () => {
    const wrapper = await mountCard(card({
      isHost: true,
      action: 'open',
      progress: { voted: 3, total: 9 },
      viewerVoted: true,
      host: { name: 'Kitty' },
    }))
    const text = article(wrapper).text()

    expect(text).toContain('Host: du')
    expect(text).toContain('3 von 9 haben vollständig abgestimmt')
    expect(text).toContain('Du hast abgestimmt')
    const link = wrapper.get('a[href="/e/freitags-zocken-k7q2"]')
    expect(link.text()).toBe('Öffnen')
    expect(link.classes()).not.toContain('bg-primary')
    expect(article(wrapper).classes()).not.toContain('shadow-card')
  })

  it('asks an invited Member who has not voted to vote: warning status with an icon, the primary Abstimmen link, the hard shadow', async () => {
    const wrapper = await mountCard(card({ action: 'vote', viewerVoted: false }))

    expect(article(wrapper).text()).toContain('Host: Hostess')
    const status = lineWith(wrapper, '.text-warning-fg', 'Du hast noch nicht abgestimmt')
    expect(status).toBeDefined()
    expect(status!.find('svg').exists()).toBe(true)
    const link = wrapper.get('a[href="/e/freitags-zocken-k7q2"]')
    expect(link.text()).toBe('Abstimmen')
    expect(link.classes()).toContain('bg-primary')
    expect(article(wrapper).classes()).toContain('shadow-card')
  })

  it('shows a Member who has voted the success status and the Ansehen link', async () => {
    const wrapper = await mountCard(card({ action: 'view', viewerVoted: true, progress: { voted: 3, total: 3 } }))

    expect(lineWith(wrapper, '.text-success-fg', 'Du hast abgestimmt')).toBeDefined()
    expect(lineWith(wrapper, '.text-warning-fg', 'Du hast abgestimmt')).toBeUndefined()
    expect(wrapper.get('a[href="/e/freitags-zocken-k7q2"]').text()).toBe('Ansehen')
  })

  it('shows the Date of a set Event under „Termin“ (not the Best slot), no voted count, and „Termin steht“', async () => {
    const wrapper = await mountCard(card({
      phase: 'date_set',
      missingDates: 0,
      nextSession: { number: null, startsAt: '2090-11-01T19:00:00.000Z' },
      action: 'view',
      progress: { voted: 0, total: 0 },
      viewerVoted: true,
    }))
    const text = article(wrapper).text()

    expect(article(wrapper).find('.font-display').text()).toBe('Freitags-Zocken')
    expect(text).toContain('Termin steht')
    expect(lineWith(wrapper, 'span', 'Termin')).toBeDefined()
    expect(text).not.toContain('Bester Termin bisher')
    expect(text).not.toContain('haben vollständig abgestimmt')
    expect(lineWith(wrapper, '.text-success-fg', 'Termin steht')).toBeDefined()
    expect(wrapper.get('a[href="/e/freitags-zocken-k7q2"]').text()).toBe('Ansehen')
  })

  it('reads „Läuft“ on a running Event', async () => {
    const wrapper = await mountCard(card({ phase: 'running', missingDates: 0, action: 'view', viewerVoted: true, progress: { voted: 0, total: 0 } }))

    expect(article(wrapper).text()).toContain('Läuft')
  })

  it('reads „Beendet“ on a finished Event', async () => {
    const wrapper = await mountCard(card({ phase: 'finished', missingDates: 0, action: 'view', viewerVoted: true, progress: { voted: 0, total: 0 } }))

    expect(article(wrapper).text()).toContain('Beendet')
  })

  it('keeps one type hierarchy: no number font anywhere, and the name is the only display-font element', async () => {
    const states = [
      card({ action: 'vote' }),
      card({ isHost: true, action: 'open', host: { name: 'Kitty' }, viewerVoted: true }),
      card({ phase: 'date_set', missingDates: 0, nextSession: { number: null, startsAt: '2090-11-01T19:00:00.000Z' }, action: 'view', viewerVoted: true }),
      card({ phase: 'running', missingDates: 0, action: 'view', viewerVoted: true }),
      card({ phase: 'finished', missingDates: 0, action: 'view', viewerVoted: true }),
    ]

    for (const event of states) {
      const wrapper = await mountCard(event)
      const name = article(wrapper).get('h3')

      expect(article(wrapper).find('.font-num').exists()).toBe(false)
      expect(name.classes()).toContain('font-display')
      expect(article(wrapper).findAll('.font-display').map(element => element.element)).toEqual([name.element])
    }
  })

  it('shows how many Dates stand above the voted count while Dates are missing', async () => {
    const wrapper = await mountCard(card({ sessionCount: 2, missingDates: 1, progress: { voted: 2, total: 3 } }))
    const text = article(wrapper).text()

    expect(text).toContain('1 von 2 Terminen steht')
    expect(text.indexOf('1 von 2 Terminen steht')).toBeLessThan(text.indexOf('2 von 3 haben vollständig abgestimmt'))
  })

  it('keeps a 60-character name without a space on two lines: the h3 wraps anywhere and is not truncated', async () => {
    const wrapper = await mountCard(card({ name: 'x'.repeat(60) }))
    const name = article(wrapper).get('h3')

    expect(name.text()).toBe('x'.repeat(60))
    expect(name.classes()).toContain('[overflow-wrap:anywhere]')
    expect(name.classes()).not.toContain('truncate')
  })

  it('reads „0 von 1 haben vollständig abgestimmt“ for an Event with one vote to count and none in', async () => {
    const wrapper = await mountCard(card({ progress: { voted: 0, total: 1 } }))

    expect(article(wrapper).text()).toContain('0 von 1 haben vollständig abgestimmt')
  })
})
