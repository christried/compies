import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import FieldGroup from '~/components/FieldGroup.vue'
import TextField from '~/components/TextField.vue'

// A group of two fields with a message each (#797): the group shows one line under both.
function groupOf(first: string | undefined, second: string | undefined, slot?: (error: string | undefined) => void) {
  return mountSuspended(FieldGroup, {
    slots: {
      default: ({ error }: { error: string | undefined }) => {
        slot?.(error)
        return h('div', { class: 'grid grid-cols-2' }, [
          h(TextField, { id: 'a', modelValue: '', label: 'von', error: first }),
          h(TextField, { id: 'b', modelValue: '', label: 'bis', error: second }),
        ])
      },
    },
  })
}

describe('FieldGroup (#797)', () => {
  it('shows no line while no member was touched, and no member draws a line of its own', async () => {
    const page = await groupOf('Von bis falsch.', 'Von bis falsch.')

    expect(page.text()).not.toContain('Von bis falsch.')
    expect(page.findAll('[id$="-error"]')).toHaveLength(0)
  })

  it('shows one line under the group once one member was touched, and links only that member to it', async () => {
    const page = await groupOf('Von bis falsch.', 'Von bis falsch.')

    await page.get('#b').trigger('input')

    const lines = page.findAll('[id$="-error"]')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text()).toBe('Von bis falsch.')
    expect(lines[0]!.classes()).toContain('text-error-fg')
    // Announced (#825): the line appears after a touch or a try, so nothing else would tell a screen reader.
    expect(lines[0]!.attributes('role')).toBe('alert')
    expect(page.get('#a').element.closest('.grid')!.contains(lines[0]!.element)).toBe(false)
    expect(page.get('#b').attributes('aria-describedby')).toBe(lines[0]!.attributes('id'))
    expect(page.get('#b').attributes('aria-invalid')).toBe('true')
    expect(page.get('#a').attributes('aria-describedby')).toBeUndefined()
    expect(page.get('#a').attributes('aria-invalid')).toBeUndefined()
    expect(page.get('#a').classes()).not.toContain('border-error-fg')
    expect(page.get('#b').classes()).toContain('border-error-fg')
  })

  it('shows the first member\'s message when both differ and both are touched', async () => {
    const page = await groupOf('Zuerst.', 'Danach.')

    await page.get('#b').trigger('blur')
    await page.get('#a').trigger('blur')

    const lines = page.findAll('[id$="-error"]')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text()).toBe('Zuerst.')
  })

  it('shows the second member\'s message when only it has one that shows', async () => {
    const page = await groupOf(undefined, 'Danach.')

    await page.get('#b').trigger('input')

    expect(page.findAll('[id$="-error"]').map(line => line.text())).toEqual(['Danach.'])
  })

  it('hands the shown message to its default slot, undefined while no line shows', async () => {
    const seen: (string | undefined)[] = []
    const page = await groupOf('Von bis falsch.', undefined, error => seen.push(error))
    expect(seen.at(-1)).toBeUndefined()

    await page.get('#a').trigger('input')

    expect(seen.at(-1)).toBe('Von bis falsch.')
  })

  it('goes when the cause goes', async () => {
    const page = await mountSuspended(FieldGroup, {
      slots: { default: () => h(TextField, { id: 'a', modelValue: '', label: 'von', error: undefined }) },
    })

    await page.get('#a').trigger('input')

    expect(page.findAll('[id$="-error"]')).toHaveLength(0)
  })
})
