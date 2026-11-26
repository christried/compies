import { splitBerlinLocal, utcToBerlin } from '../../shared/time'

// What the install hint on Home shows (#676, spec #927 § The install hint). Pure: the device facts, the stored entry and `now`
// come in, so the rule is tested without a browser. `useInstallHint` reads the facts; `PwaInstallHint.vue` draws the result.

/** The local-storage key of the entry: `done` (the iOS steps, #929) or `later:YYYY-MM-DD` („Später“). */
export const PWA_STORAGE_KEY = 'compies-pwa'
/** How many whole days „Später“ keeps the banner away. */
export const PWA_LATER_DAYS = 14

export type Platform = 'ios' | 'android' | 'computer'
/** What `compies-pwa` holds; `day` is a Berlin `YYYY-MM-DD` (ADR 0003). */
export type PwaEntry = { kind: 'none' } | { kind: 'done' } | { kind: 'later', day: string }
export type InstallHint
  = | { kind: 'none' }
    | { kind: 'banner', via: 'prompt' | 'sheet' } // prompt: Android's held install prompt; sheet: the iOS steps (#929)
    | { kind: 'done' } // „Installiert“

const DAY_MS = 86_400_000

/**
 * The device's platform. iPhone and iPad by the user agent, an iPad that reports itself as a Mac by its touch points; any other
 * device whose primary pointer is coarse is Android's case (a phone is its pointer, the user agent is not consulted); the rest is a computer.
 */
export function platformOf(device: { userAgent: string, maxTouchPoints: number, coarsePointer: boolean }): Platform {
  if (/iPhone|iPad/.test(device.userAgent) || (device.userAgent.includes('Macintosh') && device.maxTouchPoints > 1)) return 'ios'
  return device.coarsePointer ? 'android' : 'computer'
}

/** A `YYYY-MM-DD` that is a real calendar day, as UTC midnight in ms; null for anything else (`2026-13-45`). */
function dayMs(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const ms = Date.UTC(+match[1]!, +match[2]! - 1, +match[3]!)
  return new Date(ms).toISOString().startsWith(day) ? ms : null
}

/** Reads the stored value. Anything unexpected, `null` included, is no entry, so broken storage shows the banner. */
export function parseEntry(raw: string | null): PwaEntry {
  if (raw === 'done') return { kind: 'done' }
  if (raw?.startsWith('later:')) {
    const day = raw.slice('later:'.length)
    if (dayMs(day) !== null) return { kind: 'later', day }
  }
  return { kind: 'none' }
}

/** What „Später“ stores: today's Berlin day (ADR 0003). */
export function laterEntry(now: Date): string {
  return `later:${splitBerlinLocal(utcToBerlin(now)).date}`
}

/** Whether „Später“ still hides the banner: fewer than 14 whole Berlin days since the stored day. A day after today (the clock was set back) hides nothing. */
function laterHides(day: string, now: Date): boolean {
  const today = dayMs(splitBerlinLocal(utcToBerlin(now)).date)!
  const days = (today - dayMs(day)!) / DAY_MS
  return days >= 0 && days < PWA_LATER_DAYS
}

/**
 * What the banner shows. Nothing on a computer, in the installed app or before the User has played; „Installiert“ after an accepted
 * install (the prompt is no longer held by then, so it is an input of its own); nothing once the iOS steps are done or while „Später“ hides it.
 * Then the iPhone/iPad sheet on iOS, and on Android the prompt banner only while the browser's install prompt is held.
 */
export function installHint(input: { platform: Platform, installed: boolean, promptHeld: boolean, accepted: boolean, entry: PwaEntry, now: Date, hasPlayed: boolean }): InstallHint {
  if (input.platform === 'computer' || input.installed || !input.hasPlayed) return { kind: 'none' }
  if (input.accepted) return { kind: 'done' }
  if (input.entry.kind === 'done') return { kind: 'none' }
  if (input.entry.kind === 'later' && laterHides(input.entry.day, input.now)) return { kind: 'none' }
  if (input.platform === 'ios') return { kind: 'banner', via: 'sheet' }
  return input.promptHeld ? { kind: 'banner', via: 'prompt' } : { kind: 'none' }
}
