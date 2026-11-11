import { beforeEach, vi } from 'vitest'
import { SPIN_MAX_MS, SPIN_MIN_MS } from '../../shared/draw-timeline'
import { spinAnswer } from './spin-length'

// A spin's length is drawn from the platform's source (#520), so a test that spins through HTTP and then moves the clock to
// `SPIN.stop` would be flaky. The source is the real one, except the one call that draws the length: it answers `spinAnswer.value`
// (0 by default, the shortest spin). The pattern of ceremony.test.ts and hidden-wheel-draw.test.ts, whose own `vi.mock('node:crypto')`
// replaces this one in their file (their override answers the length call too). Registered as `setupFiles` of the integration project.
vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>()
  const randomInt = ((...args: unknown[]) => {
    if (args.length === 1 && args[0] === SPIN_MAX_MS - SPIN_MIN_MS + 1) return spinAnswer.value
    return (real.randomInt as (...a: unknown[]) => unknown)(...args)
  }) as typeof real.randomInt
  return { ...real, default: { ...real, randomInt }, randomInt }
})

beforeEach(() => {
  spinAnswer.value = 0
})
