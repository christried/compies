import { useEventMutation } from '~/composables/useEventMutation'
import type { CountdownCommand } from '~~/shared/countdown'
import type { LastGameAdded } from '~~/shared/event'
import type { FinishRequest } from '~~/shared/finish'
import type { ResultPlace } from '~~/shared/results'

// The stage's changes (#257, Q6 of review 0.7): the Host's Session, round and Countdown actions and the Players' Veto and clip
// actions, each one `send` to its path. The page holds no request string; a refused change shows the shared error copy, and the
// Event is refetched taken or not (useEventMutation, ADR 0001). The Host's dialogs and the Activity sheets still send their own.

/** `refresh` refetches the Event, or asks the page to (useEventMutation). */
export function useStageActions(slug: MaybeRefOrGetter<string>, refresh: () => unknown) {
  const { send } = useEventMutation(slug, refresh)

  /** A Player casts their Party's Veto on a draw (#231); the hold on the button learns whether the server took it. */
  const castVeto = (drawId: string) => send('POST', `draws/${drawId}/veto`)

  /** The Host skips the clip for everyone (#230); the overlay learns whether the server took it. */
  const skipClip = () => send('POST', 'clip/skip')

  /** Puts an open Round back (#228); the hold on its card learns whether the server took it. */
  const putBackRound = (roundId: string) => send('DELETE', `rounds/${roundId}`)

  /** Enters an open Round's Result or corrects one, the Host's only (#273, #275); the sheet learns whether the server took it and closes. */
  const enterResult = (roundId: string, places: ResultPlace[]) => send('PUT', `rounds/${roundId}/result`, { body: { places } })

  /** Spins the Lucky Wheel for the next game (#229). */
  const spin = () => send('POST', 'rounds/spin')

  /** Tosses the coin for the Session (#235). */
  const toss = () => send('POST', 'coin')
  /** Starts the Award ceremony of the finished Event (#309). Not quiet: a refused double start shows „Die Siegerehrung läuft noch.“ */
  const startCeremony = () => send('POST', 'ceremony')

  /** Starts, pauses or resets the Countdown (#236). */
  const countdown = (action: CountdownCommand) => send('POST', `countdown/${action}`)

  /** Ends the Running Session; the dock's hold calls this after the hold and learns whether the server took it. */
  const endSession = () => send('POST', 'sessions/end')

  /**
   * Finishes the Event with the outcome the Host held and the Parties he saw on Place 1 (#277, #278, review 0.8 S2); the dock's hold calls this
   * after the hold and learns whether the server took it. The server refuses with `standings_changed` when either differs from the Standings now.
   * A retry after a lost answer finds the Phase `finished` and answers `wrong_phase`: the first press worked, so it is quiet and counts as taken
   * (#288, as the last-game path does). The Event is refetched and the page reads finished.
   */
  const finish = (request: FinishRequest) => send('POST', 'finish', { body: { outcome: request.outcome, winners: request.winners }, quiet: ['wrong_phase'] })

  /**
   * Raises the Game count by one while the Standings are a Tie (#278); the dock button learns whether the server took it. A second press finds the count
   * incomplete (`results_missing`), which means the first one worked, so it is quiet and counts as taken. At the maximum the dock's own copy answers.
   */
  const lastGame = () => send<LastGameAdded>('POST', 'last-game', { quiet: ['results_missing'], errorKeys: { game_count_range: 'dock.lastGameBlocked.game_count_range' } })

  /** Withdraws one Session's Date and frees its Slot (#55). */
  const reopenSession = (sessionId: string) => send('POST', `sessions/${sessionId}/reopen`)

  /** Removes a Session, whose Slot goes back to the poll (#55). */
  const removeSession = (sessionId: string) => send('DELETE', `sessions/${sessionId}`)

  return { castVeto, skipClip, putBackRound, enterResult, spin, toss, startCeremony, countdown, endSession, finish, lastGame, reopenSession, removeSession }
}
