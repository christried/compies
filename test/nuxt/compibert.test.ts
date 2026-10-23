import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import Compibert from '~/components/Compibert.vue'
import EmptyState from '~/components/EmptyState.vue'

describe('Compibert', () => {
  // The bust is a framed upper-body pose: its round sticker frame belongs to the pose, so every place
  // that shows it gets the frame. The full body and the head have no frame.
  it('frames the bust as a round sticker wherever it is shown', async () => {
    const page = await mountSuspended(EmptyState, { props: { title: 'Noch keine Sessions' } })

    expect(page.get('.compibert').classes()).toEqual(expect.arrayContaining(['rounded-full', 'shadow-sticker']))
  })

  it('draws no frame on the full body pose', async () => {
    const page = await mountSuspended(Compibert, { props: { variant: 'full' } })

    expect(page.get('.compibert').classes()).not.toContain('rounded-full')
  })
})
