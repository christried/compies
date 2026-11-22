import type { Ref } from 'vue'
import { fitTags } from '~/utils/tag-fit'

// The one reader of the DOM behind a game card's Tags (#711): it measures the chips, the row they flow in and a probe of „+X“, and `fitTags` says how many
// fit. The chip widths are cached per list of Tag keys, so a change of the row's width (the window, a breakpoint) fits again from the cache; a change of the
// Tags, or of the font when a web font arrives late, measures again. Client only: on the server and before the first measurement `shown` is null and the card
// draws every chip invisible, in a block whose height is already final, so nothing moves when the fit lands.
//
// `row` is the chips' container, `probe` an invisible stand-in for the „+X“ button at its widest label, `keys` the game's Tag keys in order.
// How many lines the chips may fill is read off the CSS, so there is one source: a wrapping row is the card's two lines, a nowrap row the list row's one.

const CARD_LINES = 2
const ROW_LINES = 1

export function useTagFit(row: Readonly<Ref<HTMLElement | null>>, probe: Readonly<Ref<HTMLElement | null>>, keys: Readonly<Ref<string[]>>) {
  // The chips' widths for the current keys; null while they are not measured.
  const widths = shallowRef<number[] | null>(null)
  const rowWidth = ref(0)
  const gap = ref(0)
  const moreWidth = ref(0)
  const rows = ref(CARD_LINES)

  /** How many chips show, or null before the first measurement. */
  const shown = computed(() => widths.value === null || widths.value.length !== keys.value.length
    ? null
    : fitTags({ widths: widths.value, rowWidth: rowWidth.value, gap: gap.value, moreWidth: moreWidth.value, rows: rows.value }))
  const hidden = computed(() => shown.value === null ? 0 : keys.value.length - shown.value)

  /**
   * Which chips the card cuts: one as wide as the row or wider, and, in a single line, a first chip that leaves no room for „+X“. Only these carry
   * their full word as a tooltip.
   */
  const cut = computed<boolean[]>(() => {
    const list = widths.value ?? []
    if (rowWidth.value <= 0) return list.map(() => false)
    return list.map((width, index) => width >= rowWidth.value
      || (rows.value === ROW_LINES && hidden.value > 0 && shown.value === 1 && index === 0 && width + gap.value + moreWidth.value > rowWidth.value))
  })

  function readBox() {
    const el = row.value
    if (!el) return
    const style = getComputedStyle(el)
    rowWidth.value = el.getBoundingClientRect().width
    gap.value = Number.parseFloat(style.columnGap) || 0
    rows.value = style.flexWrap === 'wrap' ? CARD_LINES : ROW_LINES
    moreWidth.value = probe.value?.getBoundingClientRect().width ?? 0
  }

  // Needs every chip drawn: the card draws them all (invisible) while `widths` is null.
  function measureChips() {
    const el = row.value
    if (!el) return
    const chips = [...el.querySelectorAll<HTMLElement>('[data-tag-chip]')]
    if (chips.length !== keys.value.length) return
    readBox()
    widths.value = chips.map(chip => chip.getBoundingClientRect().width)
  }

  async function remeasure() {
    widths.value = null
    await nextTick()
    measureChips()
  }

  let observer: ResizeObserver | undefined
  watch(row, (el) => {
    observer?.disconnect()
    observer = undefined
    if (!el) {
      widths.value = null
      return
    }
    measureChips()
    // No ResizeObserver (a browser without it, a test): the first measurement stands.
    if (typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver(readBox)
    observer.observe(el)
  }, { flush: 'post' })

  watch(() => keys.value.join('\0'), () => {
    if (row.value) void remeasure()
  }, { flush: 'post' })

  onMounted(() => {
    // A web font that arrives after the first measurement changes the chips' widths.
    if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') {
      void document.fonts.ready.then(() => {
        if (row.value) void remeasure()
      })
    }
  })
  onBeforeUnmount(() => observer?.disconnect())

  return { shown, hidden, rows, cut }
}
