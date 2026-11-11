import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import EventStage from '~/components/EventStage.vue'
import { eventPageState } from '~/utils/event-page'
import type { StageInput } from '~/utils/event-stage'
import type { EventView } from '~~/shared/event'
import { defaultSettings } from '~~/shared/settings'
import { viewWithSessions } from './event-page'

// The room the stage keeps at the bottom for the Veto bar (F4) and the Host's dock, and the scroll position (#541, #441 item 6). Chrome's scroll anchoring,
// which holds the block a Member reads while a block above it changes height, is switched off for the whole render when `padding`, `margin`, `height`,
// `transform` or `position` change on an ancestor of the anchor. The Veto bar appears in the same render as the Wheel's Veto window, so a room made of the
// group's own padding made the board jump by the Wheel's whole height. The room is therefore an element of its own below the group, and the group's
// style stays the same whether the bar is there or not. jsdom has no layout: the test pins that nothing on the way from a block to the document changes.

const SAT = '2026-10-30T19:00:00.000Z'
const STARTED = '2026-10-30T19:30:00.000Z'

/** The stage of a running Event, as EventPage hands it over, with only the props that matter here. */
function props(vetoBarShown: boolean, isHost = false) {
  const view = viewWithSessions('room', [{ number: 1, startsAt: SAT, startedAt: STARTED }], 0, {
    event: { phase: 'running', isHost },
    settings: defaultSettings(),
    runningSessionId: 'session-room-0',
  }) as unknown as EventView
  return {
    slug: 'room',
    view,
    pageState: eventPageState(view as unknown as StageInput, 0),
    news: null,
    standingsHeld: false,
    actions: {} as never,
    votes: {} as never,
    slots: [],
    room: { on: () => () => {} },
    serverNow: () => Date.now(),
    online: () => undefined,
    pollOpen: false,
    canChangeSessions: false,
    vetoBarShown,
  }
}

let stage: Awaited<ReturnType<typeof mountSuspended>> | undefined

afterEach(() => {
  stage?.unmount()
  stage = undefined
})

/** The ancestors of the first block, up to the stage's root: where scroll anchoring watches for a change that would suppress it. */
function ancestorsOf(root: Element) {
  const chain: Element[] = []
  for (let element = root.querySelector('[data-block]')?.parentElement ?? null; element; element = element === root ? null : element.parentElement) chain.push(element)
  return chain
}

describe('the room under the stage', () => {
  it.each([false, true])('leaves the style of every ancestor of the blocks as it is when the Veto bar comes (Host %s)', async (isHost) => {
    stage = await mountSuspended(EventStage, { props: props(false, isHost) })
    const before = ancestorsOf(stage.element).map(element => element.className)

    await stage.setProps(props(true, isHost))

    expect(ancestorsOf(stage.element).map(element => element.className)).toEqual(before)
  })

  it('still makes room: taller under the Veto bar than without it, and an element that is no ancestor of a block', async () => {
    stage = await mountSuspended(EventStage, { props: props(false) })
    const room = () => (stage!.element as Element).querySelector<HTMLElement>('[data-stage-room]')
    const without = room()?.className

    await stage.setProps(props(true))

    expect(room()).not.toBeNull()
    expect(room()!.contains(stage.element.querySelector('[data-block]'))).toBe(false)
    expect(room()!.className).not.toBe(without)
  })
})
