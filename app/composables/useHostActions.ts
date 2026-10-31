import { CalendarCheck, CalendarClock, Flag, Link as LinkIcon, Play, Settings2 } from '@lucide/vue'
import type { DockAction } from '~/components/HostDock.vue'
import { hostDockState } from '~/utils/host-dock'
import type { EventView } from '~~/shared/event'
import { settingsPath } from '~~/shared/links'

// The Host's dock actions (11-event-seite § HostDock, #155, #164): hostDockState says which primary the Event offers (Event
// einrichten, Termin festlegen, Session starten or beenden, or none after the last Session). „Session starten“ looks
// disabled with the start rule's reason when it cannot start; „Session beenden“ is a hold. „Termin für Session m“ stays
// while another Session still polls, and „Termine bearbeiten“ while the Date poll is open. Every Phase before the Event
// finishes has Einstellungen and Einladen (#147). „Termin festlegen“ looks disabled with its reason when no open future
// Slot can become a Date (#52). What each action does is the page's: it passes the handlers.

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
    const datesOpen = toValue(pollOpen)
    const invite: DockAction = { key: 'invite', label: t('common.invite'), icon: LinkIcon, group: t('dock.group.people'), place: 'dock', run: handlers.invite }
    const settings: DockAction = {
      key: 'settings',
      label: t(state.kind === 'setup' ? 'dock.setup' : 'dock.settings'),
      icon: Settings2,
      group: t('dock.group.event'),
      primary: state.primary === 'setup',
      place: state.kind === 'setup' ? 'dock' : 'more',
      run: () => navigateTo(settingsPath(toValue(slug))),
    }
    const slots: DockAction = { key: 'slots', label: t('mvp.slots.title'), icon: CalendarClock, group: t('dock.group.dates'), place: 'more', run: handlers.editSlots }
    const datesOnly = datesOpen ? [slots] : []

    const setDate: DockAction = {
      key: 'setDate',
      // Named by its Session once another Session is dated or started; before that it is simply „Termin festlegen“.
      label: t(state.pollNumber !== null && ['teams', 'running', 'between'].includes(state.kind) ? 'dock.setDateN' : 'dock.setDate', { n: state.pollNumber }),
      icon: CalendarCheck,
      group: t('dock.group.dates'),
      primary: state.primary === 'setDate',
      disabledReason: toValue(setBlocked) ?? undefined,
      // Next to a Session to start or end the Date is a second action; while the Event is being set up or runs it waits in „Mehr“.
      place: state.primary === 'setDate' || state.kind === 'teams' || state.kind === 'between' ? 'dock' : 'more',
      run: handlers.setDate,
    }
    const dates = datesOpen ? [setDate] : []

    if (state.kind === 'setup') return [settings, invite, ...dates, ...datesOnly]
    if (state.primary === 'start') {
      const reason = state.startRejection === null ? undefined : t(`dock.startBlocked.${state.startRejection}`)
      const start: DockAction = {
        key: 'start',
        label: t(state.number === null ? 'dock.start' : 'dock.startN', { n: state.number }),
        icon: Play,
        group: t('dock.group.event'),
        primary: true,
        disabledReason: reason,
        run: () => (reason ? toast({ tone: 'info', text: reason }) : handlers.start()),
      }
      return [start, ...dates, invite, ...datesOnly, settings]
    }
    if (state.primary === 'end') {
      const end: DockAction = {
        key: 'end',
        label: t(state.number === null ? 'dock.endSession' : 'dock.endN', { n: state.number }),
        icon: Flag,
        group: t('dock.group.event'),
        primary: true,
        hold: true,
        run: handlers.end,
      }
      return [end, invite, ...dates, ...datesOnly, settings]
    }
    if (state.primary === 'setDate') return [...dates, invite, ...datesOnly, settings]
    return [invite, settings]
  })
}
