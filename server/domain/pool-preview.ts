import type { EventSettings } from '../../shared/settings'

/** What decides whether a viewer sees the games of an Event's pools (#225): the Host, or anyone while the Pool preview is on. */
export interface PoolFacts { isHost: boolean, poolPreview: boolean }

/**
 * The one rule for who sees the games of the pools (#146, #148, #183, #225). The Host always sees them. Every other
 * Member sees them only while the Pool preview is on; a Hidden wheel always has it off, so the rule needs nothing else.
 * This is about the pools' lists (the Event read's `pools`); one game that was set is visible on its own (canSeeGame).
 */
export function canSeePoolGames({ isHost, poolPreview }: PoolFacts): boolean {
  return isHost || poolPreview
}

/** What decides whether a viewer sees one game: the pool facts, and whether a Round of the Event has set it (#228). */
export interface GameFacts extends PoolFacts { set: boolean }

/**
 * The one rule for who sees one game's picture (#228). A game that was set is visible to every Member of the Event from
 * the moment it is set, with the Pool preview off and under a Hidden wheel alike: the Round card shows it. Nothing else
 * becomes visible with it. Every other game follows the pools (canSeePoolGames). The image route asks here, so a Member
 * never sees a name (the Round card) without its picture. A put-back Round's game stays visible: everyone saw it set.
 * Glücksrad's draw (#229) adds a drawn game here from its stop instant on.
 */
export function canSeeGame({ set, ...pool }: GameFacts): boolean {
  return set || canSeePoolGames(pool)
}

/** The facts from an Event's settings (null = not set up). An Event that is not set up has nothing to see: the safe default. */
export function poolFactsOf({ isHost, settings }: { isHost: boolean, settings: EventSettings | null }): PoolFacts {
  return { isHost, poolPreview: settings?.poolPreview ?? false }
}
