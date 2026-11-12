import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CUE_FILE_EXTENSION, CUE_FILE_FOLDER, CUE_IDS, cueFileUrl, type CueId } from '../../app/utils/sound-cues'

// The cue files of 0.13.3 (#531): placeholder beeps of the lengths `compibert-sound.md` lists, until the real sounds (#535, #536). The
// hub-pages criterion of the ticket („the files are not requested on the hub pages“) is pinned structurally: only `cueFileUrl` names the
// folder, and only the Event page mounts the player.

const root = resolve(import.meta.dirname, '../..')
/** The length column of `compibert-sound.md`, in ms. */
const LENGTH_MS: Record<CueId, number> = {
  'wheel-windup': 500, 'wheel-tick': 30, 'wheel-stop': 600, 'wheel-morph': 500, 'wheel-slice-out': 300,
  'veto-open': 400, 'veto-clock': 40, 'veto-clip-close': 300, 'veto-seal': 300, 'veto-drumroll': 1200, 'veto-reveal': 800,
}

const fileOf = (id: CueId) => join(root, 'public', cueFileUrl(id))

describe('the cue files', () => {
  it('have the file name and folder the player asks for', () => {
    expect(CUE_FILE_FOLDER).toBe('/sounds/cues')
    expect(CUE_FILE_EXTENSION).toBe('wav')
    expect(cueFileUrl('wheel-windup')).toBe('/sounds/cues/wheel-windup.wav')
  })

  it('are the lengths of compibert-sound.md, for every cue', () => {
    const doc = readFileSync(resolve(root, 'docs/design_handoff_compies/reference/docs/compibert-sound.md'), 'utf8')
    for (const id of CUE_IDS) {
      const row = doc.split('\n').find(line => line.includes(`\`${id}\``))
      const [, amount, unit] = /\|\s*([\d.]+) (ms|s)\b[^|]*\|/.exec(row ?? '') ?? []
      expect(LENGTH_MS[id], id).toBe(Math.round(Number(amount) * (unit === 's' ? 1000 : 1)))
    }
  })

  it.each(CUE_IDS)('%s is a 16-bit mono PCM WAV at 44.1 kHz of its length (±5 ms)', (id) => {
    expect(existsSync(fileOf(id))).toBe(true)
    const bytes = readFileSync(fileOf(id))

    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
    expect(bytes.toString('ascii', 8, 12)).toBe('WAVE')
    expect(bytes.toString('ascii', 12, 16)).toBe('fmt ')
    expect(bytes.readUInt16LE(20)).toBe(1) // PCM
    expect(bytes.readUInt16LE(22)).toBe(1) // mono
    expect(bytes.readUInt32LE(24)).toBe(44_100)
    expect(bytes.readUInt16LE(34)).toBe(16)
    expect(bytes.toString('ascii', 36, 40)).toBe('data')
    const samples = bytes.readUInt32LE(40) / 2
    expect(bytes.length).toBe(44 + samples * 2)
    expect(Math.abs((samples / 44_100) * 1000 - LENGTH_MS[id])).toBeLessThanOrEqual(5)
  })

  it('peak at about -1 dBFS, so the player\'s gain alone sets the relative volume', () => {
    for (const id of CUE_IDS) {
      const bytes = readFileSync(fileOf(id))
      let peak = 0
      for (let at = 44; at < bytes.length; at += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(at)))
      expect(peak / 32_768, id).toBeGreaterThan(0.85)
      expect(peak / 32_768, id).toBeLessThan(0.92)
    }
  })
})

describe('where the files are named and the player is mounted', () => {
  const files = readdirSync(join(root, 'app'), { recursive: true, encoding: 'utf8' })
    .filter(file => /\.(ts|vue)$/.test(file))
    .map(file => ({ file: file.replaceAll('\\', '/'), text: readFileSync(join(root, 'app', file), 'utf8') }))

  it('names the sound folder in app/utils/sound-cues.ts only', () => {
    expect(files.filter(({ text }) => text.includes('/sounds/')).map(({ file }) => file)).toEqual(['utils/sound-cues.ts'])
  })

  it('calls useCuePlayer( in the Event page only, so no hub page requests a file', () => {
    const callers = files.filter(({ file, text }) => file !== 'composables/useCuePlayer.ts' && text.includes('useCuePlayer(')).map(({ file }) => file)
    expect(callers).toEqual(['components/EventPage.vue'])
  })
})
