import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import NoteDisc from '~/components/NoteDisc.vue'

// The disc before a note's label (#729, hand-off 18-notizen.md § NoteBlock): the game's note on `surface` with a sticky note, the Event's on `primary` with a
// calendar, a finished Event's on `paper-2` in the muted ink. Used by the read-only blocks and by #454's label row.

describe('NoteDisc (#729)', () => {
  it('draws the game note as a surface disc with a sticky note, hidden from assistive technology', async () => {
    const disc = await mountSuspended(NoteDisc, { props: { kind: 'game' } })

    expect(disc.classes()).toEqual(expect.arrayContaining(['size-[26px]', 'rounded-pill', 'border-2', 'border-line', 'bg-surface', 'text-ink']))
    expect(disc.attributes('aria-hidden')).toBe('true')
    expect(disc.get('svg').classes().join(' ')).toContain('sticky-note')
  })

  it('draws the Event note as a primary disc with a calendar, ink on primary', async () => {
    const disc = await mountSuspended(NoteDisc, { props: { kind: 'event' } })

    expect(disc.classes()).toEqual(expect.arrayContaining(['bg-primary', 'text-on-primary']))
    expect(disc.classes()).not.toContain('bg-surface')
    expect(disc.get('svg').classes().join(' ')).toContain('calendar')
  })

  it('draws a finished Event note on paper-2 in the muted ink, still with the calendar', async () => {
    const disc = await mountSuspended(NoteDisc, { props: { kind: 'event', finished: true } })

    expect(disc.classes()).toEqual(expect.arrayContaining(['bg-paper-2', 'text-ink-2']))
    expect(disc.classes()).not.toContain('bg-primary')
    expect(disc.get('svg').classes().join(' ')).toContain('calendar')
  })
})
