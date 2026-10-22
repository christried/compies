import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
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
  return {
    slug,
    posted,
    deleted,
    add(handler?: () => unknown) {
      registerEndpoint(`/api/s/${slug}/slots`, {
        method: 'POST',
        handler: async (event) => {
          posted.push(await readBody(event))
          return handler ? handler() : { slotId: 'new', startsAt: '2030-06-12T18:00:00.000Z' }
        },
      })
    },
    remove(slotId: string, handler?: () => unknown) {
      registerEndpoint(`/api/s/${slug}/slots/${slotId}`, {
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

  it('hides the add row at 8 Slots and says why', async () => {
    const eight = Array.from({ length: 8 }, (_, day) => ({
      id: `slot-${day}`,
      startsAt: new Date(Date.UTC(2030, 5, 10 + day, 18, 0)).toISOString(),
      votes: 0,
    }))
    await mountSuspended(SlotEditSheet, { props: { open: true, slug: 'full', slots: eight } })

    expect(document.querySelector('form')).toBeNull()
    expect(document.body.textContent).toContain('Höchstens 8 Vorschläge.')
  })

  it('shows the reason the server gives when a change is refused', async () => {
    const endpoint = serve()
    endpoint.remove(JUNE_10.id, () => {
      throw createError({ statusCode: 409, statusMessage: 'wrong_phase' })
    })
    await mountSuspended(SlotEditSheet, {
      props: { open: true, slug: endpoint.slug, slots: [JUNE_10] },
    })

    document.querySelector<HTMLButtonElement>('button[aria-label="Termin entfernen"]')?.click()

    await vi.waitFor(() => expect(shownToasts()).toContain('Termine lassen sich nur ändern, solange noch kein Termin festliegt.'))
  })

  it('renders nothing while closed', async () => {
    await mountSuspended(SlotEditSheet, { props: { open: false, slug: 'closed', slots: [JUNE_10] } })

    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
