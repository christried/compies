import type { EventSettings } from '../../shared/settings'

/** What decides whether a viewer sees the games of an Event's pools (#225): the Host, or anyone while the Pool preview is on. */
export interface PoolFacts { isHost: boolean, poolPreview: boolean }

/**
 * The one rule for who sees the games of the pools (#146, #148, #183, #225). The Host always sees them. Every other
 * Member sees them only while the Pool preview is on; a Hidden wheel always has it off, so the rule needs nothing else.
 * The Event read and the image route both ask here, so a Member never sees a name without its image or the reverse.
 * Glücksrad (0.7) adds the "drawn games" branch here: a game that was drawn becomes visible with the Pool preview off.
 */
export function canSeePoolGames({ isHost, poolPreview }: PoolFacts): boolean {
  return isHost || poolPreview
}

/** The facts from an Event's settings (null = not set up). An Event that is not set up has nothing to see: the safe default. */
export function poolFactsOf({ isHost, settings }: { isHost: boolean, settings: EventSettings | null }): PoolFacts {
  return { isHost, poolPreview: settings?.poolPreview ?? false }
}
