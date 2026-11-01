import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VetoButton from '~/components/VetoButton.vue'
import type { OwnVetoView } from '~~/shared/event'

// The hold-to-veto button of a Player (#231, 04-motion § Hold to confirm, reference App Spielrunde „Eigenes Veto versiegelt“): ready,
// holding, cast, sealed for the Player who cast, locked for their teammates, disabled with the reason when no Veto is left, and
// absent for everybody who plays in no Party or when the window is not open.

const members = [{ id: 'me', name: 'Eins' }, { id: 'mate', name: 'Zwei' }]
const own = (fields: Partial<OwnVetoView> = {}): OwnVetoView => ({ team: 1, castBy: null, rejection: null, ...fields })

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(props: { own?: OwnVetoView | null, open?: boolean, cast?: () => Promise<boolean> } = {}) {
  page = await mountSuspended(VetoButton, { props: { own: own(), open: true, viewerId: 'me', members, cast: () => Promise.resolve(true), ...props } })
  await flushPromises()
  return page
}
const text = () => page!.text().replace(/\s+/g, ' ')

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
})

describe('the hold-to-veto button', () => {
  it('is ready for a Player whose Party may veto: a hold button with the veto label and the hold hint', async () => {
    await mount()

    const button = page!.get('button')
    expect(button.text()).toContain('Veto gedrückt halten')
    expect(button.attributes('aria-disabled')).toBeUndefined()
    expect(text()).toContain('Gedrückt halten, um zu bestätigen. Kann nicht zurückgenommen werden.')
  })

  it('shows that it is holding while the button is pressed, and casts nothing when let go early', async () => {
    const cast = vi.fn(() => Promise.resolve(true))
    await mount({ cast })

    await page!.get('button').trigger('pointerdown')
    expect(page!.get('button').text()).toContain('Halten …')
    vi.advanceTimersByTime(600)
    await page!.get('button').trigger('pointerup')
    await vi.advanceTimersByTimeAsync(2000)

    expect(cast).not.toHaveBeenCalled()
  })

  it('casts the Veto after a one second hold, and not before', async () => {
    const cast = vi.fn(() => Promise.resolve(true))
    await mount({ cast })

    await page!.get('button').trigger('pointerdown')
    await vi.advanceTimersByTimeAsync(900)
    expect(cast).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)

    expect(cast).toHaveBeenCalledTimes(1)
  })

  it('shows the Player who cast the sealed Veto, with the seal stamp, and no button to hold', async () => {
    await mount({ own: own({ castBy: 'me', rejection: 'veto_already_cast' }) })

    expect(text()).toContain('Veto eingelegt')
    expect(page!.get('[data-testid="veto-seal"]').text()).toBe('Versiegelt')
    expect(text()).toContain('Die anderen sehen es erst beim Aufdecken.')
    expect(page!.find('[data-testid="veto-hold"]').exists()).toBe(false)
  })

  it('locks the button for a teammate once the Party cast, and names who did', async () => {
    await mount({ own: own({ castBy: 'mate', rejection: 'veto_already_cast' }) })

    expect(text()).toContain('Zwei hat schon gevetot')
    expect(text()).toContain('Ein Veto pro Team und Spiel. Euer Team hat für dieses Spiel schon gevetot.')
    expect(page!.find('[data-testid="veto-hold"]').exists()).toBe(false)
    expect(page!.find('[data-testid="veto-seal"]').exists()).toBe(false)
  })

  it('is disabled with the reason when the Party has no Veto left, and a hold casts nothing', async () => {
    const cast = vi.fn(() => Promise.resolve(true))
    await mount({ own: own({ rejection: 'no_vetoes_left' }), cast })

    expect(page!.get('button').attributes('aria-disabled')).toBe('true')
    expect(text()).toContain('Keine Vetos mehr übrig.')
    await page!.get('button').trigger('pointerdown')
    await vi.advanceTimersByTimeAsync(1500)
    expect(cast).not.toHaveBeenCalled()
  })

  it('is absent for a Member who plays in no Party (the Bench, the Stands, a Host outside the teams)', async () => {
    await mount({ own: null })

    expect(page!.find('button').exists()).toBe(false)
    expect(text()).toBe('')
  })

  it('is absent when the window is not open, also for a Player', async () => {
    await mount({ open: false })

    expect(page!.find('button').exists()).toBe(false)
  })
})
