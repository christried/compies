import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PollMatrix from '~/components/PollMatrix.vue'
import { kitty, signInAs } from './auth'

// "Wer kann wann?" with its CSV export (#84): the button sits with the matrix, shows for every Member,
// and downloads the file in the browser with no request.

const props = {
  people: [{ id: 'u1', name: 'Anna', image: null, isHost: true }, { id: 'u2', name: 'Bo', image: null, isHost: false }],
  slots: [{ id: 's1', day: 'Sa 24.10.', time: '20:30', past: false }],
  votes: [{ slotId: 's1', userId: 'u1', value: 'yes' as const }],
  meId: 'u2',
}

beforeEach(() => {
  signInAs(kitty)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PollMatrix', () => {
  it('keeps the name column sticky on the left, so the Votes scroll under it', async () => {
    const page = await mountSuspended(PollMatrix, { props, route: '/e/freitags-zocken-k7q2' })

    const rowHeader = page.find('tbody th')
    expect(rowHeader.classes()).toEqual(expect.arrayContaining(['sticky', 'left-0', 'bg-surface']))
  }, 15000)

  it('shows the CSV button to a Member and downloads <slug>-terminumfrage.csv', async () => {
    const createObjectURL = vi.fn(() => 'blob:poll')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
    const page = await mountSuspended(PollMatrix, { props, route: '/e/freitags-zocken-k7q2' })

    const button = page.findAll('button').find(candidate => candidate.text() === 'Als CSV exportieren')
    expect(button).toBeDefined()
    await button!.trigger('click')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicked).toHaveLength(1)
    expect(clicked[0]!.download).toBe('freitags-zocken-k7q2-terminumfrage.csv')
    expect(clicked[0]!.href).toBe('blob:poll')
  })
})
