import { announce, countdownFrame, durationWords, heardAt, lastSecondAt, type Announcement, type Heard } from '~/utils/countdown-card'
import { countdownBurst, countdownTick } from '~/utils/motion'
import { countdownEndsAt, remainingMsAt } from '~~/shared/countdown'
import type { CountdownView } from '~~/shared/stage'

/** What `useCountdownCard` reads of the card's props (a props object is assignable; it is read inside computeds, watches and callbacks, so it stays reactive). */
export interface CountdownCardInput {
  readonly countdown: CountdownView
  /** The server's clock in epoch ms (the page's useServerClock): the time left is measured against it, not the User's clock. */
  readonly serverNow: () => number
  readonly announceSet: boolean
}

/**
 * The Countdown card's clock, status region, tick and burst (#236, #340, #363; 13-countdown, 04-motion § Countdown): the frame to draw from the
 * server's clock and the stored facts, the text of the status region (`role="status"`), and the two animations, which it registers itself. The
 * tick on each second and the burst at zero are the only things that remember anything, and only whether this component was there for them.
 * The card's template carries the parts as `ref="root"`, `"pulse"`, `"tile"`, `"ringA"`, `"ringB"`, `"digits"`, `"ghost"` and `"stamp"`.
 * Call it in `setup` after the component's own `useId()`, so the ids of the server render and the client do not move.
 */
export function useCountdownCard(props: CountdownCardInput) {
  const { t } = useI18n()
  const root = useTemplateRef<HTMLElement>('root')
  const pulse = useTemplateRef<HTMLElement>('pulse')
  const ghost = useTemplateRef<HTMLElement>('ghost')
  const tile = useTemplateRef<HTMLElement>('tile')
  const ringA = useTemplateRef<HTMLElement>('ringA')
  const ringB = useTemplateRef<HTMLElement>('ringB')
  const digits = useTemplateRef<HTMLElement>('digits')
  const stamp = useTemplateRef<HTMLElement>('stamp')

  // The server ticker (#257) reads the clock every frame while the Countdown runs and holds still when it is paused, at zero or scrolled
  // out of view. Before the page has mounted it is null: the frame is then read off the clock as it was when this component was created,
  // and that reading is kept in the payload, so the server render shows the current second and tone at once (a late joiner no longer sees
  // the start state for half a second) and the first client render agrees with it. The real time shows at mount.
  const created = useState<number>(`countdown-created-${useId()}`, () => props.serverNow())
  const now = useServerTicker(() => props.serverNow(), {
    until: () => countdownEndsAt(props.countdown),
    target: root,
  })
  const at = computed(() => now.value ?? created.value)
  const frame = computed(() => countdownFrame(props.countdown, at.value))

  const words = (seconds: number) => durationWords(seconds, (key, n) => t(key, n))
  /** The length the Host set, in words. */
  const durationSet = computed(() => words(Math.ceil(props.countdown.durationMs / 1000)))
  /** The time left now, in words, read off the server clock (for the status messages, which are written when something changes). */
  const leftNow = () => words(Math.ceil(remainingMsAt(props.countdown, props.serverNow()) / 1000))

  // What this component saw. `sawLastSecond` is set by a sample that is the last second of a running Countdown: only a viewer who was there for it
  // gets the burst. It is not reactive (nothing renders from it), it is cleared by a reset, and a component that is created after zero, whose ticker
  // was held through the last second (scrolled away, hidden tab) or that mounted past zero never sets it. `heard` is what the status region last
  // spoke about, so it writes on a change and never on the page load; it is taken at the first real sample.
  let sawLastSecond = false
  let heard: Heard | null = null
  const live = ref('')
  const SAYS: Record<Announcement, () => string> = {
    set: () => t('countdown.live.set', { duration: durationSet.value }),
    running: () => t('countdown.live.running', { duration: leftNow() }),
    paused: () => t('countdown.live.paused', { duration: leftNow() }),
    done: () => t('countdown.live.done'),
    reset: () => t('countdown.live.reset', { duration: durationSet.value }),
    final: () => t('countdown.live.final'),
  }
  const say = (message: Announcement | null) => {
    if (message) live.value = SAYS[message]()
  }

  watch(now, (sample) => {
    if (sample === null) return
    if (lastSecondAt(props.countdown, sample)) sawLastSecond = true
    if (heard === null) {
      heard = heardAt(props.countdown, sample)
      say(announce(null, heard, props.announceSet))
    }
  }, { flush: 'sync', immediate: true })

  // The status region speaks on state changes only, never per second (13 § Accessibility): one message per change, and a change that also
  // enters the last ten writes its own message only.
  watch(() => heardAt(props.countdown, at.value), (next) => {
    if (heard === null) return
    const message = announce(heard, next, props.announceSet)
    heard = next
    if (next.view === 'ready') sawLastSecond = false
    say(message)
  })

  // The tick: on each second boundary of the last ten, while it runs. Started sought to the time already spent in the second; a late joiner or
  // a tab back from the background gets none (`countdownTick`).
  watch(() => frame.value.s, (s) => {
    const { view, final } = frame.value
    if (view !== 'running' || !final || !pulse.value) return
    countdownTick(pulse.value, s * 1000 - remainingMsAt(props.countdown, props.serverNow()))
  }, { flush: 'post' })

  // The burst at zero, once the done view is rendered (the ghost and the stamp exist only then), for a viewer who saw the last second. `countdownBurst`
  // plays nothing when it is too late or motion is reduced: anyone else already has the steady view on screen, which is what the burst ends on.
  watch(() => frame.value.view, (view, before) => {
    if (before !== 'running' || view !== 'done' || !sawLastSecond) return
    const endsAt = countdownEndsAt(props.countdown)
    const card = root.value
    if (endsAt === null || !card || !ghost.value || !tile.value || !ringA.value || !ringB.value || !digits.value || !stamp.value) return
    countdownBurst({ ghost: ghost.value, tile: tile.value, ringA: ringA.value, ringB: ringB.value, digits: digits.value, stamp: stamp.value, card }, props.serverNow() - endsAt)
  }, { flush: 'post' })

  return { frame, live, words, durationSet }
}
