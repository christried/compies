import { describe, expect, it } from 'vitest'
import { CUE_GROUPS, cueFilesOf, reachableGroups, tourStepCue } from '../../app/utils/sound-cues'
import { MEMBER_TOUR } from '../../shared/tour'

// The Tour's voice (#747, spec #718): which step sounds which cue, and which group of files the Tour's rule reaches. The Tour's own start rule is
// `tourMayStart` (shared/tour.ts); `groupInputOf` asks it, so no copy of its conditions is tested here.

describe('tourStepCue', () => {
  it('gives the greeting its chirp and the end its cheer', () => {
    expect(tourStepCue('greeting')).toBe('cb-hi')
    expect(tourStepCue('end')).toBe('cb-yay')
  })

  it('keeps every other step of the Member\'s Tour silent', () => {
    const others = MEMBER_TOUR.map(step => step.id).filter(id => id !== 'greeting' && id !== 'end')

    expect(others.length).toBeGreaterThan(0)
    for (const id of others) expect(tourStepCue(id), id).toBeNull()
    expect(tourStepCue('')).toBeNull()
  })
})

describe('the Tour group', () => {
  const wheelOff = { wheel: false, vetoAllowance: 0, vetoWindow: false }

  it('is reached by the Tour flag alone', () => {
    expect(reachableGroups({ ...wheelOff, tour: true })).toEqual(['tour'])
  })

  it('comes last, after the wheel', () => {
    expect(reachableGroups({ wheel: true, vetoAllowance: 0, vetoWindow: false, tour: true })).toEqual(['wheel', 'tour'])
  })

  it('is not reached with the flag false or absent', () => {
    expect(reachableGroups({ ...wheelOff, tour: false })).not.toContain('tour')
    expect(reachableGroups(wheelOff)).not.toContain('tour')
  })

  it('holds the chirp, and the cheer which the wheel holds too', () => {
    expect(CUE_GROUPS['cb-hi']).toEqual(['tour'])
    expect(CUE_GROUPS['cb-yay']).toEqual(['wheel', 'tour'])
    expect([...cueFilesOf(['tour'])].sort()).toEqual(['cb-hi', 'cb-yay'])
  })

  it('asks for the cheer once, whichever group comes first', () => {
    const both = cueFilesOf(['wheel', 'tour'])

    expect(both.filter(id => id === 'cb-yay')).toHaveLength(1)
    expect(cueFilesOf(['tour', 'wheel'])).toEqual(both)
  })
})
