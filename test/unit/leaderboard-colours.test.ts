import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

// The Standings are plain UI and follow the Appearance (#406): every colour comes from a token. A fixed six-digit hex was the
// stamp's border and text, invisible on Dunkel. The seam is the source as text: jsdom computes no colour of a rendered element.
it('paints nothing in the Leaderboard with a fixed hex colour', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../app/components/Leaderboard.vue'), 'utf8')

  expect(source.match(/#[0-9a-fA-F]{6}\b/g)).toBeNull()
})
