import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The key tags (app/dev/key-tags-plugin.ts, shared/key-tag.ts, #627) are for `pnpm dev` with COMPIES_WORDING=1: the production build and
// the staging build run with `dev` false, so no build registers the plugin or carries a tag character. Run `pnpm test:build` (builds
// first; CI builds production). Which builds register the plugin is carriesKeyTags in stage.ts, covered in test/unit/stage.test.ts.
const OUTPUT = resolve(import.meta.dirname, '../../.output')
const TEXT = /\.(mjs|js|json|html|map)$/
// The opening of a tag: the frame, then at least the seven bits of one key character. A bare U+2060 can sit in a vendor chunk's own tables.
const TAG_OPENING = /\u2060[\u2062\u2063]{7}/

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

  it('has no tagged text in any script, page or map', () => {
    expect(carriers(text => TAG_OPENING.test(text))).toEqual([])
  })
})
