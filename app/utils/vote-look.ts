import type { Component } from 'vue'
import { Check, Minus, X } from '@lucide/vue'
import type { VoteValue } from '~~/shared/poll'

// One look per Vote value (#50, #75): its label, its fill, the icon on the Slot card and the legend (Meh is text
// only there), and the icon in the matrix cell (Meh keeps its minus there, 06-copy § Rules for developers).
export interface VoteLook {
  labelKey: string
  icon?: Component
  cellIcon: Component
  fill: string
}

export const VOTE_LOOK: Record<VoteValue, VoteLook> = {
  yes: { labelKey: 'poll.yes', icon: Check, cellIcon: Check, fill: 'bg-success text-on-success' },
  maybe: { labelKey: 'poll.maybe', cellIcon: Minus, fill: 'bg-warning text-on-warning' },
  no: { labelKey: 'poll.no', icon: X, cellIcon: X, fill: 'bg-error text-on-error' },
}

export type VoteCountTone = 'text-success-fg' | 'text-warning-fg' | 'text-error-fg'

/** The Has voted rule (GLOSSARY) as a colour: everyone green, some yellow, nobody red (#798). With no future Slot left nobody has voted, so 0 of 0 is red. */
export function voteCountTone({ voted, total }: { voted: number, total: number }): VoteCountTone {
  if (voted === 0) return 'text-error-fg'
  return voted >= total ? 'text-success-fg' : 'text-warning-fg'
}
