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

  it('shows the icon chip of its tone by default', async () => {
    const page = await mountSuspended(NoticeBanner, { props: { tone: 'critical' }, slots: { default: 'Kritisch.' } })
    expect(page.find('.bg-error').exists()).toBe(true)
  })
})
