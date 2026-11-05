// The Phases of an Event (GLOSSARY: Phase) and `beforeFinish`, in a file of their own so the rule files (results.ts, finish.ts, settings.ts,
// rounds.ts) can name a Phase without importing event.ts, which imports stage.ts, which imports them (review 0.8 Q12). shared/event.ts re-exports all three.

/** The Phases of an Event (GLOSSARY: Phase). The MVP uses poll and date_set; the rest come with 1.0. */
export const PHASES = ['draft', 'poll', 'date_set', 'running', 'finished', 'archived'] as const
export type Phase = (typeof PHASES)[number]

/** Every Phase before the Event is finished. What may still change (Sessions, settings) is decided by this one set. */
export function beforeFinish(phase: Phase): boolean {
  return phase === 'draft' || phase === 'poll' || phase === 'date_set' || phase === 'running'
}
