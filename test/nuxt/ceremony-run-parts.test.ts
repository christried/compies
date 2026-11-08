import { describe, expect, it } from 'vitest'
import { runPartsOf } from '~/utils/ceremony-run'

// The parts the Pokal-Lauf moves (#312, #314): the stage's `data-part` hooks. A missing one makes `runPartsOf` null, so the layer builds no run
// and the static end frame stays. The share row (#314) is one of them. It needs a DOM, which the unit project (node) has none of.

const PARTS = ['banner', 'card', 'front', 'back', 'stamp', 'compibert', 'trophy', 'share', 'row', 'person']

function stage(without: string | null = null) {
  const root = document.createElement('div')
  for (const name of PARTS.filter(part => part !== without)) {
    const element = document.createElement('div')
    element.dataset.part = name
    root.append(element)
  }
  return root
}

describe('runPartsOf', () => {
  it('finds every part of a complete stage, the share row among them', () => {
    const parts = runPartsOf(stage())

    expect(parts).not.toBeNull()
    expect(parts!.share.dataset.part).toBe('share')
    expect(parts!.rows).toHaveLength(1)
    expect(parts!.people).toHaveLength(1)
  })

  it('is null when the share row is missing', () => {
    expect(runPartsOf(stage('share'))).toBeNull()
  })

  it('is null when any other part is missing', () => {
    for (const name of ['banner', 'card', 'front', 'back', 'stamp', 'compibert', 'trophy']) {
      expect(runPartsOf(stage(name)), name).toBeNull()
    }
  })
})
