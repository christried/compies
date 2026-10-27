import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DateTimeField from '~/components/DateTimeField.vue'
import HoldToConfirmButton from '~/components/HoldToConfirmButton.vue'
import SlotEditSheet from '~/components/SlotEditSheet.vue'

// The sheet is teleported to the body, so the tests query the document for its buttons. Each test
// gets its own slug: registerEndpoint keeps the first handler for a path.
let testNumber = 0

// Berlin 20:00 on these days in summer time (CEST), so the labels are fixed: "Mo 10.06. 20:00", …
const JUNE_10 = { id: 'june-10', startsAt: '2030-06-10T18:00:00.000Z', votes: 0 }
const JUNE_11 = { id: 'june-11', startsAt: '2030-06-11T18:00:00.000Z', votes: 0 }

function serve() {
  testNumber += 1
  const slug = `slot-edit-${testNumber}`
  const posted: unknown[] = []
  const deleted: string[] = []
  const patched: unknown[] = []
  return {
    slug,
    posted,
    deleted,
    patched,
    change(slotId: string, handler?: () => unknown) {
      registerEndpoint(`/api/e/${slug}/slots/${slotId}`, {
        method: 'PATCH',
        handler: async (event) => {
          patched.push(await readBody(event))
          return handler ? handler() : { slotId, startsAt: '2030-06-10T19:00:00.000Z' }
        },
      })
    },
    add(handler?: () => unknown) {
      registerEndpoint(`/api/e/${slug}/slots`, {
        method: 'POST',
        handler: async (event) => {
          posted.push(await readBody(event))
          return handler ? handler() : { slotId: 'new', startsAt: '2030-06-12T18:00:00.000Z' }
        },
      })
    },
    remove(slotId: string, handler?: () => unknown) {
      registerEndpoint(`/api/e/${slug}/slots/${slotId}`, {
        method: 'DELETE',
        handler: () => {
          deleted.push(slotId)
          return handler ? handler() : { slotId, votesDeleted: 0 }
        },
      })
    },
  }
}

function buttonWithText(text: string) {
  return [...document.querySelectorAll('button')].find(button => button.textContent?.includes(text))
}

function shownToasts() {
  return useState<{ text: string }[]>('toasts').value.map(toast => toast.text)
}

describe('SlotEditSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useState('toasts').value = []
  })

  it('lists the Slots in time order and removes one without Votes at once', async () => {
    const endpoint = serve()
    endpoint.remove(JUNE_10.id)
    const page = await mountSuspended(SlotEditSheet, {
      props: { open: true, slug: endpoint.slug, slots: [JUNE_10, JUNE_11] },
    })

    const labels = [...document.querySelectorAll('li .font-num')].map(node => node.textContent?.trim())
    expect(labels).toEqual(['Mo 10.06. 20:00', 'Di 11.06. 20:00'])

    document.querySelector<HTMLButtonElement>('button[aria-label="Termin entfernen"]')?.click()

    await vi.waitFor(() => expect(endpoint.deleted).toEqual([JUNE_10.id]))
    await vi.waitFor(() => expect(page.emitted('changed')).toHaveLength(1))
  })

  it('needs a hold, and says how many Votes go, before removing a Slot with Votes', async () => {
    const page = await mountSuspended(SlotEditSheet, {
      props: { open: true, slug: 'busy', slots: [{ ...JUNE_10, votes: 2 }] },
    })

    expect(document.body.textContent).toContain('2 Stimmen gehen verloren')
    expect(document.querySelector('button[aria-label="Termin entfernen"]')).toBeNull()
    expect(page.findComponent(HoldToConfirmButton).exists()).toBe(true)
    expect(buttonWithText('Termin entfernen')).toBeDefined()
  })

  it('uses the singular for one lost Vote', async () => {
    await mountSuspended(SlotEditSheet, {
      props: { open: true, slug: 'single', slots: [{ ...JUNE_10, votes: 1 }] },
    })

    expect(document.body.textContent).toContain('1 Stimme geht verloren')
  })

  it('adds a Slot from the create form row and asks the page to refresh', async () => {
    const endpoint = serve()
    endpoint.add()
    const page = await mountSuspended(SlotEditSheet, {
      props: { open: true, slug: endpoint.slug, slots: [JUNE_10] },
    })

    page.findComponent(DateTimeField).vm.$emit('update:modelValue', '2030-06-12T20:00')
    await vi.waitFor(() => expect(buttonWithText('Termin hinzufügen')?.getAttribute('aria-disabled')).toBeNull())
    buttonWithText('Termin hinzufügen')?.click()

    await vi.waitFor(() => expect(endpoint.posted).toEqual([{ startsAt: '2030-06-12T20:00' }]))
    await vi.waitFor(() => expect(page.emitted('changed')).toHaveLength(1))
  })

  it('does not send a Slot in the same minute as one already there', async () => {
    const endpoint = serve()
    endpoint.add()
    const page = await mountSuspended(SlotEditSheet, {
      props: { open: true, slug: endpoint.slug, slots: [JUNE_10] },
    })

    // JUNE_10 is 20:00 in Berlin, so this is the same minute.
    page.findComponent(DateTimeField).vm.$emit('update:modelValue', '2030-06-10T20:00')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Diesen Termin gibt es schon.'))
    expect(buttonWithText('Termin hinzufügen')?.getAttribute('aria-disabled')).toBe('true')
    buttonWithText('Termin hinzufügen')?.click()
    expect(endpoint.posted).toEqual([])
  })

  it('hides the add row at 16 Slots and says why', async () => {
    const sixteen = Array.from({ length: 16 }, (_, day) => ({
      id: `slot-${day}`,
      startsAt: new Date(Date.UTC(2030, 5, 10 + day, 18, 0)).toISOString(),
      votes: 0,
    }))
    await mountSuspended(SlotEditSheet, { props: { open: true, slug: 'full', slots: sixteen } })

    expect(document.querySelector('form')).toBeNull()
    expect(document.body.textContent).toContain('Höchstens 16 Vorschläge.')
  })

  it('shows the reason the server gives when a change is refused, and still asks the page to refresh', async () => {
    const endpoint = serve()
    endpoint.remove(JUNE_10.id, () => {
      throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })
    })
    const page = await mountSuspended(SlotEditSheet, {
      props: { open: true, slug: endpoint.slug, slots: [JUNE_10] },
    })

    document.querySelector<HTMLButtonElement>('button[aria-label="Termin entfernen"]')?.click()

    await vi.waitFor(() => expect(shownToasts()).toContain('Termine lassen sich nur ändern, solange noch kein Termin festliegt.'))
    await vi.waitFor(() => expect(page.emitted('changed')).toHaveLength(1))
  })

  it('names the limit when the server refuses a Slot over it', async () => {
    const endpoint = serve()
    endpoint.add(() => {
      throw createError({ statusCode: 400, statusMessage: 'slots_max' })
    })
    const page = await mountSuspended(SlotEditSheet, {
      props: { open: true, slug: endpoint.slug, slots: [JUNE_10] },
    })

    page.findComponent(DateTimeField).vm.$emit('update:modelValue', '2030-06-12T20:00')
    await vi.waitFor(() => expect(buttonWithText('Termin hinzufügen')?.getAttribute('aria-disabled')).toBeNull())
    buttonWithText('Termin hinzufügen')?.click()

    await vi.waitFor(() => expect(shownToasts()).toContain('Höchstens 16 Vorschläge.'))
  })

  it('lets the hold be held again when removing a Slot with Votes is refused, without remounting it', async () => {
    const endpoint = serve()
    endpoint.remove(JUNE_10.id, () => {
      throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })
    })
    await mountSuspended(SlotEditSheet, {
      props: { open: true, slug: endpoint.slug, slots: [{ ...JUNE_10, votes: 2 }] },
    })
    const hold = buttonWithText('Termin entfernen')!

    hold.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(endpoint.deleted).toEqual([JUNE_10.id]), { timeout: 3000 })
    await vi.waitFor(() => expect(shownToasts()).toContain('Termine lassen sich nur ändern, solange noch kein Termin festliegt.'))

    expect(buttonWithText('Termin entfernen')).toBe(hold)
    hold.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    hold.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(endpoint.deleted).toEqual([JUNE_10.id, JUNE_10.id]), { timeout: 3000 })
  })

  it('renders nothing while closed', async () => {
    await mountSuspended(SlotEditSheet, { props: { open: false, slug: 'closed', slots: [JUNE_10] } })

    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  describe('changing a Slot (#85)', () => {
    /** The date and time field that „Ändern“ puts into the row of the Slot with this label. */
    function changeField(page: VueWrapper, label: string) {
      return page.findAllComponents(DateTimeField).find(field => field.props('label') === label)
    }

    function changeInputs(label: string) {
      return [...document.querySelectorAll<HTMLInputElement>(`[role="group"][aria-label="${label}"] input`)].map(input => input.value)
    }

    it('turns the row into the date and time field, prefilled with the Slot\'s time, until „Abbrechen“', async () => {
      const page = await mountSuspended(SlotEditSheet, {
        props: { open: true, slug: 'prefill', slots: [JUNE_10, JUNE_11] },
      })

      buttonWithText('Ändern')?.click()

      await vi.waitFor(() => expect(changeInputs('Mo 10.06. 20:00')).toEqual(['10.06.2030', '20:00']))
      expect(buttonWithText('Speichern')).toBeDefined()
      expect(changeField(page, 'Di 11.06. 20:00')).toBeUndefined()

      buttonWithText('Abbrechen')?.click()
      await vi.waitFor(() => expect(changeField(page, 'Mo 10.06. 20:00')).toBeUndefined())
    })

    it('saves the new time through the send, closes the field and asks the page to refresh', async () => {
      const endpoint = serve()
      endpoint.change(JUNE_10.id)
      const page = await mountSuspended(SlotEditSheet, {
        props: { open: true, slug: endpoint.slug, slots: [JUNE_10, JUNE_11] },
      })

      buttonWithText('Ändern')?.click()
      await vi.waitFor(() => expect(changeField(page, 'Mo 10.06. 20:00')).toBeDefined())
      changeField(page, 'Mo 10.06. 20:00')!.vm.$emit('update:modelValue', '2030-06-10T21:00')
      await vi.waitFor(() => expect(buttonWithText('Speichern')?.getAttribute('aria-disabled')).toBeNull())
      buttonWithText('Speichern')?.click()

      await vi.waitFor(() => expect(endpoint.patched).toEqual([{ startsAt: '2030-06-10T21:00' }]))
      await vi.waitFor(() => expect(page.emitted('changed')).toHaveLength(1))
      expect(changeField(page, 'Mo 10.06. 20:00')).toBeUndefined()
    })

    it('shows the rules for adding and sends nothing: not another Slot\'s minute, not in the past; its own minute is fine', async () => {
      const endpoint = serve()
      endpoint.change(JUNE_10.id)
      const page = await mountSuspended(SlotEditSheet, {
        props: { open: true, slug: endpoint.slug, slots: [JUNE_10, JUNE_11] },
      })
      buttonWithText('Ändern')?.click()
      await vi.waitFor(() => expect(changeField(page, 'Mo 10.06. 20:00')).toBeDefined())
      const field = changeField(page, 'Mo 10.06. 20:00')!

      field.vm.$emit('update:modelValue', '2030-06-11T20:00')
      await vi.waitFor(() => expect(field.props('error')).toBe('Diesen Termin gibt es schon.'))
      expect(buttonWithText('Speichern')?.getAttribute('aria-disabled')).toBe('true')
      buttonWithText('Speichern')?.click()

      field.vm.$emit('update:modelValue', '2001-06-10T20:00')
      await vi.waitFor(() => expect(field.props('error')).toBe('Der Termin liegt in der Vergangenheit.'))

      field.vm.$emit('update:modelValue', '2030-06-10T20:00')
      await vi.waitFor(() => expect(field.props('error')).toBeUndefined())
      expect(endpoint.patched).toEqual([])
    })

    it('says that the Votes stay when the Slot has Votes', async () => {
      await mountSuspended(SlotEditSheet, {
        props: { open: true, slug: 'votes-kept', slots: [{ ...JUNE_10, votes: 2 }] },
      })
      const kept = 'Die Stimmen bleiben erhalten – sag der Gruppe Bescheid.'
      expect(document.body.textContent).not.toContain(kept)

      buttonWithText('Ändern')?.click()

      await vi.waitFor(() => expect(document.body.textContent).toContain(kept))
    })

    it('says nothing about Votes for a Slot without any', async () => {
      const page = await mountSuspended(SlotEditSheet, {
        props: { open: true, slug: 'no-votes', slots: [JUNE_10] },
      })

      buttonWithText('Ändern')?.click()

      await vi.waitFor(() => expect(changeField(page, 'Mo 10.06. 20:00')).toBeDefined())
      expect(document.body.textContent).not.toContain('Die Stimmen bleiben erhalten')
    })

    it('says so when the Slot became a Date meanwhile, and still asks the page to refresh', async () => {
      const endpoint = serve()
      endpoint.change(JUNE_10.id, () => {
        throw createError({ statusCode: 409, statusMessage: 'slot_taken' })
      })
      const page = await mountSuspended(SlotEditSheet, {
        props: { open: true, slug: endpoint.slug, slots: [JUNE_10] },
      })
      buttonWithText('Ändern')?.click()
      await vi.waitFor(() => expect(changeField(page, 'Mo 10.06. 20:00')).toBeDefined())
      changeField(page, 'Mo 10.06. 20:00')!.vm.$emit('update:modelValue', '2030-06-10T21:00')
      await vi.waitFor(() => expect(buttonWithText('Speichern')?.getAttribute('aria-disabled')).toBeNull())

      buttonWithText('Speichern')?.click()

      await vi.waitFor(() => expect(shownToasts()).toContain('Dieser Termin steht schon fest.'))
      await vi.waitFor(() => expect(page.emitted('changed')).toHaveLength(1))
    })
  })
})
