import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useOptimisticVotes } from '~/composables/useOptimisticVotes'
import type { VoteValue } from '~~/shared/poll'

// The Votes as the poll draws them (#50): a press shows at once, quick presses send only the newest, and a
// failed save falls back to the saved Vote. Each test gets its own slug: registerEndpoint keeps the first
// handler for a path.
let testNumber = 0
const ME = '00000000-0000-4000-8000-000000000001'
const LARSI = '00000000-0000-4000-8000-000000000002'

type Vote = { slotId: string, userId: string, value: VoteValue }

/**
 * The Event's Votes on the server, what its vote endpoint received, and the composable for one test. The endpoint
 * awaits `before` with each Vote, which can hold the answer back or refuse it.
 */
async function setUp(saved: Vote[], before: (value: VoteValue) => unknown = () => undefined) {
  testNumber += 1
  const slug = `freitags-zocken-${testNumber}`
  const server = { votes: saved, received: [] as VoteValue[] }
  registerEndpoint(`/api/e/${slug}/slots/sat/vote`, {
    method: 'PUT',
    handler: async (event) => {
      const { value } = await readBody<{ value: VoteValue }>(event)
      server.received.push(value)
      await before(value)
      server.votes = [...server.votes.filter(vote => !(vote.slotId === 'sat' && vote.userId === ME)), { slotId: 'sat', userId: ME, value }]
      return { slotId: 'sat', value }
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
    const { server, votes, refresh } = await setUp([{ slotId: 'sat', userId: LARSI, value: 'yes' }])

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
      { slotId: 'sat', userId: LARSI, value: 'yes' },
      { slotId: 'sat', userId: ME, value: 'maybe' },
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
    const { votes } = await setUp([{ slotId: 'sat', userId: ME, value: 'yes' }], () => {
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
})
