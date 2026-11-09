import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import TagInput from '~/components/TagInput.vue'
import TextField from '~/components/TextField.vue'
import { TAG_MAX, type GameTag } from '~~/shared/game'

// The surface and border of a text-like field (#362): a TagInput's box and a TextField's input wear the same chrome,
// valid and invalid, from one home (`fieldBox`).

const tags: GameTag[] = [{ key: 'co-op', label: 'Co-op' }]

/** The box a TagInput draws around its chips and its input: the input's parent. */
function tagBox(page: Awaited<ReturnType<typeof mountSuspended>>) {
  return page.get('input[role="combobox"]').element.parentElement!
}

describe('field chrome', () => {
  it('a valid TagInput box and a valid TextField input carry the same surface and line border', async () => {
    const tagInput = await mountSuspended(TagInput, { props: { modelValue: [], suggestions: tags, label: 'Tags' } })
    const textField = await mountSuspended(TextField, { props: { modelValue: '', label: 'Name' } })

    const box = tagBox(tagInput)
    const input = textField.get('input')
    for (const element of [box, input.element]) {
      expect(element.classList).toContain('rounded-md')
      expect(element.classList).toContain('bg-surface')
      expect(element.classList).toContain('border-line')
      expect(element.classList).not.toContain('border-error-fg')
    }
  })

  it('an invalid TagInput box (a Tag too long) and an invalid TextField input (an error) carry the 3 px error border', async () => {
    const tagInput = await mountSuspended(TagInput, { props: { modelValue: [], suggestions: tags, label: 'Tags' } })
    await tagInput.get('input[role="combobox"]').setValue('x'.repeat(TAG_MAX + 1))
    const textField = await mountSuspended(TextField, { props: { modelValue: '', label: 'Name', error: 'Pflichtfeld' } })

    const box = tagBox(tagInput)
    const input = textField.get('input')
    expect(box.classList).toContain('border-3')
    expect(box.classList).toContain('border-error-fg')
    expect(input.element.classList).toContain('border-3')
    expect(input.element.classList).toContain('border-error-fg')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(tagInput.get('input[role="combobox"]').attributes('aria-invalid')).toBe('true')
  })

  it('the TextField textarea takes the same chrome as its input', async () => {
    const page = await mountSuspended(TextField, { props: { modelValue: '', label: 'Notiz', multiline: true } })

    const classes = page.get('textarea').element.classList
    expect(classes).toContain('rounded-md')
    expect(classes).toContain('bg-surface')
    expect(classes).toContain('border-line')
  })
})
