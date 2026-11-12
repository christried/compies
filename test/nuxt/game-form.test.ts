import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameForm from '~/components/GameForm.vue'
import { FINE_POINTER_QUERY } from '~/composables/useMediaQuery'
import type { GameTag, GameView } from '~~/shared/game'
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
  suitabilities: [],
  createdBy: { id: kitty.id, name: 'Kitty' },
  createdAt: '2026-10-28T10:00:00.000Z',
  canEdit: true,
  notes: null,
  tags: [],
  price: null,
}

// The Tags in use feed the suggestions of the Tag field (#335). The form asks `/api/games/tags` for them (#365), not the library.
const suggestedTags: GameTag[] = [{ key: 'co-op', label: 'Co-op' }, { key: 'coop-klassiker', label: 'Coop-Klassiker' }, { key: 'retro', label: 'Retro' }]
let tagsInUse: GameTag[] = suggestedTags
const tagsRequested = vi.fn()
registerEndpoint('/api/games/tags', {
  method: 'GET',
  handler: () => {
    tagsRequested()
    return tagsInUse
  },
})
// The whole library: the form must not load it for its suggestions (#365), so a call here is a regression.
const libraryRequested = vi.fn()
registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => {
    libraryRequested()
    return { games: [], tagsInUse: suggestedTags }
  },
})

// One endpoint for the file; each test sets whether it fails and sees what was posted.
const posted = vi.fn()
const patchedWith = vi.fn()
let failWith: string | null = null
// A test that holds a save (#456) sets this: the POST waits for it before it answers.
let holdPost: Promise<void> | null = null
registerEndpoint('/api/games', {
  method: 'POST',
  handler: async (event) => {
    posted(await readBody(event))
    if (holdPost) await holdPost
    if (failWith) throw createError({ statusCode: 400, statusMessage: failWith })
    return saved
  },
})
// Edit mode (#142): the game answers with what was sent, as the server would store it.
// The Price the PATCH answers with (#337): a test sets it to what the server would stamp.
let patchPrice: GameView['price'] = null
// The reason the PATCH refuses a Price confirm, when a test sets one (#361: the form shows it in its banner).
let patchRefusedWith: string | null = null
registerEndpoint(`/api/games/${saved.id}`, {
  method: 'PATCH',
  handler: async (event) => {
    const body = await readBody(event)
    patchedWith(body)
    if (patchRefusedWith) throw createError({ statusCode: 400, statusMessage: patchRefusedWith })
    return { ...saved, name: body.name, playersMin: body.playersMin, playersMax: body.playersMax, suitabilities: body.suitabilities, tags: body.tags, price: patchPrice }
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
    tagsInUse = suggestedTags
    tagsRequested.mockClear()
    libraryRequested.mockClear()
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

  it('does not accept a length outside 10 to 120 seconds', async () => {
    const page = await mountSuspended(GameForm)
    await field(page, 'Name').setValue('Mario Kart')

    await field(page, 'Länge').setValue('9')
    expect(field(page, 'Länge').attributes('aria-invalid')).toBe('true')
    await field(page, 'Länge').setValue('121')
    expect(field(page, 'Länge').attributes('aria-invalid')).toBe('true')
    await field(page, 'Länge').setValue('120')
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

  it('drops the hints of the link, the start and the length, and says the length is at most 120 seconds', async () => {
    const page = await mountSuspended(GameForm)

    expect(page.text()).not.toContain('Watch-, youtu.be-, Shorts- oder Embed-Link')
    expect(page.text()).not.toContain('Minuten:Sekunden, zum Beispiel 1:12.')
    expect(page.text()).not.toContain('In Sekunden, 5 bis 60.')
    expect(page.text()).toContain('Maximal 120 Sekunden')
  })

  it('shows the length error instead of the maximum while the length is invalid', async () => {
    const page = await mountSuspended(GameForm)

    await field(page, 'Länge').setValue('121')

    expect(page.text()).toContain('Die Länge liegt zwischen 10 und 120 Sekunden.')
    expect(page.text()).not.toContain('Maximal 120 Sekunden')
  })

  // Start, Ende and Länge (#508): the two edited last hold, the third follows; only start and length are sent.
  describe('clip fields (#508)', () => {
    const valueOf = (page: Page, label: string) => (field(page, label).element as HTMLInputElement).value
    const errorOf = (page: Page, label: string) => page.get(`[id="${field(page, label).attributes('id')}-error"]`).text()
    const invalid = (page: Page, label: string) => field(page, label).attributes('aria-invalid')

    it('opens a new game with 0:00, 0:30 and 30 and the help of Ende and Länge', async () => {
      const page = await mountSuspended(GameForm)

      expect(valueOf(page, 'Start ab')).toBe('0:00')
      expect(valueOf(page, 'Ende')).toBe('0:30')
      expect(valueOf(page, 'Länge')).toBe('30')
      expect(page.text()).toContain('Zwei der drei Felder reichen.')
      expect(page.text()).toContain('Maximal 120 Sekunden')
    })

    it('opens an existing game as stored, with Ende worked out and no error', async () => {
      const page = await mountSuspended(GameForm, { props: { game: saved } })

      expect(valueOf(page, 'Start ab')).toBe('1:12')
      expect(valueOf(page, 'Ende')).toBe('1:42')
      expect(valueOf(page, 'Länge')).toBe('30')
      for (const label of ['Start ab', 'Ende', 'Länge']) expect(invalid(page, label)).toBeUndefined()
    })

    it('moves Start when Ende and then Länge are typed, and the preview follows', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'YouTube-Link').setValue(LINK)

      await field(page, 'Ende').setValue('2:00')
      expect(valueOf(page, 'Länge')).toBe('120')
      await field(page, 'Länge').setValue('60')

      expect(valueOf(page, 'Start ab')).toBe('1:00')
      expect(valueOf(page, 'Ende')).toBe('2:00')
      expect(page.text()).toContain('Ausschnitt 1:00 – 2:00')
      expect(page.text()).toContain('Genau so läuft der Clip in der Session: 60 s, für alle gleichzeitig, mit Ton.')
    })

    it('sets Länge when Start and then Ende are typed', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'YouTube-Link').setValue(LINK)

      await field(page, 'Start ab').setValue('1:00')
      await field(page, 'Ende').setValue('1:45')

      expect(valueOf(page, 'Länge')).toBe('45')
      expect(page.text()).toContain('Ausschnitt 1:00 – 1:45')
      expect(page.text()).toContain('45 s, für alle gleichzeitig')
    })

    describe('the error sits on the field that followed', () => {
      it('Ende before Start: Länge', async () => {
        const page = await mountSuspended(GameForm)

        await field(page, 'Start ab').setValue('1:00')
        await field(page, 'Ende').setValue('0:30')

        expect(invalid(page, 'Länge')).toBe('true')
        expect(valueOf(page, 'Länge')).toBe('')
        expect(errorOf(page, 'Länge')).toBe('Das Ende liegt vor dem Start.')
        expect(page.text()).not.toContain('Maximal 120 Sekunden')
        expect(invalid(page, 'Start ab')).toBeUndefined()
        expect(invalid(page, 'Ende')).toBeUndefined()
      })

      it('a length over 120 s: Länge', async () => {
        const page = await mountSuspended(GameForm)

        await field(page, 'Ende').setValue('5:00')

        expect(valueOf(page, 'Länge')).toBe('300')
        expect(errorOf(page, 'Länge')).toBe('Die Länge liegt zwischen 10 und 120 Sekunden.')
        expect(invalid(page, 'Start ab')).toBeUndefined()
        expect(invalid(page, 'Ende')).toBeUndefined()
      })

      it('a Start before 0:00: Start', async () => {
        const page = await mountSuspended(GameForm)

        await field(page, 'Ende').setValue('0:20')
        await field(page, 'Länge').setValue('60')

        expect(invalid(page, 'Start ab')).toBe('true')
        expect(valueOf(page, 'Start ab')).toBe('')
        expect(errorOf(page, 'Start ab')).toBe('Der Start läge vor 0:00.')
        expect(invalid(page, 'Ende')).toBeUndefined()
        expect(invalid(page, 'Länge')).toBeUndefined()
      })

      it('a Start that is no time: Start itself, and Ende stays', async () => {
        const page = await mountSuspended(GameForm)

        await field(page, 'Start ab').setValue('bald')

        expect(errorOf(page, 'Start ab')).toBe('Das ist keine Zeit. Schreib zum Beispiel 1:12 oder 72.')
        expect(valueOf(page, 'Ende')).toBe('0:30')
        expect(invalid(page, 'Ende')).toBeUndefined()
      })

      it('an emptied Ende: Ende itself, and Länge stays', async () => {
        const page = await mountSuspended(GameForm)

        await field(page, 'Ende').setValue('')

        expect(errorOf(page, 'Ende')).toBe('Das ist keine Zeit. Schreib zum Beispiel 1:12 oder 72.')
        expect(valueOf(page, 'Länge')).toBe('30')
        expect(invalid(page, 'Länge')).toBeUndefined()
      })
    })

    it('takes the error away when the Host fixes it', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Start ab').setValue('1:00')
      await field(page, 'Ende').setValue('0:30')
      expect(invalid(page, 'Länge')).toBe('true')

      await field(page, 'Ende').setValue('1:45')

      expect(valueOf(page, 'Länge')).toBe('45')
      for (const label of ['Start ab', 'Ende', 'Länge']) expect(invalid(page, label)).toBeUndefined()
    })

    it('sends the start and the length only, never Ende', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await field(page, 'Ende').setValue('2:00')
      await field(page, 'Länge').setValue('60')

      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(posted).toHaveBeenCalledWith({
        name: 'Mario Kart', youtubeUrl: '', clipStart: 60, clipLength: 60, playersMin: null, playersMax: null, suitabilities: [], tags: [], notes: '', price: null,
      }))
    })

    it('sends the length that Start and Ende give', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await field(page, 'Start ab').setValue('1:00')
      await field(page, 'Ende').setValue('1:45')

      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(posted).toHaveBeenCalledWith(expect.objectContaining({ clipStart: 60, clipLength: 45 })))
    })

    it('sends nothing while a field shows an error', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await field(page, 'Start ab').setValue('1:00')
      await field(page, 'Ende').setValue('0:30')

      await page.get('form').trigger('submit')

      expect(posted).not.toHaveBeenCalled()
      expect(cta(page).attributes('aria-disabled')).toBe('true')
      expect(page.get('#game-blocker').text()).toBe('Das Ende liegt vor dem Start.')
    })

    it('saves an existing game unchanged, and with the Länge Ende gives', async () => {
      patchedWith.mockClear()
      const page = await mountSuspended(GameForm, { props: { game: saved } })

      await page.get('form').trigger('submit')
      await vi.waitFor(() => expect(patchedWith).toHaveBeenCalledWith(expect.objectContaining({ clipStart: 72, clipLength: 30 })))

      // A saved form takes no second save (#573): the next save needs a form of its own.
      page.unmount()
      patchedWith.mockClear()
      const again = await mountSuspended(GameForm, { props: { game: saved } })
      await field(again, 'Ende').setValue('2:00')
      expect(valueOf(again, 'Länge')).toBe('48')
      await again.get('form').trigger('submit')
      await vi.waitFor(() => expect(patchedWith).toHaveBeenCalledWith(expect.objectContaining({ clipStart: 72, clipLength: 48 })))
    })

    it('opens an old 5 s row with Länge in error and does not save it', async () => {
      const page = await mountSuspended(GameForm, { props: { game: { ...saved, clipLength: 5 } } })

      expect(invalid(page, 'Länge')).toBe('true')
      expect(errorOf(page, 'Länge')).toBe('Die Länge liegt zwischen 10 und 120 Sekunden.')
      expect(valueOf(page, 'Ende')).toBe('1:17')
      expect(cta(page).attributes('aria-disabled')).toBe('true')
    })
  })

  it('says why the game cannot be saved in the error colour', async () => {
    const page = await mountSuspended(GameForm)

    await page.get('form').trigger('submit')

    const blocker = page.get('#game-blocker')
    expect(blocker.text()).toBe('Gib dem Spiel einen Namen.')
    expect(blocker.classes()).toContain('text-error-fg')
    expect(blocker.classes()).not.toContain('text-ink-2')
  })

  it('posts the game and says it is saved', async () => {
    const page = await mountSuspended(GameForm)
    await field(page, 'Name').setValue('  Mario Kart ')
    await field(page, 'YouTube-Link').setValue(LINK)
    await field(page, 'Start ab').setValue('1:12')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[saved]]))
    expect(posted).toHaveBeenCalledWith({ name: 'Mario Kart', youtubeUrl: LINK, clipStart: 72, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [], tags: [], notes: '', price: null })
  })

  it('saves a game without a link and without a clip', async () => {
    const page = await mountSuspended(GameForm)
    await field(page, 'Name').setValue('Brettspiel')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(posted).toHaveBeenCalled())
    expect(posted).toHaveBeenCalledWith({ name: 'Brettspiel', youtubeUrl: '', clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [], tags: [], notes: '', price: null })
  })

  describe('player count and Suitabilities (#142, #171)', () => {
    it('does not promise pool suggestions from the player count and the Suitabilities (#175)', async () => {
      const page = await mountSuspended(GameForm)

      expect(page.text()).not.toContain('nur für Vorschläge beim Pool-Füllen')
    })

    it('posts the player count and the Suitabilities the User picked', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await field(page, 'von').setValue('2')
      await field(page, 'bis').setValue('10')
      await page.get('button[aria-pressed]').trigger('click')

      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(posted).toHaveBeenCalled())
      expect(posted).toHaveBeenCalledWith(expect.objectContaining({ playersMin: 2, playersMax: 10, suitabilities: ['teams'] }))
    })

    it('labels the player count as optional (#458)', async () => {
      const page = await mountSuspended(GameForm)

      expect(page.findAll('legend').map(item => item.text())).toContain('Empfohlene Spielerzahl (optional)')
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

    it('shows „Passt zu“ as three toggles that say whether they are on', async () => {
      const page = await mountSuspended(GameForm)
      const toggle = (label: string) => page.findAll('button').find(button => button.text() === label)!
      expect(page.text()).toContain('Passt zu')

      expect(toggle('Teams').attributes('aria-pressed')).toBe('false')
      await toggle('Teams').trigger('click')
      await toggle('Jeder gegen jeden').trigger('click')
      await toggle('1 gegen 1').trigger('click')
      await toggle('Jeder gegen jeden').trigger('click')

      expect(toggle('Teams').attributes('aria-pressed')).toBe('true')
      expect(toggle('Jeder gegen jeden').attributes('aria-pressed')).toBe('false')
      expect(toggle('1 gegen 1').attributes('aria-pressed')).toBe('true')
    })

    it('posts a game that is 1 gegen 1 with one_v_one', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Street Fighter')
      await page.findAll('button').find(button => button.text() === '1 gegen 1')!.trigger('click')

      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(posted).toHaveBeenCalled())
      expect(posted).toHaveBeenCalledWith(expect.objectContaining({ suitabilities: ['one_v_one'] }))
    })
  })

  describe('game notes (#223)', () => {
    const NOTES_MAX = 1000

    function notesField(page: Page) {
      return field(page, 'Notizen')
    }

    it('takes the notes in a textbox that keeps the line breaks the User types', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      const notes = 'Settings: 3 Runden\nWarmup: Lobby\n\nWin: meiste Punkte'

      expect(notesField(page).element.tagName).toBe('TEXTAREA')
      await notesField(page).setValue(notes)
      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(posted).toHaveBeenCalledWith(expect.objectContaining({ notes })))
    })

    it('shows no counter while the notes are short, and the counter from 800 characters', async () => {
      const page = await mountSuspended(GameForm)

      await notesField(page).setValue('a'.repeat(799))
      expect(page.text()).not.toContain(`/${NOTES_MAX}`)

      await notesField(page).setValue('a'.repeat(800))
      expect(page.text()).toContain(`800/${NOTES_MAX}`)
    })

    it('accepts exactly 1000 characters without a message', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      await notesField(page).setValue('a'.repeat(NOTES_MAX))

      expect(page.text()).not.toContain('Höchstens 1000 Zeichen.')
      expect(cta(page).attributes('aria-disabled')).not.toBe('true')
    })

    it('shows the red message for 1001 characters, blocks saving with the same reason and sends nothing', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      await notesField(page).setValue('a'.repeat(NOTES_MAX + 1))

      const message = page.findAll('span').find(el => el.text() === 'Höchstens 1000 Zeichen.')
      expect(message).toBeDefined()
      expect(message!.classes()).toContain('text-error-fg')
      expect(notesField(page).attributes('aria-invalid')).toBe('true')
      expect(cta(page).attributes('aria-disabled')).toBe('true')
      expect(page.get(`[id="${cta(page).attributes('aria-describedby')}"]`).text()).toBe('Höchstens 1000 Zeichen.')

      await page.get('form').trigger('submit')

      expect(posted).not.toHaveBeenCalled()
    })

    it('counts an emoji once: 999 letters and one family emoji are no problem', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      await notesField(page).setValue(`${'a'.repeat(999)}\u{1F468}‍\u{1F469}‍\u{1F467}`)

      expect(page.text()).not.toContain('Höchstens 1000 Zeichen.')
      expect(cta(page).attributes('aria-disabled')).not.toBe('true')
    })

    it('shows the notes of a game being edited and saves them with PATCH', async () => {
      patchedWith.mockClear()
      const page = await mountSuspended(GameForm, { props: { game: { ...saved, notes: 'Settings: 3 Runden\nWin: Punkte' } } })

      expect((notesField(page).element as HTMLTextAreaElement).value).toBe('Settings: 3 Runden\nWin: Punkte')

      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(patchedWith).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Settings: 3 Runden\nWin: Punkte' })))
    })

    it('marks the notes field as one that grows with its text', async () => {
      const page = await mountSuspended(GameForm)

      expect(notesField(page).classes()).toContain('field-sizing-content')
    })

    it('sets the height from the text where the browser cannot size the field itself', async () => {
      vi.stubGlobal('CSS', { supports: () => false })
      try {
        const page = await mountSuspended(GameForm)
        const area = notesField(page)
        Object.defineProperty(area.element, 'scrollHeight', { value: 120, configurable: true })

        await area.setValue('Zeile\nZeile\nZeile\nZeile\nZeile\nZeile')

        expect((area.element as HTMLTextAreaElement).style.height).toBe('124px')
      }
      finally {
        vi.unstubAllGlobals()
      }
    })

    it('leaves the height to the browser where it sizes the field itself', async () => {
      vi.stubGlobal('CSS', { supports: () => true })
      try {
        const page = await mountSuspended(GameForm)
        const area = notesField(page)
        Object.defineProperty(area.element, 'scrollHeight', { value: 120, configurable: true })

        await area.setValue('Zeile\nZeile\nZeile\nZeile\nZeile\nZeile')

        expect((area.element as HTMLTextAreaElement).style.height).toBe('')
      }
      finally {
        vi.unstubAllGlobals()
      }
    })
  })

  describe('Tags (#335)', () => {
    const flag = '\u{1F1E9}\u{1F1EA}'

    function tagsField(page: Page) {
      return field(page, 'Tags')
    }

    /** The chips, by the accessible name of their remove button. */
    function chips(page: Page) {
      return page.findAll('button')
        .map(button => /^Tag „(.*)“ entfernen$/.exec(button.attributes('aria-label') ?? '')?.[1])
        .filter((label): label is string => label !== undefined)
    }

    function removeButton(page: Page, label: string) {
      return page.get(`button[aria-label="Tag „${label}“ entfernen"]`)
    }

    function options(page: Page) {
      return page.findAll('[role="listbox"] [role="option"]').map(option => option.text())
    }

    async function type(page: Page, text: string) {
      await tagsField(page).setValue(text)
    }

    async function enter(page: Page) {
      await tagsField(page).trigger('keydown', { key: 'Enter' })
    }

    async function addTag(page: Page, text: string) {
      await type(page, text)
      await enter(page)
    }

    /** The suggestions come from `/api/games/tags`, which loads after the form mounts. */
    async function withSuggestions(page: Page, text: string) {
      await type(page, text)
      await vi.waitFor(() => expect(page.find('[role="listbox"]').exists()).toBe(true))
    }

    it('puts the field „Tags“ after „Passt zu“ and before „Notizen“', async () => {
      const page = await mountSuspended(GameForm)

      const teams = page.findAll('button').find(button => button.text() === 'Teams')!.element
      const tags = tagsField(page).element
      const notes = field(page, 'Notizen').element
      expect(teams.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(tags.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(page.text()).toContain('Enter oder Komma fügt einen Tag hinzu.')
    })

    it('shows the Free-to-play hint under the Tags field, before the Preis group (#423)', async () => {
      const page = await mountSuspended(GameForm)

      const hint = page.findAll('p').find(paragraph => paragraph.text() === 'Ohne Preis bekommt das Spiel den Tag „Free-to-play“.')!.element
      const tags = tagsField(page).element
      const price = page.findAll('fieldset').find(set => set.find('legend').exists() && set.find('legend').text() === 'Preis')!.element
      expect(tags.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(hint.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('adds a chip with Enter and empties the field, and Enter does not save the game', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await type(page, 'Party')

      const keydown = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      tagsField(page).element.dispatchEvent(keydown)
      await nextTick()

      expect(keydown.defaultPrevented).toBe(true)
      expect(chips(page)).toEqual(['Party'])
      expect((tagsField(page).element as HTMLInputElement).value).toBe('')
      expect(posted).not.toHaveBeenCalled()
    })

    it('does not treat Enter during an IME composition as a confirmation', async () => {
      const page = await mountSuspended(GameForm)
      await type(page, 'Party')

      await tagsField(page).trigger('keydown', { key: 'Enter', isComposing: true })

      expect(chips(page)).toEqual([])
    })

    it('adds a chip at a comma, and keeps the text after the last comma', async () => {
      const page = await mountSuspended(GameForm)

      await type(page, 'Party,')
      expect(chips(page)).toEqual(['Party'])
      expect((tagsField(page).element as HTMLInputElement).value).toBe('')

      await type(page, 'a, b,c')
      expect(chips(page)).toEqual(['Party', 'a', 'b'])
      expect((tagsField(page).element as HTMLInputElement).value).toBe('c')
    })

    it('removes the last chip with Backspace on an empty field, and only edits the text otherwise', async () => {
      const page = await mountSuspended(GameForm)
      await addTag(page, 'Party')
      await addTag(page, 'Retro')

      await type(page, 'Co')
      await tagsField(page).trigger('keydown', { key: 'Backspace' })
      expect(chips(page)).toEqual(['Party', 'Retro'])

      await type(page, '')
      await tagsField(page).trigger('keydown', { key: 'Backspace' })
      expect(chips(page)).toEqual(['Party'])
    })

    it('removes the chip whose button is named for it', async () => {
      const page = await mountSuspended(GameForm)
      await addTag(page, 'Party')
      await addTag(page, 'Retro')

      await removeButton(page, 'Party').trigger('click')

      expect(chips(page)).toEqual(['Retro'])
    })

    it('adds nothing for whitespace, and no second chip for another spelling of a chip', async () => {
      const page = await mountSuspended(GameForm)

      await addTag(page, '   ')
      expect(chips(page)).toEqual([])
      expect(page.text()).not.toContain('Höchstens')

      await addTag(page, 'Party')
      await addTag(page, 'party')
      expect(chips(page)).toEqual(['Party'])
      expect((tagsField(page).element as HTMLInputElement).value).toBe('')
    })

    describe('suggestions', () => {
      it('lists the Tags in use that contain the text, in a listbox, and not the others', async () => {
        const page = await mountSuspended(GameForm)

        await withSuggestions(page, 'co')

        expect(options(page)).toEqual(['Co-op', 'Coop-Klassiker'])
        expect(page.get('[role="listbox"]').attributes('aria-label')).toBe('Vorschläge')
        expect(tagsField(page).attributes('role')).toBe('combobox')
      })

      it('puts prefix matches before the others', async () => {
        const page = await mountSuspended(GameForm)

        await withSuggestions(page, 'op')

        expect(options(page)).toEqual(['Co-op', 'Coop-Klassiker'])
        // „r“ starts Retro and sits inside Coop-Klassiker: the prefix match comes first although it is last in the list.
        await type(page, 'r')
        expect(options(page)).toEqual(['Retro', 'Coop-Klassiker'])
      })

      it('moves through them with the arrow keys and adds the active one with Enter', async () => {
        const page = await mountSuspended(GameForm)
        await withSuggestions(page, 'co')

        await tagsField(page).trigger('keydown', { key: 'ArrowDown' })
        await tagsField(page).trigger('keydown', { key: 'ArrowDown' })
        expect(page.findAll('[role="option"]')[1]!.attributes('aria-selected')).toBe('true')
        await enter(page)

        expect(chips(page)).toEqual(['Coop-Klassiker'])
        expect((tagsField(page).element as HTMLInputElement).value).toBe('')
      })

      it('wraps around at both ends', async () => {
        const page = await mountSuspended(GameForm)
        await withSuggestions(page, 'co')

        await tagsField(page).trigger('keydown', { key: 'ArrowUp' })
        expect(page.findAll('[role="option"]')[1]!.attributes('aria-selected')).toBe('true')
        await tagsField(page).trigger('keydown', { key: 'ArrowDown' })
        expect(page.findAll('[role="option"]')[0]!.attributes('aria-selected')).toBe('true')
      })

      it('adds the option that is clicked', async () => {
        const page = await mountSuspended(GameForm)
        await withSuggestions(page, 'co')

        await page.findAll('[role="option"]')[0]!.trigger('click')

        expect(chips(page)).toEqual(['Co-op'])
      })

      it('closes with Escape and keeps the text', async () => {
        const page = await mountSuspended(GameForm)
        await withSuggestions(page, 'co')

        await tagsField(page).trigger('keydown', { key: 'Escape' })

        expect(page.find('[role="listbox"]').exists()).toBe(false)
        expect((tagsField(page).element as HTMLInputElement).value).toBe('co')
      })

      it('does not offer a Tag that is already a chip', async () => {
        const page = await mountSuspended(GameForm)
        await withSuggestions(page, 'co')
        await page.findAll('[role="option"]')[0]!.trigger('click')

        await type(page, 'co')

        expect(options(page)).toEqual(['Coop-Klassiker'])
      })

      it('shows a Tag typed in capitals under the spelling in use', async () => {
        const page = await mountSuspended(GameForm)
        await withSuggestions(page, 'CO-OP')

        await enter(page)

        expect(chips(page)).toEqual(['Co-op'])
      })

      it('shows no list for text that matches nothing', async () => {
        const page = await mountSuspended(GameForm)
        await withSuggestions(page, 'co')

        await type(page, 'zzz')

        expect(page.find('[role="listbox"]').exists()).toBe(false)
      })

      it('gets its suggestions from the Tags in use, and does not load the library (#365)', async () => {
        const page = await mountSuspended(GameForm)

        await withSuggestions(page, 'co')

        expect(options(page)).toEqual(['Co-op', 'Coop-Klassiker'])
        expect(libraryRequested).not.toHaveBeenCalled()
      })

      it('offers no list and no error while no Tag is in use yet (#365)', async () => {
        tagsInUse = []
        const page = await mountSuspended(GameForm)
        await vi.waitFor(() => expect(tagsRequested).toHaveBeenCalled())
        await flushPromises()

        await type(page, 'co')

        expect(page.find('[role="listbox"]').exists()).toBe(false)
        expect(tagsField(page).attributes('aria-invalid')).toBeUndefined()
      })

      it('offers the one Tag in use as the only option (#365)', async () => {
        tagsInUse = [{ key: 'co-op', label: 'Co-op' }]
        const page = await mountSuspended(GameForm)

        await withSuggestions(page, 'co')

        expect(options(page)).toEqual(['Co-op'])
      })
    })

    describe('limits', () => {
      it('shows „Höchstens 20 Zeichen“ at once for 21 characters and adds nothing, and takes 20 flags', async () => {
        const page = await mountSuspended(GameForm)

        await type(page, 'x'.repeat(21))
        expect(page.text()).toContain('Höchstens 20 Zeichen')
        expect(tagsField(page).attributes('aria-invalid')).toBe('true')
        await enter(page)
        expect(chips(page)).toEqual([])

        await type(page, flag.repeat(20))
        expect(page.text()).not.toContain('Höchstens 20 Zeichen')
        await enter(page)
        expect(chips(page)).toEqual([flag.repeat(20)])
      })

      it('refuses a ninth Tag with „Höchstens 8 Tags“ and clears the message when a chip is removed', async () => {
        const page = await mountSuspended(GameForm)
        for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) await addTag(page, name)

        await addTag(page, 'i')

        expect(chips(page)).toHaveLength(8)
        expect(page.text()).toContain('Höchstens 8 Tags')
        expect((tagsField(page).element as HTMLInputElement).value).toBe('i')

        await removeButton(page, 'a').trigger('click')

        expect(page.text()).not.toContain('Höchstens 8 Tags')
        expect(chips(page)).toHaveLength(7)
      })
    })

    describe('saving', () => {
      it('posts the Tags as labels in chip order', async () => {
        const page = await mountSuspended(GameForm)
        await field(page, 'Name').setValue('Mario Kart')
        await addTag(page, 'Retro')
        await addTag(page, 'Co-op')

        await page.get('form').trigger('submit')

        await vi.waitFor(() => expect(posted).toHaveBeenCalledWith(expect.objectContaining({ tags: ['Retro', 'Co-op'] })))
      })

      it('sends a Tag that was typed and not confirmed', async () => {
        const page = await mountSuspended(GameForm)
        await field(page, 'Name').setValue('Mario Kart')
        await addTag(page, 'Retro')
        await type(page, 'Party')

        await page.get('form').trigger('submit')

        await vi.waitFor(() => expect(posted).toHaveBeenCalledWith(expect.objectContaining({ tags: ['Retro', 'Party'] })))
      })

      it('does not save while the typed Tag is too long', async () => {
        const page = await mountSuspended(GameForm)
        await field(page, 'Name').setValue('Mario Kart')
        await type(page, 'x'.repeat(21))

        await page.get('form').trigger('submit')

        expect(posted).not.toHaveBeenCalled()
        expect(page.text()).toContain('Höchstens 20 Zeichen')
      })

      it('prefills the chips of the game when editing, and PATCHes them', async () => {
        patchedWith.mockClear()
        const existing: GameView = { ...saved, tags: [{ key: 'co-op', label: 'Co-op' }, { key: 'retro', label: 'Retro' }] }
        const page = await mountSuspended(GameForm, { props: { game: existing } })
        expect(chips(page)).toEqual(['Co-op', 'Retro'])

        await removeButton(page, 'Co-op').trigger('click')
        await page.get('form').trigger('submit')

        await vi.waitFor(() => expect(patchedWith).toHaveBeenCalledWith(expect.objectContaining({ tags: ['Retro'] })))
      })
    })

    // Each chip wears a Team colour by its key (#427); `tag-colors.test.ts` pins „retro“ and „indie“ at 7 of their own.
    describe('chip colours (#427)', () => {
      const chipStyle = (page: Page, label: string) => removeButton(page, label).element.parentElement!.getAttribute('style') ?? ''

      it('colours each chip as it is added, the next free colour for a Tag whose own an earlier chip wears', async () => {
        const page = await mountSuspended(GameForm)
        await addTag(page, 'Retro')
        expect(chipStyle(page, 'Retro')).toContain('var(--cp-team-7)')
        expect(chipStyle(page, 'Retro')).toContain('var(--cp-team-7-ink)')

        await addTag(page, 'Indie')
        expect(chipStyle(page, 'Indie')).toContain('var(--cp-team-8)')
      })

      it('recolours the chips when one is removed', async () => {
        const existing: GameView = { ...saved, tags: [{ key: 'retro', label: 'Retro' }, { key: 'indie', label: 'Indie' }] }
        const page = await mountSuspended(GameForm, { props: { game: existing } })
        expect(chipStyle(page, 'Indie')).toContain('var(--cp-team-8)')

        await removeButton(page, 'Retro').trigger('click')

        expect(chipStyle(page, 'Indie')).toContain('var(--cp-team-7)')
      })
    })
  })

  describe('edit mode (#142)', () => {
    const existing: GameView = {
      ...saved,
      name: 'Counter-Strike 2',
      playersMin: 2,
      playersMax: 10,
      suitabilities: ['teams'],
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
      expect(patchedWith).toHaveBeenCalledWith(expect.objectContaining({ name: 'Counter-Strike 2', playersMin: 2, playersMax: 10, suitabilities: ['teams'] }))
      expect(posted).not.toHaveBeenCalled()
    })
  })

  describe('Price (#337)', () => {
    const checkedAt = '2026-11-03T10:00:00.000Z'
    const stored: GameView = { ...saved, price: { cents: 1999, source: 'steam', checkedAt } }

    beforeEach(() => {
      patchPrice = null
      patchRefusedWith = null
      patchedWith.mockClear()
    })

    function priceGroup(page: Page) {
      const group = page.findAll('fieldset').find(set => set.find('legend').exists() && set.find('legend').text() === 'Preis')
      if (!group) throw new Error('no group „Preis“')
      return group
    }

    function amount(page: Page) {
      return field(page, 'Betrag in €')
    }

    function source(page: Page) {
      return field(page, 'Wo gibt’s das Spiel?')
    }

    function confirmButton(page: Page) {
      return page.findAll('button').find(button => button.text() === 'Preis stimmt noch')
    }

    function removeButton(page: Page) {
      return page.findAll('button').find(button => button.text() === 'Preis entfernen')
    }

    const RANGE = 'Zwischen 0,01 € und 999,99 €'

    it('puts the group „Preis“ after the „Tags“ field and before „Notizen“', async () => {
      const page = await mountSuspended(GameForm)

      const group = priceGroup(page).element
      const tags = field(page, 'Tags').element
      const notes = field(page, 'Notizen').element
      expect(tags.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(group.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('posts an amount with its source in cents', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await amount(page).setValue('19,99')
      await source(page).setValue('steam')

      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(posted).toHaveBeenCalledWith(expect.objectContaining({ price: { cents: 1999, source: 'steam' } })))
    })

    it('posts no Price when neither the amount nor the source is filled', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(posted).toHaveBeenCalledWith(expect.objectContaining({ price: null })))
    })

    it('refuses an amount without a source, sends nothing, and clears the message once a source is chosen', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await amount(page).setValue('19,99')

      await page.get('form').trigger('submit')

      expect(page.text()).toContain('Bitte eine Quelle wählen')
      expect(posted).not.toHaveBeenCalled()

      await source(page).setValue('steam')

      expect(page.text()).not.toContain('Bitte eine Quelle wählen')
    })

    it.each(['0', '1000', 'abc'])('shows the range at once for the amount „%s“ and posts nothing', async (text) => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await source(page).setValue('steam')

      await amount(page).setValue(text)

      expect(page.text()).toContain(RANGE)
      expect(amount(page).attributes('aria-invalid')).toBe('true')
      expect(cta(page).attributes('aria-disabled')).toBe('true')
      await page.get('form').trigger('submit')
      expect(posted).not.toHaveBeenCalled()
    })

    it('asks for the amount of a paid source only after a save attempt', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await source(page).setValue('epic')
      expect(page.text()).not.toContain(RANGE)

      await page.get('form').trigger('submit')

      expect(page.text()).toContain(RANGE)
      expect(posted).not.toHaveBeenCalled()
    })

    it('disables and empties the amount for Free-to-play and posts the source without an amount', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await amount(page).setValue('19,99')

      await source(page).setValue('free_to_play')

      expect((amount(page).element as HTMLInputElement).disabled).toBe(true)
      expect((amount(page).element as HTMLInputElement).value).toBe('')
      await page.get('form').trigger('submit')
      await vi.waitFor(() => expect(posted).toHaveBeenCalledWith(expect.objectContaining({ price: { cents: null, source: 'free_to_play' } })))
    })

    it('disables and empties the amount for Abo and posts the source without an amount', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await amount(page).setValue('5')

      await source(page).setValue('subscription')

      expect((amount(page).element as HTMLInputElement).disabled).toBe(true)
      expect((amount(page).element as HTMLInputElement).value).toBe('')
      await page.get('form').trigger('submit')
      await vi.waitFor(() => expect(posted).toHaveBeenCalledWith(expect.objectContaining({ price: { cents: null, source: 'subscription' } })))
    })

    it('prefills the amount and the source of a game with a Price, and saves them with PATCH', async () => {
      const page = await mountSuspended(GameForm, { props: { game: stored } })

      expect((amount(page).element as HTMLInputElement).value).toBe('19,99')
      expect((source(page).element as HTMLSelectElement).value).toBe('steam')
      expect(page.text()).toContain('Stand: 3. November 2026')
      expect(confirmButton(page)).toBeDefined()

      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(patchedWith).toHaveBeenCalledWith(expect.objectContaining({ price: { cents: 1999, source: 'steam' } })))
    })

    it('„Preis stimmt noch“ sends only the flag, and moves the day without saving', async () => {
      patchPrice = { cents: 1999, source: 'steam', checkedAt: '2026-11-09T08:00:00.000Z' }
      const page = await mountSuspended(GameForm, { props: { game: stored } })
      await field(page, 'Name').setValue('Umbenannt')

      await confirmButton(page)!.trigger('click')

      await vi.waitFor(() => expect(page.text()).toContain('Stand: 9. November 2026'))
      expect(patchedWith).toHaveBeenCalledTimes(1)
      expect(patchedWith.mock.lastCall![0]).toEqual({ priceChecked: true })
      expect(page.emitted('saved')).toBeUndefined()
      expect(useState<{ text: string }[]>('toasts').value.map(item => item.text)).toContain('Preis bestätigt')
    })

    it('„Preis stimmt noch“ sends exactly the flag for a game with no link and every other field set', async () => {
      patchPrice = { cents: 1999, source: 'steam', checkedAt: '2026-11-09T08:00:00.000Z' }
      const full: GameView = { ...stored, youtubeId: null, playersMin: 2, playersMax: 8, suitabilities: ['teams'], notes: 'Notiz' }
      const page = await mountSuspended(GameForm, { props: { game: full } })

      await confirmButton(page)!.trigger('click')

      await vi.waitFor(() => expect(page.text()).toContain('Stand: 9. November 2026'))
      expect(patchedWith).toHaveBeenCalledTimes(1)
      expect(patchedWith.mock.lastCall![0]).toEqual({ priceChecked: true })
    })

    it('removes the Price on a click: both fields empty, and the next save sends null in edit mode', async () => {
      const page = await mountSuspended(GameForm, { props: { game: stored } })

      await removeButton(page)!.trigger('click')

      expect((amount(page).element as HTMLInputElement).value).toBe('')
      expect((source(page).element as HTMLSelectElement).value).toBe('')
      await page.get('form').trigger('submit')
      await vi.waitFor(() => expect(patchedWith).toHaveBeenCalledWith(expect.objectContaining({ price: null })))
    })

    it('shows the reason a refused „Preis stimmt noch“ in the banner, and keeps the line', async () => {
      patchRefusedWith = 'invalid_price'
      const page = await mountSuspended(GameForm, { props: { game: stored } })

      await confirmButton(page)!.trigger('click')

      await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toBe('Der Preis braucht eine Quelle und einen Betrag von 0,01 € bis 999,99 €. Bei Free-to-play und Abo gibt es keinen Betrag.'))
      expect(page.text()).toContain('Stand: 3. November 2026')
    })
  })

  it('shows what the server refused with', async () => {
    failWith = 'invalid_clip'
    const page = await mountSuspended(GameForm)
    await field(page, 'Name').setValue('Mario Kart')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toBe('Der Clip passt nicht: Die Länge liegt zwischen 10 und 120 Sekunden.'))
    expect(page.emitted('saved')).toBeUndefined()
  })

  describe('Speichern und noch eins (#456)', () => {
    beforeEach(() => {
      holdPost = null
    })

    function saveAndNextButton(page: Page) {
      return page.findAll('button').find(button => button.text().trim() === 'Speichern und noch eins')
    }

    it('shows „Speichern und noch eins“ after the create button, as a button that does not submit', async () => {
      const page = await mountSuspended(GameForm, { props: { saveAndNext: true } })

      const buttons = page.findAll('button')
      const next = buttons.findIndex(button => button.text().trim() === 'Speichern und noch eins')
      const primary = buttons.findIndex(button => button.attributes('type') === 'submit')
      expect(buttons[next]!.attributes('type')).toBe('button')
      expect(next).toBe(primary + 1)
    })

    it('is absent on edit, even when the form is asked for it', async () => {
      const page = await mountSuspended(GameForm, { props: { game: saved, saveAndNext: true } })

      expect(saveAndNextButton(page)).toBeUndefined()
    })

    it('is absent where the form is not asked for it, as in the stepper\'s sheet', async () => {
      const page = await mountSuspended(GameForm)

      expect(saveAndNextButton(page)).toBeUndefined()
    })

    it('saves with it and emits savedAndNext with the game, never saved', async () => {
      const page = await mountSuspended(GameForm, { props: { saveAndNext: true } })
      await field(page, 'Name').setValue('Mario Kart')

      await saveAndNextButton(page)!.trigger('click')

      await vi.waitFor(() => expect(page.emitted('savedAndNext')).toEqual([[saved]]))
      expect(page.emitted('saved')).toBeUndefined()
      expect(posted).toHaveBeenCalledTimes(1)
      expect(posted).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mario Kart' }))
    })

    it('emits saved with the game for „Spiel anlegen“, never savedAndNext', async () => {
      const page = await mountSuspended(GameForm, { props: { saveAndNext: true } })
      await field(page, 'Name').setValue('Mario Kart')

      expect(cta(page).text()).toContain('Spiel anlegen')
      // „Spiel anlegen“ is the form's submit button; the form is submitted as the other form tests do.
      await page.get('form').trigger('submit')

      await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[saved]]))
      expect(page.emitted('savedAndNext')).toBeUndefined()
    })

    it('keeps every field and shows the server\'s reason when the save fails', async () => {
      failWith = 'invalid_clip'
      const page = await mountSuspended(GameForm, { props: { saveAndNext: true } })
      await field(page, 'Name').setValue('Mario Kart')
      await field(page, 'YouTube-Link').setValue(LINK)

      await saveAndNextButton(page)!.trigger('click')

      await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toBe('Der Clip passt nicht: Die Länge liegt zwischen 10 und 120 Sekunden.'))
      expect((field(page, 'Name').element as HTMLInputElement).value).toBe('Mario Kart')
      expect((field(page, 'YouTube-Link').element as HTMLInputElement).value).toBe(LINK)
      expect(page.emitted('savedAndNext')).toBeUndefined()
    })

    it('blocks with the name message and sends nothing while the name is empty, both buttons aria-disabled', async () => {
      const page = await mountSuspended(GameForm, { props: { saveAndNext: true } })

      await saveAndNextButton(page)!.trigger('click')

      expect(posted).not.toHaveBeenCalled()
      expect(page.text()).toContain('Gib dem Spiel einen Namen.')
      expect(saveAndNextButton(page)!.attributes('aria-disabled')).toBe('true')
      expect(cta(page).attributes('aria-disabled')).toBe('true')
    })

    it('does not send twice while a save runs, and shows both buttons as disabled meanwhile', async () => {
      let release = () => {}
      holdPost = new Promise<void>((resolve) => {
        release = resolve
      })
      const page = await mountSuspended(GameForm, { props: { saveAndNext: true } })
      await field(page, 'Name').setValue('Mario Kart')

      await saveAndNextButton(page)!.trigger('click')
      await saveAndNextButton(page)!.trigger('click')

      await vi.waitFor(() => expect(posted).toHaveBeenCalledTimes(1))
      expect(saveAndNextButton(page)!.attributes('aria-disabled')).toBe('true')
      expect(cta(page).attributes('aria-disabled')).toBe('true')
      expect(cta(page).text()).toContain('Speichert …')

      release()
      await vi.waitFor(() => expect(page.emitted('savedAndNext')).toEqual([[saved]]))
      expect(posted).toHaveBeenCalledTimes(1)
    })

    it('takes the focus on the name when it mounts with focusName', async () => {
      const page = await mountSuspended(GameForm, { props: { saveAndNext: true, focusName: true }, attachTo: document.body })

      expect(document.activeElement).toBe(field(page, 'Name').element)
      page.unmount()
    })

    it('does not take the focus on the name without focusName', async () => {
      const page = await mountSuspended(GameForm, { props: { saveAndNext: true }, attachTo: document.body })

      expect(document.activeElement).not.toBe(field(page, 'Name').element)
      page.unmount()
    })
  })

  describe('Strg + Enter (#465)', () => {
    afterEach(() => {
      holdPost = null
    })

    /** A keydown Enter with the given modifiers on the element; the event tells whether the form prevented it. */
    function enter(el: Element, init: KeyboardEventInit = { ctrlKey: true }) {
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init })
      el.dispatchEvent(event)
      return event
    }

    it('saves from the name with Ctrl + Enter', async () => {
      const page = await mountSuspended(GameForm, { props: { saveAndNext: true } })
      await field(page, 'Name').setValue('Mario Kart')

      enter(field(page, 'Name').element)

      await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[saved]]))
      expect(posted).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mario Kart' }))
      expect(page.emitted('savedAndNext')).toBeUndefined()
    })

    it('saves from the name with Meta + Enter', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      enter(field(page, 'Name').element, { metaKey: true })

      await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[saved]]))
    })

    it('saves from Notizen with Ctrl + Enter and types no line break, while a bare Enter there is left alone', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      const notes = field(page, 'Notizen').element

      expect(enter(notes, {}).defaultPrevented).toBe(false)
      await flushPromises()
      expect(posted).not.toHaveBeenCalled()

      expect(enter(notes).defaultPrevented).toBe(true)
      await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[saved]]))
    })

    it('saves from Notizen with Meta + Enter too and types no line break', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      expect(enter(field(page, 'Notizen').element, { metaKey: true }).defaultPrevented).toBe(true)

      await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[saved]]))
      expect(posted).toHaveBeenCalledTimes(1)
    })

    it('saves from the number field „von“ with Meta + Enter too', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await field(page, 'von').setValue('2')

      enter(field(page, 'von').element, { metaKey: true })

      await vi.waitFor(() => expect(posted).toHaveBeenCalledWith(expect.objectContaining({ playersMin: 2 })))
    })

    it('saves from the number field „von“', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await field(page, 'von').setValue('2')

      enter(field(page, 'von').element)

      await vi.waitFor(() => expect(posted).toHaveBeenCalledWith(expect.objectContaining({ playersMin: 2 })))
    })

    it('saves from the Tag field with a typed Tag, once', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      await field(page, 'Tags').setValue('Party')

      const event = enter(field(page, 'Tags').element)

      expect(event.defaultPrevented).toBe(true)
      await vi.waitFor(() => expect(posted).toHaveBeenCalledTimes(1))
      expect(posted).toHaveBeenCalledWith(expect.objectContaining({ tags: ['Party'] }))
    })

    it('saves nothing while blocked: shows the name error and posts nothing', async () => {
      const page = await mountSuspended(GameForm, { props: { saveAndNext: true } })

      enter(field(page, 'Name').element)

      await vi.waitFor(() => expect(page.text()).toContain('Gib dem Spiel einen Namen.'))
      expect(posted).not.toHaveBeenCalled()
      expect(page.emitted('saved')).toBeUndefined()
    })

    it('saves nothing while a save runs: two presses, one POST', async () => {
      let release = () => {}
      holdPost = new Promise<void>((resolve) => {
        release = resolve
      })
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      enter(field(page, 'Name').element)
      enter(field(page, 'Name').element)

      await vi.waitFor(() => expect(posted).toHaveBeenCalledTimes(1))
      release()
      await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[saved]]))
      expect(posted).toHaveBeenCalledTimes(1)
    })

    // #573: the form has told the page that the game is saved, the page is still busy (a reload, a route change) and nothing has
    // replaced the form: it must not post the same game again. A test that saves twice on one mounted form mounts again.
    it('takes no second save after a success', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      enter(field(page, 'Name').element)
      await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[saved]]))
      enter(field(page, 'Name').element)
      await page.get('form').trigger('submit')
      await flushPromises()

      expect(posted).toHaveBeenCalledTimes(1)
      expect(cta(page).text()).toContain('Speichert …')
      expect(cta(page).attributes('aria-disabled')).toBe('true')
    })

    it('takes no second save after „Speichern und noch eins“ either, by click or by Strg + Enter', async () => {
      const page = await mountSuspended(GameForm, { props: { saveAndNext: true } })
      await field(page, 'Name').setValue('Mario Kart')
      const next = () => page.findAll('button').find(button => button.text().trim() === 'Speichern und noch eins')!

      await next().trigger('click')
      await vi.waitFor(() => expect(page.emitted('savedAndNext')).toEqual([[saved]]))
      await next().trigger('click')
      enter(field(page, 'Name').element)
      await flushPromises()

      expect(posted).toHaveBeenCalledTimes(1)
      expect(next().attributes('aria-disabled')).toBe('true')
      expect(cta(page).attributes('aria-disabled')).toBe('true')
      expect(page.emitted('saved')).toBeUndefined()
    })

    // Guard: passes before the fix; it pins that a failure frees the form.
    it('a failed save frees the form', async () => {
      failWith = 'invalid_clip'
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      enter(field(page, 'Name').element)
      await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toBe('Der Clip passt nicht: Die Länge liegt zwischen 10 und 120 Sekunden.'))
      failWith = null
      enter(field(page, 'Name').element)

      await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[saved]]))
      expect(posted).toHaveBeenCalledTimes(2)
    })

    it('a held key saves nothing, and is swallowed like the first press', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      expect(enter(field(page, 'Name').element, { ctrlKey: true, repeat: true }).defaultPrevented).toBe(true)
      await flushPromises()
      expect(posted).not.toHaveBeenCalled()

      enter(field(page, 'Name').element)
      await vi.waitFor(() => expect(page.emitted('saved')).toEqual([[saved]]))
      expect(posted).toHaveBeenCalledTimes(1)
    })

    it('a held key after a failed save posts nothing more: the repeat rule stops it, not a lock', async () => {
      failWith = 'invalid_clip'
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')

      enter(field(page, 'Name').element)
      await vi.waitFor(() => expect(page.get('[role="alert"]').text()).toContain('Der Clip passt nicht'))
      for (let press = 0; press < 3; press++) enter(field(page, 'Name').element, { ctrlKey: true, repeat: true })
      await flushPromises()

      expect(posted).toHaveBeenCalledTimes(1)
    })

    it('leaves Shift + Ctrl + Enter, Alt + Ctrl + Enter and an IME composition alone', async () => {
      const page = await mountSuspended(GameForm)
      await field(page, 'Name').setValue('Mario Kart')
      const name = field(page, 'Name').element

      const events = [
        enter(name, { ctrlKey: true, shiftKey: true }),
        enter(name, { ctrlKey: true, altKey: true }),
        enter(name, { ctrlKey: true, isComposing: true }),
      ]

      expect(events.map(event => event.defaultPrevented)).toEqual([false, false, false])
      await flushPromises()
      expect(posted).not.toHaveBeenCalled()
    })

    describe('the hint (#465)', () => {
      const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
      const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

      function userAgent(ua: string) {
        Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => ua })
      }

      /** A fine pointer (a mouse) or none (a phone): what the page's media query answers. */
      function finePointer(isFine: boolean) {
        vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
          matches: isFine && query === FINE_POINTER_QUERY,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList)
      }

      function hintButton(page: Page) {
        return page.findAll('button').find(button => button.attributes('aria-label') === 'Hinweis anzeigen')
      }

      afterEach(() => {
        vi.restoreAllMocks()
        delete (window.navigator as unknown as Record<string, unknown>).userAgent
      })

      it('shows the hint with a fine pointer, and it says „Strg + Enter speichert“ on a PC', async () => {
        userAgent(PC_UA)
        finePointer(true)
        const page = await mountSuspended(GameForm)
        await flushPromises()

        await hintButton(page)!.trigger('click')

        expect(document.querySelector('[role="note"]')?.textContent).toContain('Strg + Enter speichert')
        expect(posted).not.toHaveBeenCalled()
        page.unmount()
      })

      it('says „⌘ + Enter speichert“ on a Mac', async () => {
        userAgent(MAC_UA)
        finePointer(true)
        const page = await mountSuspended(GameForm)
        await flushPromises()

        await hintButton(page)!.trigger('click')

        expect(document.querySelector('[role="note"]')?.textContent).toContain('⌘ + Enter speichert')
        page.unmount()
      })

      it('shows no hint without a fine pointer', async () => {
        userAgent(PC_UA)
        finePointer(false)
        const page = await mountSuspended(GameForm)
        await flushPromises()

        expect(hintButton(page)).toBeUndefined()
        page.unmount()
      })
    })
  })
})
