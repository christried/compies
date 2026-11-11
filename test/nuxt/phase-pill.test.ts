import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import PhasePill from '~/components/PhasePill.vue'

// The Phase chip (02-components § PhasePill). The small size (#426, 15-header-eventseite) is the one under „Events“ in the Event page's header.
describe('PhasePill', () => {
  it('says the Phase word at either size', async () => {
    for (const size of [undefined, 'md', 'sm'] as const) {
      expect((await mountSuspended(PhasePill, { props: { phase: 'date_set', size } })).text()).toBe('Termin steht')
    }
  })

  it('says the page’s label instead of the word', async () => {
    expect((await mountSuspended(PhasePill, { props: { phase: 'running', label: 'Kein Termin', size: 'sm' } })).text()).toBe('Kein Termin')
  })

  it('stays as it was at the default size', async () => {
    const pill = await mountSuspended(PhasePill, { props: { phase: 'running' } })

    expect(pill.classes()).toEqual(expect.arrayContaining(['h-7', 'px-2.5', 'text-[12px]', 'font-bold']))
    expect(pill.classes()).not.toContain('h-[18px]')
    expect((await mountSuspended(PhasePill, { props: { phase: 'running', size: 'md' } })).classes()).toEqual(pill.classes())
  })

  it('is 18 px high with 11 px words at the small size, and keeps the dot colour of its Phase', async () => {
    const md = await mountSuspended(PhasePill, { props: { phase: 'running' } })
    const sm = await mountSuspended(PhasePill, { props: { phase: 'running', size: 'sm' } })

    expect(sm.classes()).toEqual(expect.arrayContaining(['h-[18px]', 'px-[7px]', 'text-[11px]', 'font-extrabold', 'flex-none', 'bg-surface']))
    expect(sm.classes()).not.toContain('h-7')
    expect(sm.get('[aria-hidden="true"]').classes()).toEqual(expect.arrayContaining(['size-1.5', 'bg-hot']))
    expect(md.get('[aria-hidden="true"]').classes()).toEqual(expect.arrayContaining(['size-2.5', 'bg-hot']))
  })
})
