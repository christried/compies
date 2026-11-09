import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PriceField from '~/components/PriceField.vue'
import type { GamePrice, GameView } from '~~/shared/game'
import { kitty, signInAs } from './auth'

// The Price group of the game form (#361): the field alone. The form's outcome (the body, the CTA, the order) stays in
// game-form.test.ts; here the field's own text, roles, PATCH and events.
const GAME_ID = '00000000-0000-4000-8000-0000000000a1'
const checkedAt = '2026-11-03T10:00:00.000Z'
const stored: GamePrice = { cents: 1999, source: 'steam', checkedAt }

// The confirm answers with the Price the server stamped (#337, #360).
let patchPrice: GamePrice | null = stored
let patchFailWith: string | null = null
const patchedWith = vi.fn()
registerEndpoint(`/api/games/${GAME_ID}`, {
  method: 'PATCH',
  handler: async (event) => {
    const body = await readBody(event)
    patchedWith(body)
    if (patchFailWith) throw createError({ statusCode: 400, statusMessage: patchFailWith })
    const game: GameView = { id: GAME_ID, name: 'Mario Kart', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: null, playersMax: null, suitabilities: [], createdBy: { id: kitty.id, name: 'Kitty' }, createdAt: '2026-10-28T10:00:00.000Z', canEdit: true, notes: null, tags: [], price: patchPrice }
    return game
  },
})
// The confirm refreshes the library and the game's page; they must run, but their answers do not matter here.
registerEndpoint('/api/games', {
  method: 'GET',
  handler: () => ({ games: [], tagsInUse: [] }),
})

type Page = VueWrapper

function field(page: Page, label: string) {
  const labelEl = page.findAll('label').find(el => el.text() === label)
  if (!labelEl) throw new Error(`no field "${label}"`)
  return page.get(`[id="${labelEl.attributes('for')}"]`)
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

/** The last value the field wrote into the model (`v-model`), or undefined when it never wrote one. */
function lastModel(page: Page) {
  return page.emitted<[unknown]>('update:modelValue')?.at(-1)?.[0]
}

/** The last blocker the field reported, null when none is shown. */
function lastError(page: Page): string | null {
  return page.emitted<[string | null]>('error')?.at(-1)?.[0] ?? null
}

const RANGE = 'Zwischen 0,01 € und 999,99 €'
const NEEDS_SOURCE = 'Bitte eine Quelle wählen'

function mountField(props: Record<string, unknown> = {}) {
  return mountSuspended(PriceField, {
    props: { modelValue: null, stored: null, attempted: false, ...props },
  })
}

describe('the Price field (#361)', () => {
  beforeEach(() => {
    signInAs({ ...kitty, canHost: true })
    patchPrice = stored
    patchFailWith = null
    patchedWith.mockClear()
  })

  it.each([['19.99', 1999], ['20', 2000]])('reads the amount „%s“ as %i cents', async (text, cents) => {
    const page = await mountField()

    await amount(page).setValue(text)
    await source(page).setValue('gog')

    expect(lastModel(page)).toEqual({ cents, source: 'gog' })
  })

  it('enables the amount again when a paid source is chosen, still empty', async () => {
    const page = await mountField()
    await source(page).setValue('free_to_play')

    await source(page).setValue('steam')

    expect((amount(page).element as HTMLInputElement).disabled).toBe(false)
    expect((amount(page).element as HTMLInputElement).value).toBe('')
  })

  it('shows the amount of a stored Free-to-play game disabled and empty', async () => {
    const free: GamePrice = { cents: null, source: 'free_to_play', checkedAt }

    const page = await mountField({ modelValue: { cents: null, source: 'free_to_play' }, stored: free, gameId: GAME_ID })

    expect((source(page).element as HTMLSelectElement).value).toBe('free_to_play')
    expect((amount(page).element as HTMLInputElement).disabled).toBe(true)
    expect((amount(page).element as HTMLInputElement).value).toBe('')
  })

  it('has neither the line nor „Preis stimmt noch“ in create mode or for a game without a Price', async () => {
    const create = await mountField()
    expect(create.text()).not.toContain('Stand:')
    expect(confirmButton(create)).toBeUndefined()

    const plain = await mountField({ gameId: GAME_ID })
    expect(plain.text()).not.toContain('Stand:')
    expect(confirmButton(plain)).toBeUndefined()
  })

  it('shows „Preis entfernen“ only once something is typed or chosen', async () => {
    const page = await mountField()
    expect(removeButton(page)).toBeUndefined()

    await amount(page).setValue('2')

    expect(removeButton(page)).toBeDefined()
  })

  it('„Preis stimmt noch“ sends only the flag, and moves the day without saving', async () => {
    patchPrice = { cents: 1999, source: 'steam', checkedAt: '2026-11-09T08:00:00.000Z' }
    const page = await mountField({ modelValue: { cents: 1999, source: 'steam' }, stored, gameId: GAME_ID })

    await confirmButton(page)!.trigger('click')

    await vi.waitFor(() => expect(page.text()).toContain('Stand: 9. November 2026'))
    expect(patchedWith).toHaveBeenCalledTimes(1)
    expect(patchedWith.mock.lastCall![0]).toEqual({ priceChecked: true })
    expect(useState<{ text: string }[]>('toasts').value.map(item => item.text)).toContain('Preis bestätigt')
  })

  it('prefills the amount and the source of a game with a Price', async () => {
    const page = await mountField({ modelValue: { cents: 1999, source: 'steam' }, stored, gameId: GAME_ID })

    expect((amount(page).element as HTMLInputElement).value).toBe('19,99')
    expect((source(page).element as HTMLSelectElement).value).toBe('steam')
    expect(page.text()).toContain('Stand: 3. November 2026')
    expect(confirmButton(page)).toBeDefined()
  })

  it('emits the typed amount and the chosen source as one Price', async () => {
    const page = await mountField()

    await amount(page).setValue('19,99')
    await source(page).setValue('steam')

    expect(lastModel(page)).toEqual({ cents: 1999, source: 'steam' })
  })

  it('emits the text of an amount the rule refuses, so the rules refuse it downstream', async () => {
    const page = await mountField()

    await source(page).setValue('steam')
    await amount(page).setValue('abc')

    expect(lastModel(page)).toEqual({ cents: 'abc', source: 'steam' })
  })

  it('emits an amount with no source as null source', async () => {
    const page = await mountField()

    await amount(page).setValue('19,99')

    expect(lastModel(page)).toEqual({ cents: 1999, source: null })
  })

  it('emits no amount for Free-to-play after an amount was typed', async () => {
    const page = await mountField()
    await amount(page).setValue('19,99')

    await source(page).setValue('free_to_play')

    expect(lastModel(page)).toEqual({ cents: null, source: 'free_to_play' })
  })

  it('emits null once both the amount and the source are empty again', async () => {
    const page = await mountField()
    await amount(page).setValue('1')
    await amount(page).setValue('')

    expect(lastModel(page)).toBeNull()
  })

  it('emits null after „Preis entfernen“', async () => {
    const page = await mountField()
    await amount(page).setValue('19,99')
    await source(page).setValue('steam')

    await removeButton(page)!.trigger('click')

    expect(lastModel(page)).toBeNull()
    expect((amount(page).element as HTMLInputElement).value).toBe('')
    expect((source(page).element as HTMLSelectElement).value).toBe('')
  })

  it.each(['0', '1000', 'abc'])('reports the range at once for the amount „%s“', async (text) => {
    const page = await mountField()
    await source(page).setValue('steam')

    await amount(page).setValue(text)

    expect(lastError(page)).toBe(RANGE)
  })

  it('reports nothing for a paid source and an empty amount before a save attempt, the range after it', async () => {
    const page = await mountField()
    await source(page).setValue('epic')
    expect(lastError(page)).toBeNull()

    await page.setProps({ attempted: true })

    expect(lastError(page)).toBe(RANGE)
  })

  it('reports a missing source for an amount only once attempted, and clears it once a source is chosen', async () => {
    const page = await mountField()
    await amount(page).setValue('19,99')
    expect(lastError(page)).toBeNull()

    await page.setProps({ attempted: true })
    expect(lastError(page)).toBe(NEEDS_SOURCE)

    await source(page).setValue('steam')
    expect(lastError(page)).toBeNull()
  })

  it('reports the source before the amount when both are wrong', async () => {
    const page = await mountField()
    await amount(page).setValue('0')

    await page.setProps({ attempted: true })

    expect(lastError(page)).toBe(NEEDS_SOURCE)
  })

  it('marks the source as invalid and points it at its error only while the error shows', async () => {
    const page = await mountField()
    expect(source(page).attributes('aria-invalid')).toBeUndefined()

    await amount(page).setValue('19,99')
    await page.setProps({ attempted: true })

    expect(source(page).attributes('aria-invalid')).toBe('true')
    const described = source(page).attributes('aria-describedby')!
    expect(page.get(`[id="${described}"]`).text()).toBe(NEEDS_SOURCE)

    await source(page).setValue('steam')

    expect(source(page).attributes('aria-invalid')).toBeUndefined()
    expect(source(page).attributes('aria-describedby')).toBeUndefined()
  })

  it('emits failure null, then the German reason, when the confirm is refused, and keeps the old line', async () => {
    patchFailWith = 'invalid_price'
    const page = await mountField({ modelValue: { cents: 1999, source: 'steam' }, stored, gameId: GAME_ID })

    await confirmButton(page)!.trigger('click')

    await vi.waitFor(() => expect(page.emitted<[string | null]>('failure')).toHaveLength(2))
    expect(page.emitted<[string | null]>('failure')!.map(([message]) => message)).toEqual([
      null,
      'Der Preis braucht eine Quelle und einen Betrag von 0,01 € bis 999,99 €. Bei Free-to-play und Abo gibt es keinen Betrag.',
    ])
    expect(page.text()).toContain('Stand: 3. November 2026')
    expect(confirmButton(page)!.attributes('disabled')).toBeUndefined()
  })

  it('sends one PATCH for two quick presses of „Preis stimmt noch“', async () => {
    const page = await mountField({ modelValue: { cents: 1999, source: 'steam' }, stored, gameId: GAME_ID })

    await confirmButton(page)!.trigger('click')
    await confirmButton(page)!.trigger('click')
    await flushPromises()

    expect(patchedWith).toHaveBeenCalledTimes(1)
  })

  it('sends nothing on its own at mount or while the User types', async () => {
    const page = await mountField({ modelValue: { cents: 1999, source: 'steam' }, stored, gameId: GAME_ID })
    await amount(page).setValue('20')
    await source(page).setValue('gog')
    await flushPromises()

    expect(patchedWith).not.toHaveBeenCalled()
  })
})
