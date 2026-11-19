// The Emote and the first two rules the room holds about it (#767, spec #719 § C, ADR 0013 amendment of 2026-11-16).
// The Worker imports this file, so it holds types, constants and one pure function only.

/** The Emotes a Member can send; the ids are the locale's keys. */
export const EMOTE_IDS = ['clap', 'tears', 'angry', 'roar'] as const
export type EmoteId = (typeof EMOTE_IDS)[number]

export function isEmoteId(value: unknown): value is EmoteId {
  return (EMOTE_IDS as readonly unknown[]).includes(value)
}

/** One Emote per Member in this many milliseconds; the bar draws its ring from the same number (#668). */
export const EMOTE_COOLDOWN_MS = 2000
/** The window of the second rule, and how many Emotes inside it may carry a sound. */
export const EMOTE_SOUND_WINDOW_MS = 1000
export const EMOTE_SOUNDS_PER_WINDOW = 3

/** What the room remembers of one Event's earlier accepted Emotes, in ms since the epoch. */
export interface EmoteHistory {
  /** The accepted times of this Member. */
  member: readonly number[]
  /** The accepted times of the whole room that carried a sound: a silent Emote adds no noise, so it does not count. */
  sounded: readonly number[]
}

export type EmoteVerdict = { allowed: false } | { allowed: true, sound: boolean }

/**
 * Whether an Emote at `now` passes and whether it carries a sound. Both windows are open at their far end: an Emote
 * exactly 2000 ms after the Member's last is allowed, and one exactly 1000 ms after three sounds carries one again.
 * A time in the future (the clock stepped back) counts as inside the window.
 */
export function judgeEmote(history: EmoteHistory, now: number): EmoteVerdict {
  if (history.member.some(time => now - time < EMOTE_COOLDOWN_MS)) return { allowed: false }
  const recent = history.sounded.filter(time => now - time < EMOTE_SOUND_WINDOW_MS).length
  return { allowed: true, sound: recent < EMOTE_SOUNDS_PER_WINDOW }
}
