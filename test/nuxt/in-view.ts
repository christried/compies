import { vi } from 'vitest'

/**
 * A stand-in for IntersectionObserver (#257): it records the options and the elements each observer watches, and a test says what
 * the observers see with `see`. Starts "in view" (an observer says nothing until the browser does). Undo with `vi.unstubAllGlobals()`.
 */
export interface ObserverStub {
  options: IntersectionObserverInit
  observed: Element[]
  disconnected: boolean
  see: (isIntersecting: boolean) => void
}

export function stubInView() {
  const observers: ObserverStub[] = []
  class Stub {
    stub: ObserverStub
    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
      this.stub = {
        options, observed: [], disconnected: false,
        see: isIntersecting => callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
      }
      observers.push(this.stub)
    }

    observe(element: Element) {
      this.stub.observed.push(element)
    }

    disconnect() {
      this.stub.disconnected = true
    }
  }
  vi.stubGlobal('IntersectionObserver', Stub)
  return {
    observers,
    /** Tells every observer that still watches something whether its element is in view. */
    see(isIntersecting: boolean) {
      for (const observer of observers) if (!observer.disconnected) observer.see(isIntersecting)
    },
  }
}
