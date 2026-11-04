import { CalendarCheck, CalendarClock, CirclePlus, Coins, Dices, Flag, Gamepad2, Handshake, Link as LinkIcon, Medal, Play, Settings2, ShieldPlus, Timer } from '@lucide/vue'
import type { DockAction } from '~/components/HostDock.vue'
import { coinBlockedKey, dockLayout, hostDockState, lastGameBlockedKey, setBlockedKey, type DockKey } from '~/utils/host-dock'
import type { EventView } from '~~/shared/event'
import { settingsPath } from '~~/shared/links'
import { leadersOf } from '~~/shared/results'

// The Host's dock actions (11-event-seite § HostDock, #155, #164): hostDockState says which primary the Event offers (Event
// einrichten, Termin festlegen, Session starten, Nächstes Spiel setzen, Rad drehen, Event abschließen, or none after the last Session) and
// dockLayout which actions sit where (named parts: primary, secondary, more; review 1.4 A4). Each action is one entry below.
// „Session starten“, „Nächstes Spiel setzen“ and „Rad drehen“ look disabled with the rule's reason when they cannot run; „Session beenden“ is
// a secondary hold. At a Tie (#278) „Unentschieden beenden“ takes the primary's place as a hold, and „Letztes Spiel hinzufügen“ is a plain
// button beside it; the finish holds send the Parties on Place 1 they showed (review 0.8 S2). „Termin für Session m“ stays while another
// Session still polls, and „Termine bearbeiten“ while the Date poll is open.
// Every Phase before the Event finishes has Einstellungen and Einladen (#147). „Termin festlegen“ looks disabled with its reason
// when no open future Slot can become a Date (#52). What each action does is the page's: it passes the handlers.

export interface HostActionHandlers {
  /** Opens the invite sheet. */
  invite: () => void
  /** Opens the Slot editor. */
  editSlots: () => void
  /** Opens the confirm dialog for the Date. */
  setDate: () => void
  /** Opens the start dialog. */
  start: () => void
  /** Ends the Running Session; the dock's hold calls it after the hold and learns whether the server took it. */
  end: () => Promise<boolean>
  /**
   * Finishes the Event with a winner (#277); the dock's hold calls it after the hold and learns whether the server took it. The held label is the
   * outcome sent (#278), `winners` the Parties on Place 1 of the Standings the dock showed (review 0.8 S2).
   */
  finish: (winners: number[]) => Promise<boolean>
  /** Finishes the Event as a Tie (#278), like `finish`. */
  finishTie: (winners: number[]) => Promise<boolean>
  /** Adds the last game while the Standings are a Tie (#278); the button learns whether the server took it. */
  lastGame: () => Promise<boolean>
  /** Opens the picker for the next game (#228). */
  setGame: () => void
  /** Spins the Lucky Wheel (#229). */
  spin: () => void
  /** Opens the sheet that sets the Countdown (#236). */
  countdown: () => void
  /** Tosses the Coin flip (#235): no dialog; the page sends it and refetches the Event read. */
  coin: () => void
  /** Opens the sheet that grants a Party a Bonus Veto (#233). */
  bonusVeto: () => void
}

export function useHostActions(
  view: MaybeRefOrGetter<EventView | null | undefined>,
  slug: MaybeRefOrGetter<string>,
  { pollOpen, setBlocked, serverNow }: { pollOpen: MaybeRefOrGetter<boolean>, setBlocked: MaybeRefOrGetter<string | null>, serverNow: () => number },
  handlers: HostActionHandlers,
) {
  const { t } = useI18n()
  const { toast } = useToast()

  return computed((): DockAction[] => {
    const current = toValue(view)
    if (!current) return []
    const state = hostDockState(current)
    // The Bonus Veto is in the dock while the Event's read allows one (#233): a Lucky Wheel, and no Event-level reason refuses it.
    const layout = dockLayout(state, { pollOpen: toValue(pollOpen), bonusVetoOpen: current.bonusVetoes?.rejection === null })
    /** Runs `run`, or answers the click with the reason as a toast while the rule refuses. */
    const guarded = (reason: string | undefined, run: () => void) => () => (reason ? toast({ tone: 'info', text: reason }) : run())

    const startReason = state.startRejection === null ? undefined : t(`dock.startBlocked.${state.startRejection}`)
    const setReason = state.setRejection === null ? undefined : t(setBlockedKey(state.setRejection))
    const spinReason = state.spinRejection === null ? undefined : t(setBlockedKey(state.spinRejection))
    const lastGameReason = state.lastGameRejection === null ? undefined : t(lastGameBlockedKey(state.lastGameRejection))
    // The coin's reason is the rule's, with the server clock (#235): it stays while the toss flies, and the Event read's landing refetch clears it.
    const coinKey = coinBlockedKey(current, serverNow())
    const coinReason = coinKey === null ? undefined : t(coinKey)
    // The Parties on Place 1 of the Standings this dock shows: what the finish tells the server the Host saw (review 0.8 S2).
    const winners = leadersOf(current.standings ?? [])

    const entries: Record<DockKey, DockAction> = {
      invite: { key: 'invite', label: t('common.invite'), icon: LinkIcon, group: t('dock.group.people'), run: handlers.invite },
      settings: {
        key: 'settings',
        label: t(state.kind === 'setup' ? 'dock.setup' : 'dock.settings'),
        icon: Settings2,
        group: t('dock.group.event'),
        run: () => navigateTo(settingsPath(toValue(slug))),
      },
      slots: { key: 'slots', label: t('mvp.slots.title'), icon: CalendarClock, group: t('dock.group.dates'), run: handlers.editSlots },
      setDate: {
        key: 'setDate',
        // Named by its Session once another Session is dated or started; before that it is simply „Termin festlegen“.
        label: t(state.pollNumber !== null && ['teams', 'running', 'between'].includes(state.kind) ? 'dock.setDateN' : 'dock.setDate', { n: state.pollNumber }),
        icon: CalendarCheck,
        group: t('dock.group.dates'),
        disabledReason: toValue(setBlocked) ?? undefined,
        run: handlers.setDate,
      },
      start: {
        key: 'start',
        label: t(state.number === null ? 'dock.start' : 'dock.startN', { n: state.number }),
        icon: Play,
        group: t('dock.group.event'),
        disabledReason: startReason,
        run: guarded(startReason, handlers.start),
      },
      end: {
        key: 'end',
        label: t(state.number === null ? 'dock.endSession' : 'dock.endN', { n: state.number }),
        icon: Flag,
        group: t('dock.group.event'),
        hold: true,
        run: handlers.end,
      },
      // The medal of the feed's `event_finished` (#277); a hold like „Session beenden“, since it cannot be undone.
      finish: {
        key: 'finish',
        label: t('dock.finish'),
        icon: Medal,
        group: t('dock.group.event'),
        hold: true,
        run: () => handlers.finish(winners),
      },
      // With a Tie the Host decides (#278): the same hold, for „Unentschieden“. The server compares the outcome with the Standings, so a stale hold is refused.
      finishTie: {
        key: 'finishTie',
        label: t('dock.finishTie'),
        icon: Handshake,
        group: t('dock.group.event'),
        hold: true,
        run: () => handlers.finishTie(winners),
      },
      // A plain button: only the primary is held, and the server makes a double press harmless. At the maximum it stays, dashed, with its reason.
      lastGame: {
        key: 'lastGame',
        label: t('dock.lastGame'),
        icon: CirclePlus,
        group: t('dock.group.event'),
        disabledReason: lastGameReason,
        run: guarded(lastGameReason, () => void handlers.lastGame()),
      },
      setGame: {
        key: 'setGame',
        label: t('dock.setGame'),
        icon: Gamepad2,
        group: t('dock.group.game'),
        disabledReason: setReason,
        run: guarded(setReason, handlers.setGame),
      },
      spin: {
        key: 'spin',
        // A Round whose draws were all vetoed waits for a respin (#231): the same action, named for it.
        label: t(current.setGame?.respin ? 'dock.respin' : 'dock.spin'),
        icon: Dices,
        group: t('dock.group.game'),
        disabledReason: spinReason,
        run: guarded(spinReason, handlers.spin),
      },
      // One toss at a time: the action is disabled with the reason while the coin flies (#235), and otherwise tosses at once.
      coin: {
        key: 'coin',
        label: t('coin.title'),
        icon: Coins,
        group: t('dock.group.game'),
        disabledReason: coinReason,
        run: guarded(coinReason, handlers.coin),
      },
      // The sheet itself says when a Countdown runs (CountdownSheet); the action always opens it (#236).
      countdown: {
        key: 'countdown',
        label: t('countdown.title'),
        icon: Timer,
        group: t('dock.group.game'),
        run: handlers.countdown,
      },
      // The sheet lists the Parties and holds each grant to confirm (#233); the action only opens it.
      bonusVeto: {
        key: 'bonusVeto',
        label: t('dock.bonusVeto'),
        icon: ShieldPlus,
        group: t('dock.group.game'),
        run: handlers.bonusVeto,
      },
    }

    // The dock lists the parts in this order; `more` waits behind „Mehr“, the others sit in the pill.
    const part = (keys: DockKey[], fields: Pick<DockAction, 'primary' | 'place'>): DockAction[] => keys.map(key => ({ ...entries[key], ...fields }))
    return [
      ...part(layout.primary, { primary: true, place: 'dock' }),
      ...part(layout.secondary, { place: 'dock' }),
      ...part(layout.more, { place: 'more' }),
    ]
  })
}
