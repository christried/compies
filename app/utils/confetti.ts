// Sticker confetti (04-motion § Confetti, the Neuigkeiten timings): pieces with a white rim and a soft shadow
// burst up from a point, then fall and fade. Web Animations instead of GSAP, which the app does not ship.
// The caller skips it under reduced motion and gives a layer that is `aria-hidden` and has no pointer events.

const COLOURS = ['--cp-primary', '--cp-hot', '--cp-mint', '--cp-pop', '--cp-cobalt']
const SHAPES = ['circle', 'square', 'diamond', 'bar'] as const
const BURST_MS = 500
const FADE_MS = 350

const rnd = (min: number, max: number) => min + Math.random() * (max - min)

/** Bursts `count` pieces from (x, y), in px within `layer`. Each piece removes itself when it has landed. */
export function confetti(layer: HTMLElement, x: number, y: number, count: number) {
  for (let i = 0; i < count; i++) {
    const shape = SHAPES[i % SHAPES.length]!
    const [width, height] = shape === 'bar' ? [16, 7] : [12, 12]
    const piece = document.createElement('span')
    Object.assign(piece.style, {
      position: 'absolute',
      left: `${x - width / 2}px`,
      top: `${y - height / 2}px`,
      width: `${width}px`,
      height: `${height}px`,
      boxSizing: 'border-box',
      border: '2px solid var(--cp-sticker-rim)',
      borderRadius: shape === 'circle' || shape === 'bar' ? '999px' : '2px',
      background: `var(${COLOURS[i % COLOURS.length]})`,
      boxShadow: 'var(--cp-sticker-shadow)',
    })
    layer.append(piece)

    const turn = shape === 'diamond' ? 45 : 0
    const [x1, y1, turn1] = [rnd(-180, 180), rnd(-170, -60), turn + rnd(-360, 360)]
    const fall = rnd(1200, 1700)
    const total = BURST_MS + fall
    // Burst out on power2.out, then fall on power1.in.
    piece.animate([
      { transform: `translate(0px, 0px) rotate(${turn}deg)`, easing: 'cubic-bezier(.33,1,.68,1)' },
      { transform: `translate(${x1}px, ${y1}px) rotate(${turn1}deg)`, offset: BURST_MS / total, easing: 'cubic-bezier(.32,0,.67,0)' },
      { transform: `translate(${x1 + rnd(-50, 50)}px, ${y1 + rnd(260, 400)}px) rotate(${turn1 + 420}deg)` },
    ], { duration: total, fill: 'forwards' }).onfinish = () => piece.remove()
    piece.animate([{ opacity: 1 }, { opacity: 0 }], { delay: total - FADE_MS, duration: FADE_MS, fill: 'forwards' })
  }
}
