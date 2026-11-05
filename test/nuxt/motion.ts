import { vi } from 'vitest'

/**
 * The page's motion setting, as the tokens put it in `--cp-motion` (#311). Calls through: GSAP reads other properties with
 * `getComputedStyle` too, so the wholesale mock of coin-flip.test.ts would break it. Undo with `vi.restoreAllMocks()`.
 */
const realComputedStyle = window.getComputedStyle.bind(window)
export function motion(value: 'full' | 'reduced') {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
    const style = realComputedStyle(element, pseudo)
    return new Proxy(style, {
      get(target, property) {
        if (property === 'getPropertyValue') return (name: string) => (name === '--cp-motion' ? value : target.getPropertyValue(name))
        const member = Reflect.get(target, property)
        return typeof member === 'function' ? member.bind(target) : member
      },
    })
  })
}
