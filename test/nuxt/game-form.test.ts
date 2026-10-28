import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GameForm from '~/components/GameForm.vue'
import type { GameView } from '~~/shared/game'
import { kitty, signInAs } from './auth'

const saved: GameView = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Mario Kart',
  imageUrl: null,
  youtubeId: 'dQw4w9WgXcQ',
  clipStart: 72,
  clipLength: 30,
  playersMin: null,
  playersMax: null,
  formats: [],
  createdBy: { id: kitty.id, name: 'Kitty' },
  createdAt: '2026-10-28T10:00:00.000Z',
  canEdit: true,
}

// One endpoint for the file; each test sets whether it fails and sees what was posted.
const posted = vi.fn()
const patchedWith = vi.fn()
let failWith: string | null = null
registerEndpoint('/api/games', {
  method: 'POST',
  handler: async (event) => {
    posted(await readBody(event))
    if (failWith) throw createError({ statusCode: 400, statusMessage: failWith })
    return saved
  },
})
// Edit mode (#142): the game answers with what was sent, as the server would store it.
registerEndpoint(`/api/games/${saved.id}`, {
  method: 'PATCH',
  handler: async (event) => {
    const body = await readBody(event)
    patchedWith(body)
    return { ...saved, name: body.name, playersMin: body.playersMin, playersMax: body.playersMax, formats: body.formats }
  },
})

type Page = VueWrapper

const LINK = 'https://youtu.be/dQw4w9WgXcQ'

function field(page: Page, label: string) {
  const labelEl = page.findAll('label').find(el => el.text() === label)
  if (!labelEl) throw new Error(`no field "${label}"`)
  return page.get(`[id="${labelEl.attributes('for')}"]`)
}

function cta(page: Page) {
  return page.get('button[type="submit"]')
}

describe('the game form', () => {
  beforeEach(() => {
    signInAs({ ...kitty, canHost: true })
    posted.mockClear()
    failWith = null
  })

  it('has the clip length at 30 seconds from the start', async () => {
    const page = await mountSuspended(GameForm)

    expect((field(page, 'Länge').element as HTMLInputElement).value).toBe('30')
  })

  it('names a link that is no YouTube link, marks the field, blocks the CTA with its reason and sends nothing', async () => {
    const page = await mountSuspended(GameForm)
    await field(page, 'Name').setValue('Mario Kart')

    await field(page, 'YouTube-Link').setValue('https://vimeo.com/123456789')

    expect(page.text()).toContain('Das ist kein YouTube-Link, den wir abspielen können.')
    expect(field(page, 'YouTube-Link').attributes('aria-invalid')).toBe('true')
    expect(page.text()).toContain('Keine Vorschau ohne gültigen Link')
    expect(page.find('[aria-label="Ausschnitt im Video"]').exists()).toBe(false)
    expect(cta(page).attributes('aria-disabled')).toBe('true')
    expect(page.get(`[id="${cta(page).attributes('aria-describedby')}"]`).text()).toBe('Erst einen gültigen YouTube-Link eintragen.')

    await page.get('form').trigger('submit')

    expect(posted).not.toHaveBeenCalled()
  })

  it('shows the excerpt for a valid link with the start 1:12', async () => {
    const page = await mountSuspended(GameForm)

    await field(page, 'YouTube-Link').setValue(LINK)
    await field(page, 'Start ab').setValue('1:12')

    expect(page.text()).toContain('Vorschau des Clips')
    expect(page.find('[aria-label="Ausschnitt im Video"]').exists()).toBe(true)
    expect(page.text()).toContain('Ausschnitt 1:12 – 1:42')
    expect(page.text()).toContain('Genau so läuft der Clip in der Session: 30 s, für alle gleichzeitig, mit Ton.')
    expect(page.text()).not.toContain('Das ist kein YouTube-Link')
  })

  it('takes a start as plain seconds and as h:mm:ss', async () => {
    const page = await mountSuspended(GameForm)
    await field(page, 'YouTube-Link').setValue(LINK)

    await field(page, 'Start ab').setValue('90')
    expect(page.text()).toContain('Ausschnitt 1:30 – 2:00')

    await field(page, 'Start ab').setValue('1:01:05')
    expect(page.text()).toContain('Ausschnitt 1:01:05 – 1:01:35')
  })

  it('does not accept a start that is no time, and blocks with it', async () => {
    const page = await mountSuspended(GameForm)
    await field(page, 'Name').setValue('Mario Kart')

    await field(page, 'Start ab').setValue('bald')

    expect(field(page, 'Start ab').attributes('aria-invalid')).toBe('true')
    expect(cta(page).attributes('aria-disabled')).toBe('true')
    await page.get('form').trigger('submit')
    expect(posted).not.toHaveBeenCalled()
  })

  it('does not accept a length outside 5 to 60 seconds', async () => {
    const page = await mountSuspended(GameForm)
    await field(page, 'Name').setValue('Mario Kart')

    await field(page, 'Länge').setValue('4')
    expect(field(page, 'Länge').attributes('aria-invalid')).toBe('true')
    await field(page, 'Länge').setValue('61')
    expect(field(page, 'Länge').attributes('aria-invalid')).toBe('true')
    await field(page, 'Länge').setValue('60')
    expect(field(page, 'Länge').attributes('aria-invalid')).toBeUndefined()

    await page.get('form').trigger('submit')
    await vi.waitFor(() => expect(posted).toHaveBeenCalled())
  })

  it('blocks an empty name with its message once the User tried to save', async () => {
    const page = await mountSuspended(GameForm)

    await page.get('form').trigger('submit')

    expect(page.text()).toContain('Gib dem Spiel einen Namen.')
    expect(cta(page).attributes('aria-disabled')).toBe('true')
    expect(posted).not.toHaveBeenCalled()
  })

  it('posts the game and says it is saved', async () => {
    const page = await mountSuspended(GameForm)
    await field(page, 'Name').setValue('  Mario Kart ')
    await field(page, 'YouTube-Link').setValue(LINK)
    await field(page, 'Start ab').setValue('1:12')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[saved]]))
    expect(posted).toHaveBeenCalledWith({ name: 'Mario Kart', youtubeUrl: LINK, clipStart: 72, clipLength: 30, playersMin: null, playersMax: null, formats: [] })
  })

  it('saves a game without a link and without a clip', async () => {
    const page = await mountSuspended(GameForm)
    await field(page, 'Name').setValue('Brettspiel')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(posted).toHaveBeenCalled())
    expect(posted).toHaveBeenCalledWith({ name: 'Brettspiel', youtubeUrl: '', clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, formats: [] })
  })

  describe('player count and Formats (#142)', () => {
    it('does not promise pool suggestions from the player count and the Formats (#175)', async () => {
      const page = await mountSuspended(GameForm)

      expect(page.text()).not.toContain('nur für Vorschläge beim Pool-Füllen')
    })

    it('posts the player count and the Formats the User picked', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await field(page, 'von').setValue('2')
      await field(page, 'bis').setValue('10')
      await page.get('button[aria-pressed]').trigger('click')

      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(posted).toHaveBeenCalled())
      expect(posted).toHaveBeenCalledWith(expect.objectContaining({ playersMin: 2, playersMax: 10, formats: ['teams'] }))
    })

    it('takes one bound alone and leaves both empty as no count', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await field(page, 'bis').setValue('8')

      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(posted).toHaveBeenCalled())
      expect(posted).toHaveBeenCalledWith(expect.objectContaining({ playersMin: null, playersMax: 8 }))
    })

    it('marks a count with min above max and blocks the CTA with the reason, sending nothing', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      await field(page, 'von').setValue('8')
      await field(page, 'bis').setValue('4')

      expect(field(page, 'bis').attributes('aria-invalid')).toBe('true')
      expect(cta(page).attributes('aria-disabled')).toBe('true')
      await page.get('form').trigger('submit')
      expect(posted).not.toHaveBeenCalled()
    })

    it('shows the Formats as toggles that say whether they are on', async () => {
      const page = await mountSuspended(GameForm)
      const teams = page.findAll('button').find(button => button.text() === 'Teams')!
      const ffa = page.findAll('button').find(button => button.text() === 'Jeder gegen jeden')!

      expect(teams.attributes('aria-pressed')).toBe('false')
      await teams.trigger('click')
      await ffa.trigger('click')

      expect(page.findAll('button').find(button => button.text() === 'Teams')!.attributes('aria-pressed')).toBe('true')
      expect(page.findAll('button').find(button => button.text() === 'Jeder gegen jeden')!.attributes('aria-pressed')).toBe('true')
    })
  })

  describe('edit mode (#142)', () => {
    const existing: GameView = {
      ...saved,
      name: 'Counter-Strike 2',
      playersMin: 2,
      playersMax: 10,
      formats: ['teams'],
    }

    it('prefills every field from the game and saves with PATCH to that game', async () => {
      patchedWith.mockClear()
      const page = await mountSuspended(GameForm, { props: { game: existing } })

      expect((field(page, 'Name').element as HTMLInputElement).value).toBe('Counter-Strike 2')
      expect((field(page, 'von').element as HTMLInputElement).value).toBe('2')
      expect((field(page, 'bis').element as HTMLInputElement).value).toBe('10')
      expect(page.findAll('button').find(button => button.text() === 'Teams')!.attributes('aria-pressed')).toBe('true')
      expect(cta(page).text()).toContain('Änderungen speichern')

      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[{ ...existing, name: 'Counter-Strike 2' }]]))
      expect(patchedWith).toHaveBeenCalledWith(expect.objectContaining({ name: 'Counter-Strike 2', playersMin: 2, playersMax: 10, formats: ['teams'] }))
      expect(posted).not.toHaveBeenCalled()
    })
  })

  it('shows what the server refused with', async () => {
    failWith = 'invalid_clip'
    const page = await mountSuspended(GameForm)
    await field(page, 'Name').setValue('Mario Kart')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toBe('Der Clip passt nicht: Die Länge liegt zwischen 5 und 60 Sekunden.'))
    expect(page.emitted('saved')).toBeUndefined()
  })
})
