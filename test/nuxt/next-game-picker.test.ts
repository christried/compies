import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import NextGamePicker from '~/components/NextGamePicker.vue'
import type { PoolGame } from '~~/shared/game'
import { kitty, signInAs } from './auth'
import { clickButton, dialog } from './event-page'

// The switch „Veto erlauben“ in the picker for the next game (#232, spec #218 § „Nächstes Spiel setzen“, stories 50 and 53): off every
// time the sheet opens, there only in a Selection mode with a wheel, and its value goes out with the game that is picked.

const halo: PoolGame = { id: 'g-halo', name: 'Halo', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], notes: null }

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function mount(props: { open?: boolean, vetoSwitch?: boolean, pool?: PoolGame[] } = {}) {
  page = await mountSuspended(NextGamePicker, { props: { open: true, pool: [halo], busy: false, ...props } })
  await flushPromises()
  return page
}

const vetoSwitch = () => dialog()?.querySelector<HTMLButtonElement>('button[role="switch"]') ?? null
const pickHalo = async () => {
  dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Halo auswählen"]')!.click()
  await flushPromises()
}

beforeEach(() => {
  signInAs(kitty)
  document.body.innerHTML = ''
})

afterEach(() => {
  page?.unmount()
  page = undefined
})

describe('the Veto switch of the picker', () => {
  it('is off by default, named „Veto erlauben“ with the 60 seconds as its help', async () => {
    await mount({ vetoSwitch: true })

    const toggle = vetoSwitch()!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(toggle.textContent).toContain('Veto erlauben')
    expect(toggle.textContent).toContain('Die Parteien haben dann 60 Sekunden, das Spiel abzulehnen.')
  })

  it('is absent without the switch prop, as under Host pick', async () => {
    await mount()

    expect(vetoSwitch()).toBeNull()
    expect(dialog()!.textContent).not.toContain('Veto erlauben')
  })

  it('shows "Setzen" as disabled (dashed, flat) until a game is chosen (F22)', async () => {
    await mount()

    const button = [...dialog()!.querySelectorAll('button')].find(element => element.textContent?.trim() === 'Setzen')!
    expect(button.disabled).toBe(true)
    expect(button.className).toContain('disabled:border-dashed')
    expect(button.className).toContain('disabled:bg-paper-2')
  })

  it('sends the game with no Veto allowed when the switch stays off', async () => {
    await mount({ vetoSwitch: true })
    await pickHalo()

    await clickButton(dialog(), 'Setzen')

    expect(page!.emitted('pick')).toEqual([['g-halo', false]])
  })

  it('sends the game with the Veto allowed when the switch is on', async () => {
    await mount({ vetoSwitch: true })
    await pickHalo()
    vetoSwitch()!.click()
    await flushPromises()
    expect(vetoSwitch()!.getAttribute('aria-checked')).toBe('true')

    await clickButton(dialog(), 'Setzen')

    expect(page!.emitted('pick')).toEqual([['g-halo', true]])
  })

  it('is off again when the sheet opens the next time', async () => {
    await mount({ vetoSwitch: true })
    vetoSwitch()!.click()
    await flushPromises()
    expect(vetoSwitch()!.getAttribute('aria-checked')).toBe('true')

    await page!.setProps({ open: false })
    await page!.setProps({ open: true })
    await flushPromises()

    expect(vetoSwitch()!.getAttribute('aria-checked')).toBe('false')
  })
})

describe('the sheet\'s footer', () => {
  it('keeps „Setzen“ in the sticky footer, so it stays in view under a long library list (#218)', async () => {
    const pool = Array.from({ length: 40 }, (_, index) => ({ ...halo, id: `g-${index}`, name: `Spiel ${index}` }))
    await mount({ vetoSwitch: true, pool })

    const footer = dialog()!.querySelector('footer')!
    expect(footer.textContent).toContain('Setzen')
    expect(footer.className).toContain('sticky')
    expect(footer.className).toContain('bottom-0')
  })
})
