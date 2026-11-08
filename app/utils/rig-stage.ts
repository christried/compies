// What several rigs on one page share (#311, hand-off § Performance): one stage, so at most one full-body rig animates, and one observer,
// so a rig that is off-screen rests. Module-level state, touched only after mount (never on the server).

/** Called with `true` when the rig may animate and `false` when another full rig took the stage. */
type Seat = (allowed: boolean) => void

const seats: Seat[] = []

/** A full-body rig takes the stage: it, the newest, animates, and the ones before it freeze at their pose. Returns how to leave; the next newest then resumes. */
export function joinStage(seat: Seat): () => void {
  seats.at(-1)?.(false)
  seats.push(seat)
  seat(true)
  return () => {
    const index = seats.indexOf(seat)
    if (index === -1) return
    seats.splice(index, 1)
    if (index === seats.length) seats.at(-1)?.(true)
  }
}

const watched = new Map<Element, (visible: boolean) => void>()
let observer: IntersectionObserver | undefined

/** Tells `onChange` whether `element` is within 120 px of the viewport. A browser without IntersectionObserver counts as on screen. Returns how to stop. */
export function watchView(element: Element, onChange: (visible: boolean) => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onChange(true)
    return () => {}
  }
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) watched.get(entry.target)?.(entry.isIntersecting)
  }, { rootMargin: '120px' })
  watched.set(element, onChange)
  observer.observe(element)
  return () => {
    watched.delete(element)
    observer?.unobserve(element)
    if (watched.size === 0) {
      observer?.disconnect()
      observer = undefined
    }
  }
}
