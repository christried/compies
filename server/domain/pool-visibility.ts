import type { EventSettings } from '../../shared/settings'

/**
 * Whether a viewer sees the games of the pools, or only how many there are (#146). The Host always sees them,
 * also under a Hidden wheel. Every other Member gets the counts for now (the safe default); #148 adds the rule
 * that lifts it while the wheel is not hidden (`|| !settings?.hiddenWheel`).
 */
export function poolsVisibleTo({ isHost }: { isHost: boolean, settings: EventSettings | null }): boolean {
  return isHost
}
