// Whether the stepper's Zurück/Weiter pill is on screen (#701). The pill is fixed over the window's bottom (#613), where
// the page footer sits on a step shorter than the window, so PageFooter makes room under its links while one is
// attached. A signal of its own beside useHostDock: the toasts and the Veto bar place themselves by the Host dock's
// geometry, which the pill does not share.
export function useStepperPill() {
  const attached = useState('stepper-pill-attached', () => 0)

  return {
    shown: computed(() => attached.value > 0),
    /** Counts one pill in; the returned function counts it out again. */
    attach() {
      attached.value += 1
      return () => {
        attached.value -= 1
      }
    },
  }
}
