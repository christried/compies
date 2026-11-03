import { useEventMutation } from '~/composables/useEventMutation'
import type { CountdownCommand } from '~~/shared/countdown'
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

  /** Enters an open Round's Result, the Host's only (#273); the sheet learns whether the server took it and closes. */
  const enterResult = (roundId: string, places: ResultPlace[]) => send('PUT', `rounds/${roundId}/result`, { body: { places } })

  /** Spins the Lucky Wheel for the next game (#229). */
  const spin = () => send('POST', 'rounds/spin')

  /** Tosses the coin for the Session (#235). */
  const toss = () => send('POST', 'coin')

  /** Starts, pauses or resets the Countdown (#236). */
  const countdown = (action: CountdownCommand) => send('POST', `countdown/${action}`)

  /** Ends the Running Session; the dock's hold calls this after the hold and learns whether the server took it. */
  const endSession = () => send('POST', 'sessions/end')

  /** Withdraws one Session's Date and frees its Slot (#55). */
  const reopenSession = (sessionId: string) => send('POST', `sessions/${sessionId}/reopen`)

  /** Removes a Session, whose Slot goes back to the poll (#55). */
  const removeSession = (sessionId: string) => send('DELETE', `sessions/${sessionId}`)

  return { castVeto, skipClip, putBackRound, enterResult, spin, toss, countdown, endSession, reopenSession, removeSession }
}
