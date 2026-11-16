import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TourFace from '~/components/TourFace.vue'
import { stubInView } from './in-view'
import { motion } from './motion'

// Compibert at the Tour's bubble (#460, 17-rundgang.md § TourFace): the head crop on the corner, waving at the greeting, looking at the thing on a
// pointing step and cheering at the end; held under reduced motion. Real GSAP runs, as in compibert-rig.test.ts; the numbers of the looks are pinned there.

type Page = Awaited<ReturnType<typeof mountSuspended<typeof TourFace>>>
const pages: Page[] = []

async function mountFace(props: { face: 'hello' | 'points' | 'cheers', look?: number, narrow?: boolean }) {
  stubInView()
  const page = await mountSuspended(TourFace, { props: { look: 0, narrow: false, ...props } })
  pages.push(page)
  return page
}

const rig = (page: Page) => page.get('.compibert-rig')

afterEach(() => {
  for (const page of pages.splice(0)) if (!page.vm.$.isUnmounted) page.unmount()
  vi.restoreAllMocks()
})

describe('TourFace', () => {
  it.each([['hello', 'wave'], ['points', 'idle'], ['cheers', 'cheer']] as const)('shows the rig in the state %s → %s', async (face, state) => {
    const page = await mountFace({ face })

    expect(rig(page).attributes('data-state')).toBe(state)
  })

  it('is the head crop with the rim, hidden from assistive technology, and 72 px at 14 / -20', async () => {
    const page = await mountFace({ face: 'points' })

    expect(page.attributes('aria-hidden')).toBe('true')
    expect(rig(page).classes()).toContain('compibert-rig--head')
    expect(rig(page).classes()).toContain('compibert-rig--rim')
    expect(rig(page).attributes('style')).toContain('width: 72px')
    expect(page.attributes('style')).toContain('left: 14px')
    expect(page.attributes('style')).toContain('top: -20px')
  })

  it('is 56 px at 8 / -16 on a phone', async () => {
    const page = await mountFace({ face: 'points', narrow: true })

    expect(rig(page).attributes('style')).toContain('width: 56px')
    expect(page.attributes('style')).toContain('left: 8px')
    expect(page.attributes('style')).toContain('top: -16px')
  })

  it('lets the hop and the rim out of the crop: the head\'s own clip is off', async () => {
    const page = await mountFace({ face: 'cheers' })

    expect(rig(page).classes()).toContain('overflow-visible!')
  })

  it('holds the pose under reduced motion', async () => {
    motion('reduced')
    const page = await mountFace({ face: 'cheers' })

    await vi.waitFor(() => expect(rig(page).attributes('data-held')).toBe('true'), { timeout: 5000 })
  })

  it('moves under full motion, so that the held pose above can fail', async () => {
    motion('full')
    const page = await mountFace({ face: 'hello' })

    await vi.waitFor(() => expect(rig(page).attributes('data-ready')).toBe('true'), { timeout: 5000 })
    expect(rig(page).attributes('data-held')).toBe('false')
  })

  it('nods when asked, and does not break a face that was never ready', async () => {
    const page = await mountFace({ face: 'points' })

    expect(() => (page.vm as unknown as { nod: () => void }).nod()).not.toThrow()
  })
})
