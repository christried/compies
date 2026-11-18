import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameDialog from '~/components/GameDialog.vue'
import GameForm from '~/components/GameForm.vue'
import RichNotesEditorFallback from '~/components/RichNotesEditorFallback.vue'
import type { PoolGameFace } from '~~/shared/game'
import { kitty, signInAs } from './auth'
import { ensureGeometry } from './helpers/notes-editor'

// The notes editor is a lazy chunk (#454, ADR 0019), and a chunk can fail to load (a flaky network, a phone at the table): the field must then say so and offer
// a retry (#822, review 0.16 F5). The import of the editor's file is rejected by a mock that the tests switch; this file imports the editor nowhere else, so
// the first import is the one the page makes.
const chunk = vi.hoisted(() => ({ fail: true, asked: 0 }))
vi.mock('~/components/RichNotesEditor.vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/components/RichNotesEditor.vue')>()
  // A getter: the import itself resolves, and the failure is the read of the component, which is where the loading code meets it.
  return {
    get default() {
      chunk.asked++
      if (chunk.fail) throw new Error('Failed to fetch dynamically imported module')
      return actual.default
    },
  }
})

const GAME: PoolGameFace = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Mario Kart',
  imageUrl: null,
  youtubeId: null,
  playersMin: 2,
  playersMax: 6,
  suitabilities: [],
  price: null,
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!
const retryButton = (root: ParentNode) => [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Nochmal versuchen')

beforeEach(() => {
  ensureGeometry()
  document.body.innerHTML = ''
  signInAs({ ...kitty, canHost: true })
  chunk.fail = true
  chunk.asked = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the notes editor whose chunk fails to load (#822)', () => {
  it('shows an error line and a retry in the game form, and the editor once a retry loads', async () => {
    const page = await mountSuspended(GameForm, { attachTo: document.body })
    await vi.waitFor(() => expect(page.find('[role="alert"]').exists()).toBe(true))

    expect(page.get('[role="alert"]').text()).toContain('Der Editor lässt sich gerade nicht laden.')
    expect(page.find('[data-notes-editor]').exists()).toBe(false)

    chunk.fail = false
    retryButton(page.element)!.click()
    await vi.waitFor(() => expect(page.find('[data-notes-editor]').exists()).toBe(true))
    expect(page.find('[role="alert"]').exists()).toBe(false)
    page.unmount()
  })

  it('shows the same in the game dialog of the Event notes, and the editor once a retry loads', async () => {
    const wrapper = await mountSuspended(GameDialog, {
      props: { open: true, game: GAME, audience: 'host', saveEventNotes: async () => true },
    })
    await flushPromises()
    const add = [...dialog().querySelectorAll('button')].find(button => button.textContent?.trim() === 'Notizen für dieses Event hinzufügen')!
    add.click()
    await vi.waitFor(() => expect(dialog().querySelector('[role="alert"]')).not.toBeNull())

    expect(dialog().querySelector('[role="alert"]')!.textContent).toContain('Der Editor lässt sich gerade nicht laden.')
    expect(dialog().querySelector('[data-notes-editor]')).toBeNull()

    chunk.fail = false
    retryButton(dialog())!.click()
    await vi.waitFor(() => expect(dialog().querySelector('[data-notes-editor]')).not.toBeNull())
    expect(dialog().querySelector('[role="alert"]')).toBeNull()
    wrapper.unmount()
  })

  it('holds the place of a loading editor as busy and named, not hidden', async () => {
    const page = await mountSuspended(RichNotesEditorFallback, { props: { variant: 'game' } })

    const busy = page.get('[aria-busy="true"]')
    expect(busy.attributes('aria-hidden')).toBeUndefined()
    expect(busy.text()).toContain('Editor lädt')
    expect(page.find('[role="alert"]').exists()).toBe(false)
  })
})
