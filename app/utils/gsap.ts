export type Gsap = typeof import('gsap').gsap

let loading: Promise<Gsap> | undefined

/**
 * The one home for loading GSAP (ADR 0015): a dynamic import, so no page without a rig or a ceremony ships it (`test/build/gsap-lazy.test.ts`).
 * Memoised; the first call sets the config once: no warnings for a tween on a part the head crop lacks, and a new tween on a property
 * replaces the running one (the hand-off's `gsap.defaults({ overwrite: 'auto' })`).
 */
export function loadGsap(): Promise<Gsap> {
  loading ??= import('gsap').then(({ gsap }) => {
    gsap.config({ nullTargetWarn: false })
    gsap.defaults({ overwrite: 'auto' })
    return gsap
  }).catch((error: unknown) => {
    // A chunk that failed to load (offline) may load next time.
    loading = undefined
    throw error
  })
  return loading
}
