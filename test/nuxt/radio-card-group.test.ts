import { Crown, Lock, Swords, Users } from '@lucide/vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import RadioCardGroup from '~/components/RadioCardGroup.vue'

// RadioCardGroup (02-components § RadioCardGroup): big choice cards in a radio group. A locked option shows
// „Bald verfügbar“, carries aria-disabled and can be chosen neither by click nor by keyboard.

const options = [
  { value: 'ffa', label: 'Jeder gegen jeden', desc: 'Jede Person ist eine eigene Partei.', icon: Users, locked: true },
  { value: 'teams', label: 'Teams', desc: '2 bis 8 gleich große Teams.', icon: Users },
  { value: 'bracket', label: 'Turnierbaum', desc: 'K.-o.-Runden.', icon: Swords, locked: true },
  { value: 'cup', label: 'Pokal', desc: 'Ein Pokal.', icon: Crown },
  { value: 'league', label: 'Liga', desc: 'Spieltage.', icon: Lock, locked: true },
]

function mountGroup(modelValue = 'teams') {
  return mountSuspended(RadioCardGroup, { props: { modelValue, options, label: 'Format' } })
}

const radios = (page: Awaited<ReturnType<typeof mountGroup>>) => page.findAll('[role="radio"]')

describe('RadioCardGroup', () => {
  it('is a radio group with the selected card checked and the others not', async () => {
    const page = await mountGroup()

    expect(page.get('[role="radiogroup"]').attributes('aria-label')).toBe('Format')
    expect(radios(page).map(radio => radio.attributes('aria-checked'))).toEqual(['false', 'true', 'false', 'false', 'false'])
    expect(radios(page)[1]!.text()).toContain('Teams')
    expect(radios(page)[1]!.text()).toContain('2 bis 8 gleich große Teams.')
  })

  it('selects an option by click', async () => {
    const page = await mountGroup('cup')

    await radios(page)[1]!.trigger('click')

    expect(page.emitted('update:modelValue')).toEqual([['teams']])
  })

  it('shows locked options with „Bald verfügbar“ and aria-disabled, and ignores a click on them', async () => {
    const page = await mountGroup()

    const locked = radios(page)[0]!
    expect(locked.attributes('aria-disabled')).toBe('true')
    expect(locked.text()).toContain('Bald verfügbar')
    expect(radios(page)[1]!.attributes('aria-disabled')).toBeUndefined()
    expect(radios(page)[1]!.text()).not.toContain('Bald verfügbar')
    expect(page.get(`[id="${locked.attributes('aria-describedby')}"]`).text()).toContain('Bald verfügbar')

    await locked.trigger('click')
    expect(page.emitted('update:modelValue')).toBeUndefined()
  })

  it('moves with the arrow keys, skipping locked options and wrapping around', async () => {
    const page = await mountGroup('teams')

    await radios(page)[1]!.trigger('keydown', { key: 'ArrowDown' })
    expect(page.emitted('update:modelValue')).toEqual([['cup']])

    await page.setProps({ modelValue: 'cup' })
    await radios(page)[3]!.trigger('keydown', { key: 'ArrowRight' })
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['teams'])

    await radios(page)[3]!.trigger('keydown', { key: 'ArrowUp' })
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['teams'])
    await radios(page)[1]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(page.emitted('update:modelValue')?.at(-1)).toEqual(['cup'])
  })

  it('has the selected card as its one tab stop, never a locked one', async () => {
    const page = await mountGroup('cup')
    expect(radios(page).map(radio => radio.attributes('tabindex'))).toEqual(['-1', '-1', '-1', '0', '-1'])

    const none = await mountGroup('')
    expect(radios(none).map(radio => radio.attributes('tabindex'))).toEqual(['-1', '0', '-1', '-1', '-1'])
  })
})

// A locked group (#147): the Event is running, so the choice cannot change; the chosen card stays chosen.
describe('RadioCardGroup with a lockedReason', () => {
  function mountLocked() {
    return mountSuspended(RadioCardGroup, { props: { modelValue: 'teams', options: options.filter(option => !option.locked), label: 'Format', lockedReason: 'Gesperrt, weil es läuft.' } })
  }

  it('keeps the chosen card chosen, marks every card aria-disabled and describes them by the reason', async () => {
    const page = await mountLocked()

    expect(radios(page).map(radio => radio.attributes('aria-checked'))).toEqual(['true', 'false'])
    expect(radios(page).every(radio => radio.attributes('aria-disabled') === 'true')).toBe(true)
    const reasonId = radios(page)[0]!.attributes('aria-describedby')!
    expect(page.get(`#${reasonId}`).text()).toBe('Gesperrt, weil es läuft.')
  })

  it('chooses nothing by click or by arrow key', async () => {
    const page = await mountLocked()

    await radios(page)[1]!.trigger('click')
    await radios(page)[0]!.trigger('keydown', { key: 'ArrowRight' })

    expect(page.emitted('update:modelValue')).toBeUndefined()
  })
})

// The „Bald verfügbar“ chip sits on the title line, so on a narrow card it wraps under the title and the
// description keeps the full text width (#174).
describe('RadioCardGroup chip placement (#174)', () => {
  it('puts the chip on the title line, next to the label', async () => {
    const page = await mountGroup()

    const locked = radios(page)[0]!
    const chip = page.get(`[id="${locked.attributes('aria-describedby')}"]`)
    const title = locked.get('b')
    expect(chip.element.parentElement).toBe(title.element.parentElement)
    expect(chip.text()).toContain('Bald verfügbar')
  })

  it('gives the description the whole text column, not a column beside the chip', async () => {
    const page = await mountGroup()

    const locked = radios(page)[0]!
    const title = locked.get('b').element.parentElement!
    const description = locked.findAll('span').find(span => span.text() === 'Jede Person ist eine eigene Partei.')!
    expect(description.element.parentElement).toBe(title.parentElement)
  })

  it('leaves no chip on a card that is open', async () => {
    const page = await mountGroup()

    const open = radios(page)[1]!
    expect(open.findAll('span').some(span => span.text() === 'Bald verfügbar')).toBe(false)
  })
})
