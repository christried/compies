import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import SkeletonCard from '~/components/SkeletonCard.vue'

// SkeletonCard (#884, spec #683): Home's shape stays the default and unchanged. The Archive shape (artboard „App Ende & Archiv“, screen 21,
// state „Lädt“) has the real Archive card's box (ArchiveCard: radius 16, padding p-3.5, gap-2.5): a block for the Winner strip, a line for
// the name, a shorter line for the date and a pill. Both shapes pulse, and both stand still under reduced motion.

const has = (element: Element, ...names: string[]) => names.every(name => element.classList.contains(name))

describe('SkeletonCard shapes (#884)', () => {
  it('keeps Home’s shape by default: the big card with four blocks', async () => {
    const page = await mountSuspended(SkeletonCard)

    expect(page.attributes('aria-hidden')).toBe('true')
    expect(page.classes()).toEqual(expect.arrayContaining(['rounded-[18px]', 'p-5']))
    expect(page.classes()).not.toContain('rounded-[16px]')
    expect(page.findAll('span')).toHaveLength(4)
  })

  it('has the Archive shape with the box of the real Archive card', async () => {
    const page = await mountSuspended(SkeletonCard, { props: { shape: 'archive' } })

    expect(page.attributes('aria-hidden')).toBe('true')
    expect(page.classes()).toEqual(expect.arrayContaining(['rounded-[16px]', 'p-3.5', 'gap-2.5', 'border-line', 'bg-surface']))
    expect(page.classes()).not.toContain('rounded-[18px]')
  })

  it('draws the Winner strip, the name, a shorter date line and the pill, in that order', async () => {
    const page = await mountSuspended(SkeletonCard, { props: { shape: 'archive' } })
    const root = page.element as Element
    const [strip, text, pill] = Array.from(root.children)

    expect(root.children).toHaveLength(3)
    expect(has(strip!, 'h-[46px]', 'rounded-[12px]')).toBe(true)
    const [name, date] = Array.from(text!.children)
    expect(has(name!, 'w-2/3')).toBe(true)
    expect(has(date!, 'w-1/3')).toBe(true)
    expect(has(pill!, 'h-6', 'rounded-pill')).toBe(true)
  })

  it.each(['home', 'archive'] as const)('pulses in the %s shape and stands still under reduced motion', async (shape) => {
    const page = await mountSuspended(SkeletonCard, { props: { shape } })

    expect(page.classes()).toEqual(expect.arrayContaining(['animate-[pulse_1.2s_ease-in-out_infinite]', 'reduced:animate-none']))
  })
})
