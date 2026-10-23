// Whether a Host dock is on screen. HostDock attaches while it is mounted, and ToastStack lifts its
// toasts above the dock (or above the crown button on phones) while one is attached.
export function useHostDock() {
  const attached = useState('host-dock-attached', () => 0)

  return {
    docked: computed(() => attached.value > 0),
    /** Counts one dock in; the returned function counts it out again. */
    attach() {
      attached.value += 1
      return () => {
        attached.value -= 1
      }
    },
  }
}
