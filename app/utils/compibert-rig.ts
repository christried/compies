// Compibert's rig (#311, spec #308 § Compibert's rig, ADR 0015): the animated twin of the still `Compibert`. A port of the seven states of
// `docs/design_handoff_compies/reference/compibert-options.js` with its numbers (its timings agree with `Compibert Rig.dc.html`).
// Pure TS on purpose: no Nuxt auto-imports, no `~/` aliases, only erasable syntax. Node runs this file directly in `scripts/bake-compibert.mjs`,
// and it is imported on the server too, so nothing here touches `window` or `navigator` at the top level.
// The unit test imports this file under the node tsconfig, which has no DOM types; the DOM is what the rig works on. A triple-slash
// directive only counts before the first statement.
/// <reference lib="dom" />
import type { Gsap } from './gsap'

export const RIG_STATES = ['idle', 'run', 'suspense', 'cheer', 'confused', 'laugh', 'dance'] as const
export type RigState = typeof RIG_STATES[number]
export type RigVariant = 'full' | 'head'

const VIEW_BOX = { full: '0 36 404 344', head: '212 40 192 192' }
// Lid rect y for open eyes: −(2·ry + 10), ry = 24.2 (the mount step that sets the lids).
const OPEN_LID = 'translate(0 -58.4)'

/**
 * The SVG text of one instance. Each instance needs its own ids for filters and clip paths, so the asset's element ids go and `cb_…` takes
 * `prefix`; the lids start open, so the server's still pose has open eyes before GSAP is there. The same four steps as `Compibert.vue`:
 * a known, accepted duplication, since the still stays plain markup (#311).
 */
export function rigMarkup(svg: string, variant: RigVariant, prefix: string): string {
  return svg
    .replace(/ id="compibert[^"]*"/g, '')
    .replace(/id="cb_/g, `id="${prefix}`)
    .replace(/url\(#cb_/g, `url(#${prefix}`)
    .replace(/<rect class="compibert-lid-/g, `<rect transform="${OPEN_LID}" class="compibert-lid-`)
    .replace(/viewBox="[^"]*"/, `viewBox="${VIEW_BOX[variant]}" width="100%" height="100%"`)
}

// The held poses of reduced motion (#308): the arms, the eyes and the mouth that a state's entry tweens leave, drawn without GSAP. Only `cheer`
// has one: the Jubel-Pose the changelog promises for reduced motion (#311). Every other state, `idle` included, holds the still pose.
const HELD_POSES: Partial<Record<RigState, { armLeft: number, armRight: number }>> = { cheer: { armLeft: -150, armRight: -140 } }

/**
 * Draws the pose `state` holds in `host`, the still markup, as attributes: the arms turn about their pivots, the eyes and the mouth switch. No GSAP
 * (#308): reduced motion never loads the chunk. A state without a held pose puts the still pose back, so the call can be repeated.
 */
export function holdPose(host: HTMLElement, state: RigState): void {
  const held = HELD_POSES[state]
  for (const [part, angle] of [['arm-left', held?.armLeft], ['arm-right', held?.armRight]] as const) {
    const element = host.querySelector(`.compibert-${part}`)
    if (!element) continue
    if (angle === undefined) element.removeAttribute('transform')
    else element.setAttribute('transform', `rotate(${angle} ${element.getAttribute('data-pivot') ?? '0 0'})`)
  }
  for (const element of host.querySelectorAll<SVGElement>('.cb-ball-left, .cb-ball-right')) element.style.opacity = held ? '0' : ''
  for (const element of host.querySelectorAll<SVGElement>('.cb-happy-left, .cb-happy-right')) element.style.opacity = held ? '1' : '0'
  for (const element of host.querySelectorAll<SVGElement>('[data-m]')) element.style.opacity = element.dataset.m === (held ? 'grin' : 'smile') ? '1' : '0'
}

export interface Rig {
  readonly state: RigState
  /** Eases to rest in 0.25 s (0.2 s when `reduced`) while the state's own tracks start; waits for a landing (root y < -3) up to 8 x 0.04 s, as the reference. */
  setState: (state: RigState, reduced: boolean) => void
  /** false: pause everything this rig owns (breath/tail loops, the state timeline, blink call, idle micro call, a pending landing wait); true: resume. */
  setActive: (on: boolean) => void
  /** Kills the blink and idle-micro delayed calls only (the bake needs a deterministic frame). */
  stopAmbient: () => void
  /** Kills every tween, timeline and delayed call it made. */
  destroy: () => void
}

type Timeline = ReturnType<Gsap['timeline']>
type Animation = ReturnType<Gsap['to']> | Timeline

// The production rig is the reference's `CH.F2` (profile figure), which `compibert-{full,head}.svg` are: only the `-left` eye, brow, pupil, lid,
// ball and happy arc exist, every `-right` part is missing (null here, dropped by `some`). Eye rx = ry = 24.2 (the lid's `data-ry`).
const LID_REST = 0
const BROW_REST = [0, 0] as const
// How far the pupil reaches in `suspense` and `confused`: [rx · .42, ry · .36].
const PUPIL_REACH = [24.2 * 0.42, 24.2 * 0.36] as const

const some = (...elements: (Element | null)[]) => elements.filter(element => element !== null)

/** Mounts the rig on `host`, which already holds the `<svg>` of `rigMarkup`: the server drew the still pose, GSAP takes over what is there. */
export function mountRig(gsap: Gsap, host: HTMLElement, options: { variant: RigVariant, reduced: boolean }): Rig {
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('mountRig: the host holds no <svg>')
  const random = gsap.utils.random
  const q = (name: string) => svg.querySelector(`.${name}`)
  const p = {
    root: q('compibert-root'), torso: q('compibert-torso'), body: q('compibert-body'), head: q('compibert-head'),
    armL: q('compibert-arm-left'), armR: q('compibert-arm-right'), legL: q('compibert-leg-left'), legR: q('compibert-leg-right'),
    shinL: q('compibert-shin-left'), shinR: q('compibert-shin-right'), t1: q('compibert-tail-1'), t2: q('compibert-tail-2'), t3: q('compibert-tail-3'),
    jaw: q('compibert-jaw'), browL: q('compibert-brow-left'), browR: q('compibert-brow-right'), lidL: q('compibert-lid-left'), lidR: q('compibert-lid-right'),
    pupL: q('compibert-pupil-left'), pupR: q('compibert-pupil-right'), ballL: q('cb-ball-left'), ballR: q('cb-ball-right'),
    hapL: q('cb-happy-left'), hapR: q('cb-happy-right'), shadow: q('compibert-shadow'),
    tear: q('cb-tear'), sweat: q('cb-sweat'), q: q('cb-q'),
  }
  const mouths = [...svg.querySelectorAll('.cb-m')]
  const fx = [...svg.querySelectorAll('.cb-fx > *')]

  const lidY = (element: Element, closed: number) => -(2 * Number(element.getAttribute('data-ry')) + 10) * (1 - closed)

  let state: RigState = 'idle'
  let held = options.reduced
  let active = true
  let ambient = true
  let destroyed = false
  let pupilsMoved = false
  const loops: Animation[] = []
  let stateTl: Timeline | undefined
  let blinkCall: Animation | undefined
  let microCall: Animation | undefined
  let pending: Animation | undefined
  // Blinks and idle micro actions are bare tweens: kept here so that pausing and destroying reach them too.
  const blinks = new Set<Animation>()
  const micros = new Set<Animation>()

  const owned = () => [...loops, stateTl, blinkCall, microCall, pending, ...blinks, ...micros].filter(animation => animation !== undefined)
  /** Pauses or resumes everything this rig owns. Loops held at frame 0 by reduced motion stay paused whatever the rig does. */
  function apply() {
    for (const animation of owned()) {
      if (!active) animation.pause()
      else if (!(held && loops.includes(animation))) animation.resume()
    }
  }
  const keep = <T extends Animation>(set: Set<Animation>, animation: T): T => {
    set.add(animation)
    animation.eventCallback('onComplete', () => set.delete(animation))
    return animation
  }

  // Mount steps of the hand-off: pivots, lids, brow, breath and tail loops, blink.
  for (const element of svg.querySelectorAll('[data-pivot]')) gsap.set(element, { svgOrigin: element.getAttribute('data-pivot') ?? undefined })
  // The lids' open pose came as a transform attribute for the still; GSAP now writes it (and does not have to parse it first).
  for (const lid of some(p.lidL, p.lidR)) lid.removeAttribute('transform')
  gsap.set(some(p.lidL, p.lidR), { y: (_index: number, element: Element) => lidY(element, LID_REST) })
  gsap.set(p.browL, { opacity: 1, rotation: BROW_REST[0] })

  // The head crop has no body, tail or limbs: it gets no breath and no tail loops.
  if (options.variant === 'full') {
    loops.push(gsap.to(p.body, { scaleY: 1.035, scaleX: 0.99, duration: random(1.6, 2.1), ease: 'sine.inOut', yoyo: true, repeat: -1 }))
    for (const [element, angle, delay] of [[p.t1, 4, 0], [p.t2, 7, 0.22], [p.t3, 11, 0.44]] as const) {
      gsap.set(element, { rotation: -angle })
      loops.push(gsap.to(element, { rotation: angle, duration: 1.5, ease: 'sine.inOut', yoyo: true, repeat: -1, delay }))
    }
  }
  // Reduced motion: the breath and tail loops stand at their start (story 30: nothing moves that was asked not to move).
  if (held) for (const loop of loops) loop.pause(0)

  /** The loops' speed per state (the reference's `r.speed`). */
  const speed = (timeScale: number) => {
    if (loops.length > 0) gsap.to(loops, { timeScale, duration: 0.4, overwrite: true })
  }

  const blink = () => {
    if (destroyed || !ambient) return
    const lids = some(p.lidL, p.lidR)
    const tl = keep(blinks, gsap.timeline())
    tl.to(lids, { y: 0, duration: 0.07, ease: 'power2.in' }).to(lids, { y: (_index: number, element: Element) => lidY(element, LID_REST), duration: 0.11, ease: 'power2.out' })
    if (Math.random() < 0.18) tl.to(lids, { y: 0, duration: 0.06 }).to(lids, { y: (_index: number, element: Element) => lidY(element, LID_REST), duration: 0.1 })
    blinkCall = gsap.delayedCall(random(1.6, 5.2), blink)
  }
  blinkCall = gsap.delayedCall(random(0.3, 3), blink)

  // Pieces of the reference's helpers, with the left-only figure baked in.
  const setLids = (closed: number, duration: number, tl: Timeline, at: number) => {
    tl.to(some(p.lidL, p.lidR), { y: (_index: number, element: Element) => lidY(element, closed), duration, ease: 'power2.inOut' }, at)
  }
  const mouth = (name: string, duration: number, tl: Timeline, at: number) => {
    for (const element of mouths) tl.to(element, { opacity: element.getAttribute('data-m') === name ? 1 : 0, duration }, at)
  }
  const happyEyes = (tl: Timeline) => {
    tl.to(some(p.ballL, p.ballR), { opacity: 0, duration: 0.1 }, 0.05).to(some(p.hapL, p.hapR), { opacity: 1, duration: 0.1 }, 0.05)
  }

  function restTo(tl: Timeline, duration: number) {
    tl.to(some(p.root, p.torso, p.head, p.armL, p.armR, p.legL, p.legR, p.shinL, p.shinR, p.jaw), { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, scale: 1, duration, ease: 'power2.out' }, 0)
    if (p.shadow) tl.to(p.shadow, { scaleX: 1, scaleY: 1, opacity: 0.14, duration }, 0)
    tl.to(p.browL, { opacity: 1, rotation: BROW_REST[0], y: 0, duration }, 0)
    tl.to(some(p.ballL, p.ballR), { opacity: 1, duration: 0.12 }, 0).to(some(p.hapL, p.hapR), { opacity: 0, duration: 0.12 }, 0).to(fx, { opacity: 0, duration: 0.15 }, 0)
    if (pupilsMoved) {
      pupilsMoved = false
      tl.to(some(p.pupL, p.pupR), { x: 0, y: 0, duration }, 0)
    }
    setLids(LID_REST, duration, tl, 0)
    mouth('smile', 0.12, tl, 0)
    speed(1)
  }

  const states: Record<RigState, (tl: Timeline, reduced: boolean) => void> = {
    idle(_tl, reduced) {
      // Small random actions keep him from looking like a loop; a held pose has none.
      if (reduced || !ambient) return
      const micro = () => {
        if (state !== 'idle' || destroyed || !ambient) return
        const k = Math.random()
        if (k < 0.45) keep(micros, gsap.to(p.head, { rotation: random(-8, 6), duration: random(0.35, 0.6), ease: 'sine.inOut', yoyo: true, repeat: 1, repeatDelay: random(0.5, 1.4) }))
        else if (k < 0.72) keep(micros, gsap.to(p.armL, { rotation: -22, duration: 0.14, yoyo: true, repeat: 3, ease: 'sine.inOut' }))
        else keep(micros, gsap.to(p.root, { y: -10, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out' }))
        microCall = gsap.delayedCall(random(2.2, 5.5), micro)
      }
      microCall = gsap.delayedCall(random(1, 3), micro)
    },
    cheer(tl) {
      happyEyes(tl)
      mouth('grin', 0.1, tl, 0.05)
      speed(2.2)
      tl.to(p.armL, { rotation: -150, duration: 0.3, ease: 'back.out(2)' }, 0.05).to(p.armR, { rotation: -140, duration: 0.3, ease: 'back.out(2)' }, 0.09)
      const jump = gsap.timeline({ repeat: -1, repeatDelay: 0.1 })
      jump.to(p.root, { y: -38, duration: 0.26, ease: 'power2.out' }).to(p.shadow, { scaleX: 0.6, scaleY: 0.6, opacity: 0.06, duration: 0.26, ease: 'power2.out' }, 0)
        .to(p.armL, { rotation: -168, duration: 0.26 }, 0).to(p.armR, { rotation: -118, duration: 0.26 }, 0)
        .to(p.root, { y: 0, duration: 0.2, ease: 'power2.in' }).to(p.shadow, { scaleX: 1, scaleY: 1, opacity: 0.14, duration: 0.2, ease: 'power2.in' }, '<')
        .to(p.armL, { rotation: -140, duration: 0.2 }, '<').to(p.armR, { rotation: -152, duration: 0.2 }, '<')
        .to(p.root, { scaleY: 0.9, scaleX: 1.07, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.out' })
      tl.add(jump, 0.3)
    },
    suspense(tl) {
      const [reach] = PUPIL_REACH
      pupilsMoved = true
      mouth('o', 0.1, tl, 0.05)
      setLids(0, 0.15, tl, 0.05)
      speed(0.2)
      tl.to(p.pupL, { x: reach * 0.7, y: 0, duration: 0.25 }, 0.05).to(p.browL, { opacity: 1, y: -8, rotation: -10, duration: 0.25 }, 0.05)
        .to(p.armL, { rotation: -80, duration: 0.4, ease: 'power2.out' }, 0.05).to(p.armR, { rotation: -90, duration: 0.4, ease: 'power2.out' }, 0.05)
        .to(p.torso, { rotation: -3, duration: 0.5 }, 0.05).to(p.head, { rotation: 3, duration: 0.5 }, 0.05)
      tl.add(gsap.to(p.root, { x: 1.6, duration: 0.05, yoyo: true, repeat: -1, ease: 'none' }), 0.3)
      if (p.sweat) tl.add(gsap.fromTo(p.sweat, { opacity: 1, y: 0 }, { y: 30, opacity: 0, duration: 1.1, ease: 'power1.in', repeat: -1, repeatDelay: 0.4 }), 0.4)
    },
    laugh(tl) {
      happyEyes(tl)
      mouth('grin', 0.1, tl, 0.05)
      speed(1.8)
      tl.to(p.head, { rotation: -12, duration: 0.25, ease: 'power2.out' }, 0.05).to(p.armL, { rotation: 24, duration: 0.25 }, 0.05).to(p.armR, { rotation: 18, duration: 0.25 }, 0.05)
      const shake = gsap.timeline({ repeat: -1, repeatDelay: 0.35 })
      shake.to(p.torso, { rotation: -5, duration: 0.09, yoyo: true, repeat: 7, ease: 'sine.inOut' }).to(p.root, { y: -4, duration: 0.09, yoyo: true, repeat: 7, ease: 'sine.inOut' }, 0)
      tl.add(shake, 0.2)
      if (p.tear) {
        const tear = p.tear
        const drop = gsap.timeline({ repeat: -1, repeatDelay: 0.2 })
        drop.set(tear, { opacity: 1, x: 0, y: 0, scale: 0.7 }).to(tear, { x: -28, scale: 1, duration: 0.9, ease: 'power1.out' }, 0).to(tear, { y: -8, duration: 0.25, ease: 'power2.out' }, 0)
          .to(tear, { y: 28, duration: 0.65, ease: 'power2.in' }, 0.25).to(tear, { opacity: 0, duration: 0.25 }, 0.65)
        tl.add(drop, 0.2)
      }
    },
    dance(tl) {
      const beat = 0.5
      happyEyes(tl)
      mouth('grin', 0.1, tl, 0.05)
      speed(2)
      tl.to(p.torso, { rotation: -8, duration: 0.25 }, 0.05).to(p.head, { rotation: 6, duration: 0.25 }, 0.05).to(p.armL, { rotation: -40, duration: 0.25 }, 0.05).to(p.armR, { rotation: -150, duration: 0.25 }, 0.05)
        .to(p.legL, { rotation: -6, duration: 0.25 }, 0.05).to(p.legR, { rotation: 10, duration: 0.25 }, 0.05)
      const dance = gsap.timeline({ repeat: -1 })
      for (const [index, [side, armL, armR, legL, legR]] of ([[1, -150, -40, 10, -6], [-1, -40, -150, -6, 10]] as const).entries()) {
        const at = index * beat
        dance.to(p.torso, { rotation: 8 * side, duration: beat, ease: 'sine.inOut' }, at).to(p.head, { rotation: -6 * side, duration: beat, ease: 'sine.inOut' }, at)
          .to(p.armL, { rotation: armL, duration: beat * 0.8, ease: 'back.out(1.6)' }, at).to(p.armR, { rotation: armR, duration: beat * 0.8, ease: 'back.out(1.6)' }, at)
          .to(p.legL, { rotation: legL, duration: beat * 0.5, ease: 'sine.inOut' }, at).to(p.legR, { rotation: legR, duration: beat * 0.5, ease: 'sine.inOut' }, at)
          .to(p.root, { y: -14, duration: beat * 0.5, ease: 'power2.out' }, at).to(p.root, { y: 0, duration: beat * 0.5, ease: 'power2.in' }, at + beat * 0.5)
      }
      tl.add(dance, 0.3)
    },
    confused(tl) {
      const [reachX, reachY] = PUPIL_REACH
      pupilsMoved = true
      mouth('wobble', 0.1, tl, 0.05)
      speed(0.6)
      tl.to(p.pupL, { x: -reachX * 0.5, y: -reachY * 0.6, duration: 0.3 }, 0.05).to(p.browL, { opacity: 1, y: -6, rotation: 14, duration: 0.25 }, 0.05)
        .to(p.armL, { rotation: -55, duration: 0.3, ease: 'back.out(2)' }, 0.05).to(p.armR, { rotation: -65, duration: 0.3, ease: 'back.out(2)' }, 0.05)
        .to(p.head, { rotation: -12, duration: 0.4, ease: 'sine.inOut' }, 0.05)
      if (p.q) {
        tl.fromTo(p.q, { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2.4)' }, 0.15)
        tl.add(gsap.fromTo(p.q, { rotation: -12 }, { rotation: 12, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' }), 0.5)
      }
      tl.add(gsap.fromTo(p.head, { rotation: -12 }, { rotation: 8, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1, repeatDelay: 0.8 }), 0.5)
    },
    run(tl) {
      const half = 0.15
      mouth('grin', 0.1, tl, 0.05)
      speed(3)
      tl.to(p.torso, { rotation: 8, duration: 0.2 }, 0.05).to(p.head, { rotation: -8, duration: 0.2 }, 0.05)
      const cycle = gsap.timeline({ repeat: -1 })
      for (const [index, [legL, legR, shinL, shinR, armL, armR]] of ([[-42, 34, -8, 40, 30, -40], [34, -42, 40, -8, -40, 30]] as const).entries()) {
        const at = index * half
        cycle.to(p.legL, { rotation: legL, duration: half, ease: 'sine.inOut' }, at).to(p.legR, { rotation: legR, duration: half, ease: 'sine.inOut' }, at)
          .to(p.shinL, { rotation: shinL, duration: half }, at).to(p.shinR, { rotation: shinR, duration: half }, at)
          .to(p.armL, { rotation: armL, duration: half }, at).to(p.armR, { rotation: armR, duration: half }, at)
          .to(p.root, { y: -9, duration: half / 2, yoyo: true, repeat: 1, ease: 'power1.out' }, at)
      }
      tl.add(cycle, 0.08)
    },
  }

  const landing = () => Number(gsap.getProperty(p.root, 'y')) < -3

  function toState(next: RigState, reduced: boolean, tries: number) {
    if (destroyed) return
    pending?.kill()
    // Exit point: in the air (root y < -3) the switch waits for the landing, at most 8 x 0.04 s.
    if (tries < 8 && landing()) {
      pending = gsap.delayedCall(0.04, () => toState(next, reduced, tries + 1))
      apply()
      return
    }
    pending = undefined
    state = next
    stateTl?.kill()
    microCall?.kill()
    microCall = undefined
    for (const animation of micros) animation.kill()
    micros.clear()
    const tl = gsap.timeline()
    restTo(tl, reduced ? 0.2 : 0.25)
    states[next](tl, reduced)
    stateTl = tl
    held = reduced
    if (reduced) {
      // Held pose: once the entry tweens have run, every infinite loop of the state stands at its start.
      for (const loop of loops) loop.pause(0)
      tl.call(() => {
        for (const child of tl.getChildren(true, true, true)) if ('repeat' in child && child.repeat() === -1) child.pause(0)
      }, undefined, 0.45)
    }
    apply()
  }

  return {
    get state() {
      return state
    },
    setState(next, reduced) {
      toState(RIG_STATES.includes(next) ? next : 'idle', reduced, 0)
    },
    setActive(on) {
      active = on
      apply()
    },
    stopAmbient() {
      ambient = false
      blinkCall?.kill()
      microCall?.kill()
      blinkCall = undefined
      microCall = undefined
    },
    destroy() {
      destroyed = true
      for (const animation of owned()) animation.kill()
      blinks.clear()
      micros.clear()
      loops.length = 0
    },
  }
}
