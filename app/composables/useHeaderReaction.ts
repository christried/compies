import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { EventView } from '~~/shared/event'
import { baseFor, connectionReaction, emoteReaction, vetoReaction, type HeaderBase } from '~/utils/header-reaction'
import type { BannerState } from '~/utils/connection-banner'
import type { Reaction } from '~/utils/rig-reaction'
import type { VetoArrivalState } from '~/utils/sound-cues'

// What the header's Compibert does on the Event page (#673, spec #927): the page decides, the header shows. The Event page calls `provideHeaderReaction`;
// `AppHeader` asks `useHeaderReaction`, which is null on every other page, so the header keeps the static head there. The pair is `provide` and `inject`,
// as `provideImmediateCue` and its reader are (useImmediateCue.ts). The rules are `app/utils/header-reaction.ts`'; no sound anywhere in here.

export interface HeaderReaction {
  /** What the head does while no reaction runs: confused while the connection is down. */
  base: Readonly<Ref<HeaderBase>>
  /** The latest reaction, a NEW object each time (the rig reads a new object as a new reaction); null before the first. */
  reaction: Readonly<ShallowRef<Reaction | null>>
}

export const headerReactionKey: InjectionKey<HeaderReaction> = Symbol('headerReaction')

/** What the reveal's rule reads of a read: the same four lines as `arrivalOf` in useCuePlayer.ts, which is under change in #670; the two may be joined later. */
function arrivalOf(view: EventView): VetoArrivalState {
  const vetoes = view.wheel?.vetoes
  const draw = vetoes?.draw
  return {
    draw: draw ? { drawId: draw.drawId, kind: draw.kind, stopAt: draw.stopAt, vetoEndsAt: draw.vetoEndsAt } : null,
    ownCast: vetoes?.own?.cast ?? false,
    revealedCount: vetoes?.revealed?.length ?? null,
  }
}

/**
 * The Event page's one call. Own = the Member (the rule of `emoteCue`), not the socket: a second device of the same Member reacts too. An Emote reacts
 * whether the board is covered or the tab hidden, as its sound does. The reveal's reaction is planned only while the server clock is `ready` (a device
 * clock running ahead would judge the reveal late), and every read becomes the baseline, so a first read, a reload, a refetch of the same read and a page
 * opened after the moment give nothing (ADR 0013: the reveal comes from the Event read, the Emote from the room message the page already handles).
 */
export function provideHeaderReaction(input: {
  room: Pick<ReturnType<typeof useEventRoom>, 'on'>
  view: () => EventView | null | undefined
  serverNow: () => number
  ready: () => boolean
  banner: Readonly<Ref<BannerState>>
}): void {
  const base = computed(() => baseFor(input.banner.value))
  const reaction = shallowRef<Reaction | null>(null)
  const show = (next: Reaction | null) => {
    if (next) reaction.value = next
  }

  input.room.on('emote.sent', (message) => {
    show(emoteReaction({ emote: message.emote, own: message.userId === input.view()?.viewerId, serverTime: message.serverTime, now: input.serverNow() }))
  })

  let previous: VetoArrivalState | null = null
  watch(() => input.view(), (view) => {
    if (!view) return
    const next = arrivalOf(view)
    if (input.ready()) show(vetoReaction(previous, next, input.serverNow()))
    previous = next
  }, { immediate: true })

  watch(input.banner, (now, before) => show(connectionReaction(before, now)))

  provide(headerReactionKey, { base, reaction })
}

/** The header's reader: the Event page's reactions, or null where nothing was provided (every other page). */
export function useHeaderReaction(): HeaderReaction | null {
  return inject(headerReactionKey, null)
}
