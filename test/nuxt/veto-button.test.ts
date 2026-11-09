import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VetoButton from '~/components/VetoButton.vue'
import type { OwnVetoView } from '~~/shared/stage'

// The hold-to-veto button of a Player (#231, 04-motion § Hold to confirm, reference App Spielrunde „Eigenes Veto versiegelt“): ready,
// holding, cast (locked and sealed for the whole Party, #355: nobody learns which Player cast), disabled when no Veto is left, and absent for everybody
// who plays in no Party or when the window is not open. It sits in the VetoBar (F4), which has the title and the lines around it.

const own = (fields: Partial<OwnVetoView> = {}): OwnVetoView => ({ team: 1, cast: false, rejection: null, ...fields })

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(props: { own?: OwnVetoView | null, open?: boolean, cast?: () => Promise<boolean> } = {}) {
  page = await mountSuspended(VetoButton, { props: { own: own(), open: true, cast: () => Promise.resolve(true), ...props } })
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
  it('is ready for a Player whose Party may veto: a hold button with the veto label', async () => {
    await mount()

    const button = page!.get('button')
    expect(button.text()).toContain('Veto')
    expect(button.attributes('aria-disabled')).toBeUndefined()
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

  it('shows every Player of a Party that cast a locked pill with the seal stamp, and no button to hold: the caster and a teammate alike (#355)', async () => {
    await mount({ own: own({ cast: true, rejection: 'veto_already_cast' }) })

    expect(text()).toContain('Veto ist drin')
    expect(page!.get('[data-testid="veto-seal"]').text()).toBe('Versiegelt')
    expect(page!.find('[data-testid="veto-hold"]').exists()).toBe(false)
  })

  it('is disabled when the Party has no Veto left, and a hold casts nothing', async () => {
    const cast = vi.fn(() => Promise.resolve(true))
    await mount({ own: own({ rejection: 'no_vetoes_left' }), cast })

    expect(page!.get('button').attributes('aria-disabled')).toBe('true')
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
