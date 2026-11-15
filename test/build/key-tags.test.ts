import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The key tags (app/dev/key-tags-plugin.ts, shared/key-tag.ts, #627) are for `pnpm dev` with COMPIES_WORDING=1: the production build and
// the staging build run with `dev` false, so no build registers the plugin or carries a tag character. Run `pnpm test:build` (builds
// first; CI builds production). Which builds register the plugin is carriesKeyTags in stage.ts, covered in test/unit/stage.test.ts.
const OUTPUT = resolve(import.meta.dirname, '../../.output')
const TEXT = /\.(mjs|js|json|html|map)$/
const TAG_CHARACTER = /[\u{E0000}-\u{E007F}]/u

const carriers = (matches: (text: string) => boolean) => readdirSync(OUTPUT, { recursive: true, encoding: 'utf8' })
  .map(file => file.replaceAll('\\', '/'))
  .filter(file => TEXT.test(file))
  // A folder can end in .js too (a package's own folder under .output/server/node_modules).
  .filter(file => statSync(join(OUTPUT, file)).isFile())
  .filter(file => matches(readFileSync(join(OUTPUT, file), 'utf8')))

describe('the key tags in the production build', () => {
  it('has the build to read', () => {
    expect(readdirSync(OUTPUT).length).toBeGreaterThan(0)
  })

  it('has no plugin in any script, page or map', () => {
    expect(carriers(text => text.includes('compies-key-tags'))).toEqual([])
  })

  it('has no tag character in any script, page or map', () => {
    expect(carriers(text => TAG_CHARACTER.test(text))).toEqual([])
  })
})
