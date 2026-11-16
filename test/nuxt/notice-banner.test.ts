import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import NoticeBanner from '~/components/NoticeBanner.vue'

// NoticeBanner (#172): an inline notice in three tones next to the success one. Each tone is a pale tint of its
// token on the surface, so an important note stands out from the dotted page; the ✕ is there only when a page
// asks for it (`closable`), so a notice with nothing to close carries no dead button.

const TINTS = {
  info: 'bg-info-tint',
  warning: 'bg-warning-tint',
  critical: 'bg-error-tint',
  success: 'bg-success-tint',
} as const

describe('NoticeBanner tones (#172)', () => {
  for (const [tone, tint] of Object.entries(TINTS)) {
    it(`gives the ${tone} tone a tinted background, never the page or the plain surface`, async () => {
      const page = await mountSuspended(NoticeBanner, { props: { tone: tone as keyof typeof TINTS }, slots: { default: 'Ein Hinweis.' } })

      const root = page.get('[role]')
      expect(root.classes()).toContain(tint)
      expect(root.classes()).not.toContain('bg-surface')
      expect(root.classes()).not.toContain('bg-paper')
      expect(root.classes()).not.toContain('bg-paper-2')
    })
  }

  it('keeps the old tone values working: info by default, warning and success as before', async () => {
    const info = await mountSuspended(NoticeBanner, { slots: { default: 'Info.' } })
    expect(info.get('[role]').classes()).toContain('bg-info-tint')

    const warning = await mountSuspended(NoticeBanner, { props: { tone: 'warning' }, slots: { default: 'Hinweis.' } })
    expect(warning.get('[role]').classes()).toContain('bg-warning-tint')
  })

  it('announces the critical tone as an alert and the others as a status', async () => {
    const critical = await mountSuspended(NoticeBanner, { props: { tone: 'critical' }, slots: { default: 'Kritisch.' } })
    expect(critical.get('[role]').attributes('role')).toBe('alert')

    for (const tone of ['info', 'warning', 'success'] as const) {
      const page = await mountSuspended(NoticeBanner, { props: { tone }, slots: { default: 'Text.' } })
      expect(page.get('[role]').attributes('role')).toBe('status')
    }
  })

  it('renders no ✕ without closable, and the ✕ emits close with closable', async () => {
    const plain = await mountSuspended(NoticeBanner, { props: { tone: 'warning' }, slots: { default: 'Bleibt.' } })
    expect(plain.find('button').exists()).toBe(false)

    const closable = await mountSuspended(NoticeBanner, { props: { tone: 'warning', closable: true }, slots: { default: 'Geht weg.' } })
    await closable.get('button').trigger('click')
    expect(closable.emitted('close')).toHaveLength(1)
  })

  it('shows a Host-only notice as label, divider, text and action in that order, with the ✕ kept (#611)', async () => {
    const page = await mountSuspended(NoticeBanner, { props: { hostOnly: true, closable: true }, slots: { default: 'Lange Nachricht.', action: '<button type="button">Jetzt</button>' } })
    const root = page.element
    const label = [...root.querySelectorAll('span')].find(el => el.textContent?.trim() === 'Nur du siehst das')
    const divider = root.querySelector('hr')
    const text = [...root.querySelectorAll('span')].find(el => el.textContent?.trim() === 'Lange Nachricht.')
    const action = page.get('button:not([aria-label])').element
    expect(label, 'label').toBeTruthy()
    expect(divider, 'divider').toBeTruthy()
    expect(text, 'text').toBeTruthy()

    const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect(follows(label!, divider!)).toBe(true)
    expect(follows(divider!, text!)).toBe(true)
    expect(follows(text!, action)).toBe(true)

    await page.get('button[aria-label="Schließen"]').trigger('click')
    expect(page.emitted('close')).toHaveLength(1)
  })

  it('shows a Host-only notice without an action as label, divider and text, with no button (#611)', async () => {
    const page = await mountSuspended(NoticeBanner, { props: { hostOnly: true }, slots: { default: 'Nur Text.' } })
    const root = page.element
    const label = [...root.querySelectorAll('span')].find(el => el.textContent?.trim() === 'Nur du siehst das')
    const divider = root.querySelector('hr')
    const text = [...root.querySelectorAll('span')].find(el => el.textContent?.trim() === 'Nur Text.')
    expect(label, 'label').toBeTruthy()
    expect(divider, 'divider').toBeTruthy()
    expect(text, 'text').toBeTruthy()

    const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect(follows(label!, divider!)).toBe(true)
    expect(follows(divider!, text!)).toBe(true)
    expect(page.findAll('button')).toHaveLength(0)
  })

  it('draws neither label nor divider without hostOnly, and keeps the action under sm wrapper (#166, #611)', async () => {
    const withAction = await mountSuspended(NoticeBanner, { slots: { default: 'Text.', action: '<button type="button">Jetzt</button>' } })
    expect(withAction.text()).not.toContain('Nur du siehst das')
    expect(withAction.find('hr').exists()).toBe(false)
    expect(withAction.get('button').element.parentElement?.className).toContain('max-sm:self-start')

    const without = await mountSuspended(NoticeBanner, { slots: { default: 'Nur Text.' } })
    expect(without.text()).not.toContain('Nur du siehst das')
    expect(without.find('hr').exists()).toBe(false)
    expect(without.element.querySelectorAll('.max-sm\\:self-start')).toHaveLength(0)
  })

  it('draws the icon of each chip in the on-token of its fill, never in ink (#411 class)', async () => {
    // Ink is cream in Dunkel: 2.54:1 on the info blue. Every tone's own on-token reads on its fill in both looks.
    const FILLS = { info: 'bg-info', warning: 'bg-warning', critical: 'bg-error', success: 'bg-success' } as const
    const ON = { info: 'text-on-info', warning: 'text-on-warning', critical: 'text-on-error', success: 'text-on-success' } as const
    for (const tone of Object.keys(FILLS) as (keyof typeof FILLS)[]) {
      const page = await mountSuspended(NoticeBanner, { props: { tone }, slots: { default: 'Text.' } })
      const chip = page.get(`.${FILLS[tone]}`)
      expect(chip.classes(), tone).toContain(ON[tone])
      expect(chip.classes(), tone).not.toContain('text-ink')
    }
  })

  it('shows the icon chip of its tone by default', async () => {
    const page = await mountSuspended(NoticeBanner, { props: { tone: 'critical' }, slots: { default: 'Kritisch.' } })
    expect(page.find('.bg-error').exists()).toBe(true)
  })
})
