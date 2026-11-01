import { CalendarCheck, CalendarClock, Dices, Flag, Gamepad2, Link as LinkIcon, Play, Settings2, Timer } from '@lucide/vue'
import type { DockAction } from '~/components/HostDock.vue'
import { dockLayout, hostDockState, setBlockedKey, type DockKey } from '~/utils/host-dock'
import type { EventView } from '~~/shared/event'
import { settingsPath } from '~~/shared/links'

// The Host's dock actions (11-event-seite § HostDock, #155, #164): hostDockState says which primary the Event offers (Event
// einrichten, Termin festlegen, Session starten or beenden, Nächstes Spiel setzen, Rad drehen, or none after the last Session) and
// dockLayout which actions sit where (named parts: primary, secondary, more; review 1.4 A4). Each action is one entry below.
// „Session starten“, „Nächstes Spiel setzen“ and „Rad drehen“ look disabled with the rule's reason when they cannot run; „Session beenden“ is
// a hold. „Termin für Session m“ stays while another Session still polls, and „Termine bearbeiten“ while the Date poll is open.
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
  /** Opens the picker for the next game (#228). */
  setGame: () => void
  /** Spins the Lucky Wheel (#229). */
  spin: () => void
  /** Opens the sheet that sets the Countdown (#236). */
  countdown: () => void
}

export function useHostActions(
  view: MaybeRefOrGetter<EventView | null | undefined>,
  slug: MaybeRefOrGetter<string>,
  { pollOpen, setBlocked }: { pollOpen: MaybeRefOrGetter<boolean>, setBlocked: MaybeRefOrGetter<string | null> },
  handlers: HostActionHandlers,
) {
  const { t } = useI18n()
  const { toast } = useToast()

  return computed((): DockAction[] => {
    const current = toValue(view)
    if (!current) return []
    const state = hostDockState(current)
    const layout = dockLayout(state, toValue(pollOpen))
    /** Runs `run`, or answers the click with the reason as a toast while the rule refuses. */
    const guarded = (reason: string | undefined, run: () => void) => () => (reason ? toast({ tone: 'info', text: reason }) : run())

    const startReason = state.startRejection === null ? undefined : t(`dock.startBlocked.${state.startRejection}`)
    const setReason = state.setRejection === null ? undefined : t(setBlockedKey(state.setRejection))
    const spinReason = state.spinRejection === null ? undefined : t(setBlockedKey(state.spinRejection))

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
        label: t('dock.spin'),
        icon: Dices,
        group: t('dock.group.game'),
        disabledReason: spinReason,
        run: guarded(spinReason, handlers.spin),
      },
      // The sheet itself says when a Countdown runs (CountdownSheet); the action always opens it (#236).
      countdown: {
        key: 'countdown',
        label: t('countdown.title'),
        icon: Timer,
        group: t('dock.group.game'),
        run: handlers.countdown,
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
