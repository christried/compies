import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import PointsTableEditor from '~/components/PointsTableEditor.vue'
import type { PointsTable } from '~~/shared/settings'

// PointsTableEditor (02-components § PointsTableEditor): the preset cards, one row per team, and for a custom
// table a NumberStepper per row with the rising-place error linked to its row.

function mountEditor(modelValue: PointsTable, teamCount: number) {
  return mountSuspended(PointsTableEditor, { props: { modelValue, teamCount } })
}

const radios = (page: Awaited<ReturnType<typeof mountEditor>>) => page.findAll('[role="radio"]')

describe('PointsTableEditor', () => {
  it('shows the presets with the values they really have for this team count', async () => {
    const page = await mountEditor({ preset: 'linear', values: [3, 2, 1, 0] }, 4)

    expect(radios(page).map(radio => radio.attributes('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(radios(page)[0]!.text()).toContain('Linear')
    expect(radios(page)[0]!.text()).toContain('3 / 2 / 1 / 0')
    expect(radios(page)[1]!.text()).toContain('Winner takes all')
    expect(radios(page)[1]!.text()).toContain('3 / 0 / 0 / 0')
    expect(radios(page)[2]!.text()).toContain('Eigene Tabelle')
  })

  it('lists one row per team with its points', async () => {
    const page = await mountEditor({ preset: 'linear', values: [3, 2, 1, 0] }, 4)

    const rows = page.findAll('[data-testid="points-row"]')
    expect(rows.map(row => row.text())).toEqual(['11. Platz3', '22. Platz2', '33. Platz1', '44. Platz0'])
    expect(page.find('[role="spinbutton"]').exists()).toBe(false)
  })

  it('emits the table of a chosen preset', async () => {
    const page = await mountEditor({ preset: 'linear', values: [3, 2, 1, 0] }, 4)

    await radios(page)[1]!.trigger('click')

    expect(page.emitted('update:modelValue')).toEqual([[{ preset: 'winner_takes_all', values: [3, 0, 0, 0] }]])
  })

  it('starts a custom table from the values on screen', async () => {
    const page = await mountEditor({ preset: 'linear', values: [3, 2, 1, 0] }, 4)

    await radios(page)[2]!.trigger('click')

    expect(page.emitted('update:modelValue')).toEqual([[{ preset: 'custom', values: [3, 2, 1, 0] }]])
  })

  it('edits a custom table with a stepper per place', async () => {
    const page = await mountEditor({ preset: 'custom', values: [3, 2, 1, 0] }, 4)

    const steppers = page.findAll('[role="spinbutton"]')
    expect(steppers.map(stepper => stepper.attributes('aria-label'))).toEqual(['Punkte für Platz 1', 'Punkte für Platz 2', 'Punkte für Platz 3', 'Punkte für Platz 4'])

    await page.get('button[aria-label="Punkte für Platz 2: mehr"]').trigger('click')

    expect(page.emitted('update:modelValue')).toEqual([[{ preset: 'custom', values: [3, 3, 1, 0] }]])
  })

  it('stops the points at 0 and 99', async () => {
    const page = await mountEditor({ preset: 'custom', values: [99, 0], }, 2)

    expect(page.get('button[aria-label="Punkte für Platz 1: mehr"]').attributes('aria-disabled')).toBe('true')
    expect(page.get('button[aria-label="Punkte für Platz 2: weniger"]').attributes('aria-disabled')).toBe('true')
  })

  it('says which place earns more than the place above, and links the message to that row', async () => {
    const page = await mountEditor({ preset: 'custom', values: [5, 3, 4, 0] }, 4)

    const alert = page.get('[role="alert"]')
    expect(alert.text()).toBe('Platz 3 kann nicht mehr Punkte bekommen als Platz 2.')
    const row = page.findAll('[data-testid="points-row"]')[2]!
    expect(row.get('[role="spinbutton"]').attributes('aria-describedby')).toBe(alert.attributes('id'))
    expect(page.findAll('[data-testid="points-row"]')[1]!.get('[role="spinbutton"]').attributes('aria-describedby')).toBeUndefined()
  })

  it('shows no error for equal places or a preset', async () => {
    expect((await mountEditor({ preset: 'custom', values: [2, 2, 2], }, 3)).find('[role="alert"]').exists()).toBe(false)
    expect((await mountEditor({ preset: 'linear', values: [2, 1, 0] }, 3)).find('[role="alert"]').exists()).toBe(false)
  })
})
