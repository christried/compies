import { describe, expect, it } from 'vitest'
import { EMOTE_BURST_GAP_MS, emoteRunCues, MOMENT_OF } from '../../app/dev/listening-model'
import { CUE_IDS, EMOTE_CUE, OTHERS_EMOTE_VOLUME } from '../../app/utils/sound-cues'
import { EMOTE_IDS, EMOTE_SOUND_WINDOW_MS, EMOTE_SOUNDS_PER_WINDOW } from '../../shared/emote'

// The listening page's three Emote buttons (#771): the own Emote, another Member's, and the densest burst the room lets carry a sound, through the real `emoteCue`.

describe('emoteRunCues', () => {
  it('plays the own Emote once at the full volume', () => {
    expect(emoteRunCues('emo-clap', 'own')).toEqual([{ id: 'emo-clap', delayMs: 0, factor: 1 }])
  })

  it('plays another Member\'s Emote once at 60 %', () => {
    expect(emoteRunCues('emo-roar', 'other')).toEqual([{ id: 'emo-roar', delayMs: 0, factor: OTHERS_EMOTE_VOLUME }])
  })

  it('plays three of another Member\'s inside the room\'s one-second window, as far apart as they fit', () => {
    expect(emoteRunCues('emo-grr', 'burst')).toEqual([
      { id: 'emo-grr', delayMs: 0, factor: OTHERS_EMOTE_VOLUME },
      { id: 'emo-grr', delayMs: 333, factor: OTHERS_EMOTE_VOLUME },
      { id: 'emo-grr', delayMs: 666, factor: OTHERS_EMOTE_VOLUME },
    ])
    expect(EMOTE_BURST_GAP_MS).toBe(333)
    expect(EMOTE_BURST_GAP_MS * EMOTE_SOUNDS_PER_WINDOW).toBeLessThanOrEqual(EMOTE_SOUND_WINDOW_MS)
  })

  it('gives each of the four Emotes its own cue, and those four are the cues of the Emote moment', () => {
    for (const emote of EMOTE_IDS) {
      expect(emoteRunCues(EMOTE_CUE[emote], 'own').map(cue => cue.id)).toEqual([EMOTE_CUE[emote]])
    }
    expect(CUE_IDS.filter(id => MOMENT_OF[id] === 'emote').sort()).toEqual(EMOTE_IDS.map(emote => EMOTE_CUE[emote]).sort())
  })

  it('plays nothing for a cue that is no Emote\'s', () => {
    expect(emoteRunCues('wheel-tick', 'own')).toEqual([])
  })
})
