import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CUE_LENGTHS } from '../../app/utils/cue-lengths'
import { CUE_IDS } from '../../app/utils/sound-cues'

// The generator's recipes sit one file per moment in scripts/cue-recipes/ and are loaded by folder (#740). Importing a recipe file runs no
// generator code, so this reads them as data: every cue id has its recipes, and nothing else does.

interface Recipe { name: string, ms: number, note: string, make: unknown }
const folder = resolve(import.meta.dirname, '../../scripts/cue-recipes')
const files = readdirSync(folder).filter(file => file.endsWith('.mjs')).sort()

async function load() {
  const byFile: Record<string, Record<string, Recipe[]>> = {}
  for (const file of files) byFile[file] = (await import(pathToFileURL(resolve(folder, file)).href)).default
  return byFile
}

describe('scripts/cue-recipes', () => {
  it('has recipes for exactly the cue ids, no id in two files', async () => {
    const keys = Object.values(await load()).flatMap(recipes => Object.keys(recipes))

    expect(new Set(keys).size, 'an id defined twice').toBe(keys.length)
    expect([...keys].sort()).toEqual([...CUE_IDS].sort())
  })

  it('gives each cue at least three recipes of unique names, a make function and a length within its table row', async () => {
    const all = Object.assign({}, ...Object.values(await load())) as Record<string, Recipe[]>

    for (const id of CUE_IDS) {
      const recipes = all[id]!
      expect(recipes.length, id).toBeGreaterThanOrEqual(3)
      expect(new Set(recipes.map(recipe => recipe.name)).size, `${id}: names`).toBe(recipes.length)
      for (const recipe of recipes) {
        expect(typeof recipe.make, `${id}/${recipe.name}`).toBe('function')
        expect(recipe.ms, `${id}/${recipe.name}`).toBeLessThanOrEqual(CUE_LENGTHS[id].ms)
      }
    }
  })
})
