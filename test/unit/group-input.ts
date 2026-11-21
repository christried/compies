import type { GroupInput } from '../../app/utils/sound-cues'

/**
 * A `GroupInput` with every flag off and no Veto allowance (#829): a test names only the fields it is about. `GroupInput`'s fields are all
 * required, so a field added to it is a compile error here until it has a value, and no test literal can forget one.
 */
export const groupInput = (over: Partial<GroupInput> = {}): GroupInput => ({
  wheel: false,
  vetoAllowance: 0,
  vetoWindow: false,
  sessionRunning: false,
  toss: false,
  standings: false,
  board: false,
  emote: false,
  finished: false,
  tour: false,
  countdown: false,
  ...over,
})
