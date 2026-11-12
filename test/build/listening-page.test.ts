import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The listening page for the cue sounds (app/dev/listening-page.vue, #534) and its candidate files (sound-candidates/) are for `pnpm dev`:
// no build carries them, the staging build included (staging is a production build behind Vercel Authentication, and a candidate file must
// never be deployed). Run `pnpm test:build` (builds first; CI builds production). Which builds register the page is carriesListeningPage in
// stage.ts, covered in test/unit/stage.test.ts.
// (c) is empty until #535 brings candidate files: (a) and (b) carry the pin until then.
const root = resolve(import.meta.dirname, '../..')
const OUTPUT = resolve(root, '.output')
const TEXT = /\.(mjs|js|json|html|map)$/
const AUDIO = /\.(wav|ogg|mp3)$/

const outputFiles = readdirSync(OUTPUT, { recursive: true, encoding: 'utf8' }).map(file => file.replaceAll('\\', '/'))
const candidateFiles = (() => {
  try {
    return readdirSync(join(root, 'sound-candidates'), { recursive: true, encoding: 'utf8' }).filter(file => AUDIO.test(file))
  }
  catch {
    return []
  }
})()

describe('the listening page in the production build', () => {
  it('has the build to read', () => {
    expect(outputFiles.length).toBeGreaterThan(0)
  })

  it('has no file or folder of the candidates', () => {
    expect(outputFiles.filter(file => /cue-candidates|sound-candidates/.test(file))).toEqual([])
  })

  it('has no page, route or handler in any script, page or map', () => {
    const marks = ['compies-listening-page', '/_dev/cue-candidates', 'dev-listening', '/dev/ton']
    const carriers = outputFiles
      .filter(file => TEXT.test(file))
      .filter((file) => {
        const text = readFileSync(join(OUTPUT, file), 'utf8')
        return marks.some(mark => text.includes(mark))
      })
    expect(carriers).toEqual([])
  })

  it('has no copy of a candidate audio file, whatever its folder', () => {
    const names = new Set(candidateFiles.map(file => basename(file)))
    expect(outputFiles.filter(file => names.has(basename(file)))).toEqual([])
  })
})
