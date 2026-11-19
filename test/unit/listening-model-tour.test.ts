import { describe, expect, it } from 'vitest'
import { TOUR_RUN_GAP_MS, tourVoiceCues } from '../../app/dev/listening-model'

// The listening page's „Test Tour voice“ (#747): the Tour's two cues through the real step map, in the order the real Tour shows them.

describe('tourVoiceCues', () => {
  it('is the chirp, then the cheer a step change later', () => {
    expect(tourVoiceCues()).toEqual([{ id: 'cb-hi', delayMs: 0 }, { id: 'cb-yay', delayMs: TOUR_RUN_GAP_MS }])
  })
})
