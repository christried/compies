import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useOptimisticVotes } from '~/composables/useOptimisticVotes'
import type { VoteRow, VoteValue } from '~~/shared/poll'

// The Votes as the poll draws them (#50): a press shows at once, quick presses send only the newest, and a
// failed save falls back to the saved Vote. Each test gets its own slug: registerEndpoint keeps the first
// handler for a path.
let testNumber = 0
const ME = '00000000-0000-4000-8000-000000000001'
const LARSI = '00000000-0000-4000-8000-000000000002'

type Vote = VoteRow

/**
 * The Event's Votes on the server, what its vote endpoint received, and the composable for one test. The endpoint
 * awaits `before` with each Vote, which can hold the answer back or refuse it.
 */
async function setUp(saved: Vote[], before: (value: VoteValue) => unknown = () => undefined) {
  testNumber += 1
  const slug = `freitags-zocken-${testNumber}`
  const server = { votes: saved, received: [] as VoteValue[], notes: [] as unknown[] }
  registerEndpoint(`/api/e/${slug}/slots/sat/vote`, {
    method: 'PUT',
    handler: async (event) => {
      const { value, note } = await readBody<{ value: VoteValue, note?: string }>(event)
      server.received.push(value)
      server.notes.push(note)
      await before(value)
      const kept = server.votes.find(vote => vote.slotId === 'sat' && vote.userId === ME)?.note ?? null
      const answer = { slotId: 'sat', userId: ME, value, note: note === undefined ? kept : (note.trim() || null) }
      server.votes = [...server.votes.filter(vote => !(vote.slotId === 'sat' && vote.userId === ME)), answer]
      return answer
    },
  })
  const data = ref({ viewerId: ME, votes: server.votes })
  const refresh = vi.fn(async () => {
    data.value = { viewerId: ME, votes: server.votes }
  })
  let votes!: ReturnType<typeof useOptimisticVotes>
  await mountSuspended(defineComponent({
    setup() {
      votes = useOptimisticVotes(toRef(() => slug), data, refresh)
      return () => h('div')
    },
  }))
  return { server, votes, refresh }
}

function shownToasts() {
  return useState<{ text: string, tone: string }[]>('toasts').value
}

describe('useOptimisticVotes', () => {
  beforeEach(() => {
    useState('toasts').value = []
  })

  it('draws a press at once with its counts, then saves it and says so', async () => {
    const { server, votes, refresh } = await setUp([{ slotId: 'sat', userId: LARSI, value: 'yes', note: null }])

    const saving = votes.vote('sat', 'maybe')

    expect(votes.myVoteFor('sat')).toBe('maybe')
    expect(votes.countsFor('sat')).toEqual({ yes: 1, maybe: 1, no: 0 })
    expect(votes.savedNote.value).toBe(false)
    await saving
    expect(server.received).toEqual(['maybe'])
    expect(votes.savedNote.value).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(votes.myVoteFor('sat')).toBe('maybe')
    expect(votes.shown.value).toEqual([
      { slotId: 'sat', userId: LARSI, value: 'yes', note: null },
      { slotId: 'sat', userId: ME, value: 'maybe', note: null },
    ])
  })

  it('draws each of several quick presses, but sends only the newest once the first save is back', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { server, votes } = await setUp([], value => (value === 'maybe' ? gate : undefined))

    const first = votes.vote('sat', 'maybe')
    await vi.waitFor(() => expect(server.received).toEqual(['maybe']))
    await votes.vote('sat', 'no')
    expect(votes.myVoteFor('sat')).toBe('no')
    await votes.vote('sat', 'yes')
    expect(votes.myVoteFor('sat')).toBe('yes')

    release()
    await first

    expect(server.received).toEqual(['maybe', 'yes'])
    expect(votes.myVoteFor('sat')).toBe('yes')
  })

  it('falls back to the saved Vote and raises the error toast when saving fails', async () => {
    const { votes } = await setUp([{ slotId: 'sat', userId: ME, value: 'yes', note: null }], () => {
      throw createError({ statusCode: 500, statusMessage: 'boom' })
    })

    await votes.vote('sat', 'no')

    expect(votes.myVoteFor('sat')).toBe('yes')
    expect(votes.savedNote.value).toBe(false)
    expect(shownToasts()).toEqual([expect.objectContaining({ tone: 'error', text: 'Deine Stimme ist nicht angekommen' })])
  })

  it('gives a rate limit its own copy', async () => {
    const { votes } = await setUp([], () => {
      throw createError({ statusCode: 429, statusMessage: 'rate_limited' })
    })

    await votes.vote('sat', 'yes')

    expect(votes.myVoteFor('sat')).toBeNull()
    expect(shownToasts()).toEqual([expect.objectContaining({ tone: 'error', text: 'Langsam, langsam. Versuch es in ein paar Sekunden.' })])
  })

  it('says why in the shared error copy when the Slot became a Date meanwhile (#74)', async () => {
    const { votes } = await setUp([], () => {
      throw createError({ statusCode: 409, statusMessage: 'slot_taken' })
    })

    await votes.vote('sat', 'yes')

    expect(votes.myVoteFor('sat')).toBeNull()
    expect(shownToasts()).toEqual([expect.objectContaining({ tone: 'error', text: 'Dieser Termin steht schon fest.' })])
  })

  describe('saveNote (#102)', () => {
    it('shows a Note at once, then keeps the Vote and the saved Note', async () => {
      const { server, votes } = await setUp([{ slotId: 'sat', userId: ME, value: 'maybe', note: null }])

      const saving = votes.saveNote('sat', 'kann maximal bis 20:30')

      expect(votes.myNoteFor('sat')).toBe('kann maximal bis 20:30')
      expect(votes.shown.value.find(vote => vote.userId === ME)).toEqual({ slotId: 'sat', userId: ME, value: 'maybe', note: 'kann maximal bis 20:30' })
      expect(await saving).toBe(true)
      expect(server.received).toEqual(['maybe'])
      expect(server.notes).toEqual(['kann maximal bis 20:30'])
      expect(votes.myNoteFor('sat')).toBe('kann maximal bis 20:30')
    })

    it('shows an emptied Note as gone at once', async () => {
      const { votes } = await setUp([{ slotId: 'sat', userId: ME, value: 'maybe', note: 'bis 20:30' }])

      const saving = votes.saveNote('sat', '')

      expect(votes.myNoteFor('sat')).toBeNull()
      await saving
      expect(votes.myNoteFor('sat')).toBeNull()
    })

    it('keeps the Note when only the value changes', async () => {
      const { server, votes } = await setUp([{ slotId: 'sat', userId: ME, value: 'maybe', note: 'bis 20:30' }])

      await votes.vote('sat', 'no')

      expect(server.notes).toEqual([undefined])
      expect(votes.myNoteFor('sat')).toBe('bis 20:30')
    })

    it('rolls back with the failed-vote toast when saving fails', async () => {
      const { votes } = await setUp([{ slotId: 'sat', userId: ME, value: 'maybe', note: 'bis 20:30' }], () => {
        throw createError({ statusCode: 500, statusMessage: 'boom' })
      })

      expect(await votes.saveNote('sat', 'neu')).toBe(false)

      expect(votes.myNoteFor('sat')).toBe('bis 20:30')
      expect(shownToasts()).toEqual([expect.objectContaining({ tone: 'error', text: 'Deine Stimme ist nicht angekommen' })])
    })

    it('does nothing without a Vote', async () => {
      const { server, votes } = await setUp([])

      expect(await votes.saveNote('sat', 'hallo')).toBe(false)

      expect(server.received).toEqual([])
      expect(votes.myNoteFor('sat')).toBeNull()
    })
  })
})
