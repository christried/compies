import { beforeFinish, type EventView } from '~~/shared/event'
import type { ResultPlace } from '~~/shared/results'
import type { PointsTable } from '~~/shared/settings'

// What the history needs of the page to offer a Correction (#275, #283): the page's view and its save, read by GameHistory and the tabs
// that show it. It is the page-to-history contract, not a rule of the result sheet, which is result-draft.ts (#288).

/** What the history needs of the page to offer a Correction (#275); null/absent = no „Korrigieren“ (a Member, or the Event has finished). */
export interface HistoryCorrections {
  pointsTable: PointsTable
  /** The Game count, for the sheet's kicker „Korrektur: Spiel 2 von 6“. */
  total: number
  /** Sends the corrected Places of a Round; resolves to whether the server took them (the sheet closes then). The page passes `actions.enterResult`: it is the same PUT. */
  save: (roundId: string, places: ResultPlace[]) => Promise<boolean>
}

/**
 * The history's „Korrigieren“ (#275, #283): only for the Host, only while the Event has not finished, and only once the Event has its settings
 * and its end (the server refuses everyone else and a finished Event too). `save` is the page's `enterResult`.
 */
export function historyCorrections(view: Pick<EventView, 'settings' | 'end'> & { event: Pick<EventView['event'], 'phase' | 'isHost'> }, save: HistoryCorrections['save']): HistoryCorrections | null {
  if (!view.event.isHost || !beforeFinish(view.event.phase) || !view.settings || !view.end) return null
  return { pointsTable: view.settings.pointsTable, total: view.end.gameCount, save }
}
