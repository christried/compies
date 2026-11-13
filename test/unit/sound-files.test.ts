import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CUE_CREDITS_URL, parseCredits } from '../../app/utils/sound-credits'
import { CUE_FILE_EXTENSION, CUE_FILE_FOLDER, CUE_IDS, cueFileUrl, type CueId } from '../../app/utils/sound-cues'

// The cue files of 0.13.3 (#531, #536): the sounds the app ships, each at most the length `compibert-sound.md` lists, and the credits file
// that says where each is from. The hub-pages criterion of the ticket („the files are not requested on the hub pages“) is pinned
// structurally: only `cueFileUrl` names the folder, and only the Event page mounts the player.

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

  // At most the doc's length (+5 ms) and at least half of it: a candidate may be a little shorter than the doc says (a 24 ms tick, #536).
  it.each(CUE_IDS)('%s is a 16-bit mono PCM WAV at 44.1 kHz of at most its length (+5 ms) and at least half of it', (id) => {
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
    const ms = (samples / 44_100) * 1000
    expect(ms).toBeLessThanOrEqual(LENGTH_MS[id] + 5)
    expect(ms).toBeGreaterThanOrEqual(LENGTH_MS[id] / 2)
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

describe('the credits file', () => {
  const folder = join(root, 'public', CUE_FILE_FOLDER)
  const manifest = JSON.parse(readFileSync(join(root, 'sound-candidates/manifest.json'), 'utf8')) as {
    cues: Record<string, { name: string, file: string, source: string, author: string | null, licence: string }[]>
  }
  const creditsFile = join(root, 'public', CUE_CREDITS_URL)
  // A missing file is a problem line, not a crash of the whole test file.
  const { credits, problems } = parseCredits(existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, 'utf8')) : null)

  it('sits beside exactly the eleven cue files', () => {
    expect(readdirSync(folder).sort()).toEqual([...CUE_IDS.map(id => `${id}.${CUE_FILE_EXTENSION}`), 'credits.json'].sort())
  })

  it('has a valid entry for every cue id, and no licence but CC0 or generated', () => {
    expect(problems).toEqual([])
    expect(Object.keys(credits)).toEqual([...CUE_IDS])
    for (const id of CUE_IDS) expect(['CC0', 'generated'], id).toContain(credits[id]!.licence)
  })

  // A candidate that left the manifest (#593 removes the unchosen ones) or is no .wav (it has to be converted, so the file is no byte copy)
  // cannot be compared: those two checks are skipped for it, and the entry alone stands.
  it.each(CUE_IDS)('%s ships the bytes of its credited candidate, with the source, author and licence of its manifest entry', (id) => {
    const credit = credits[id]!
    const candidate = manifest.cues[id]?.find(entry => entry.name === credit.candidate)
    if (!candidate || !candidate.file.endsWith('.wav') || !existsSync(join(root, 'sound-candidates', candidate.file))) return

    expect(readFileSync(fileOf(id)).equals(readFileSync(join(root, 'sound-candidates', candidate.file))), `${id}: ${credit.candidate}`).toBe(true)
    expect({ source: credit.source, author: credit.author, licence: credit.licence }).toEqual({ source: candidate.source, author: candidate.author ?? null, licence: candidate.licence })
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
