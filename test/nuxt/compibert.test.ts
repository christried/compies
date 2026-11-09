import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Compibert from '~/components/Compibert.vue'
import EmptyState from '~/components/EmptyState.vue'
import { motion } from './motion'

// The party hat (#38, 02-components § Compibert, 04-motion § Compibert): the header head wears it on the Event page; it pops once when it
// appears on an open page, never on load, and not under reduced motion. `Element.animate` is a stub that records what each element was asked.

interface Call { el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions }
let calls: Call[]
const realAnimate = Element.prototype.animate
const HAT_TRANSFORM = 'translate(324.4 56) scale(.7) rotate(15 40 86)'
const HARD_HAT_TRANSFORM = 'translate(236 6) scale(.95) rotate(-7 80 66)'

beforeEach(() => {
  calls = []
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ el: this, keyframes, options })
    return { currentTime: 0 } as Animation
  } as unknown as typeof Element.prototype.animate
  motion('full')
})

afterEach(() => {
  Element.prototype.animate = realAnimate
  vi.restoreAllMocks()
})

describe('Compibert', () => {
  // The bust is a framed upper-body pose: its round sticker frame belongs to the pose, so every place
  // that shows it gets the frame. The full body and the head have no frame.
  it('frames the bust as a round sticker wherever it is shown', async () => {
    const page = await mountSuspended(EmptyState, { props: { title: 'Noch keine Events' } })

    expect(page.get('.compibert').classes()).toEqual(expect.arrayContaining(['rounded-full', 'shadow-sticker']))
  })

  it('draws no frame on the full body pose', async () => {
    const page = await mountSuspended(Compibert, { props: { variant: 'full' } })

    expect(page.get('.compibert').classes()).not.toContain('rounded-full')
  })

  describe('accessories', () => {
    it('draws the party hat on the head crop, with its art group inside the mount', async () => {
      const page = await mountSuspended(Compibert, { props: { variant: 'head', accessory: 'partyhat' } })

      expect(page.findAll('.compibert-hat')).toHaveLength(1)
      expect(page.get('.compibert-hat').attributes('transform')).toBe(HAT_TRANSFORM)
      expect(page.findAll('.compibert-hat .compibert-hat-art')).toHaveLength(1)
      expect(page.find(`[transform="${HARD_HAT_TRANSFORM}"]`).exists()).toBe(false)
    })

    it('draws the hard hat and no party hat for the construction page', async () => {
      const page = await mountSuspended(Compibert, { props: { variant: 'head', accessory: 'hardhat' } })

      expect(page.find(`[transform="${HARD_HAT_TRANSFORM}"]`).exists()).toBe(true)
      expect(page.find('.compibert-hat').exists()).toBe(false)
    })

    it('draws neither accessory without one', async () => {
      const page = await mountSuspended(Compibert, { props: { variant: 'head' } })

      expect(page.find('.compibert-hat').exists()).toBe(false)
      expect(page.find(`[transform="${HARD_HAT_TRANSFORM}"]`).exists()).toBe(false)
    })

    it('does not pop the hat on mount', async () => {
      await mountSuspended(Compibert, { props: { variant: 'head', accessory: 'partyhat' } })

      expect(calls).toEqual([])
    })

    it('pops the hat once, from the brim, when it appears on an open page: 220 ms and the pop curve', async () => {
      const page = await mountSuspended(Compibert, { props: { variant: 'head' } })

      await page.setProps({ accessory: 'partyhat' })
      await nextTick()

      expect(calls).toHaveLength(1)
      expect(calls[0]!.el).toBe(page.get('.compibert-hat-art').element)
      expect(calls[0]!.keyframes).toEqual([{ transform: 'scale(0) rotate(-12deg)' }, { transform: 'scale(1) rotate(0deg)' }])
      expect(calls[0]!.options).toMatchObject({ duration: 220, easing: 'cubic-bezier(.34,1.56,.64,1)' })
    })

    it('does not pop under reduced motion, and the hat is there', async () => {
      motion('reduced')
      const page = await mountSuspended(Compibert, { props: { variant: 'head' } })

      await page.setProps({ accessory: 'partyhat' })
      await nextTick()

      expect(page.findAll('.compibert-hat')).toHaveLength(1)
      expect(calls).toEqual([])
    })

    it('removes the hat at once without an animation, and pops again when it returns', async () => {
      const page = await mountSuspended(Compibert, { props: { variant: 'head', accessory: 'partyhat' } })

      await page.setProps({ accessory: undefined })
      await nextTick()
      expect(page.find('.compibert-hat').exists()).toBe(false)
      expect(calls).toEqual([])

      await page.setProps({ accessory: 'partyhat' })
      await nextTick()
      expect(calls).toHaveLength(1)
    })

    it('does not pop again on a re-render that keeps the hat', async () => {
      const page = await mountSuspended(Compibert, { props: { variant: 'head', accessory: 'partyhat' } })

      await page.setProps({ size: 40 })
      await nextTick()

      expect(page.findAll('.compibert-hat')).toHaveLength(1)
      expect(calls).toEqual([])
    })
  })
})
