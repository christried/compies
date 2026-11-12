import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { renderShareImage } from '../../server/utils/share-render'
import { fileShareAssets } from '../../server/utils/share-assets'
import { SHARE_FORMATS, shareImageModel, SHARE_SIZE } from '../../shared/share-image'
import { SHARE_CASES } from './share-image-fixtures'

// The Share image renders (#510): every case of SHARE_CASES in both formats gives a PNG of the right size, so the long names, the 8 Parties,
// the 12 games and the Tie cannot break the renderer. The pixels are judged by eye: with SHARE_IMAGE_OUT=<folder> set, each picture is also
// written as <folder>/<case>-<format>.png (without it nothing is written), to be read against 14-share-image-redesign.md.

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const out = process.env.SHARE_IMAGE_OUT
const assets = fileShareAssets()

/** The size a PNG states in its IHDR chunk (bytes 16 to 23, big-endian). */
function sizeOf(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { signature: [...bytes.slice(0, 8)], width: view.getUint32(16), height: view.getUint32(20) }
}

describe('renderShareImage', () => {
  const cases = Object.keys(SHARE_CASES).flatMap(name => SHARE_FORMATS.map(format => [name, format] as const))

  it.each(cases)('draws %s as a PNG of the %s size', async (name, format) => {
    const model = shareImageModel(SHARE_CASES[name]!, format, { share: de.share, team: de.team })!

    const bytes = await renderShareImage(model, assets)

    expect(sizeOf(bytes)).toEqual({ signature: PNG_SIGNATURE, ...SHARE_SIZE[format] })
    if (out) {
      mkdirSync(out, { recursive: true })
      writeFileSync(join(out, `${name}-${format}.png`), bytes)
    }
  }, 30_000)
})
