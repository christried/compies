import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixedTexts, locationOf, MONTH_PATTERN } from '../../scripts/wording/where.mjs'
import { firstReferences } from '../../scripts/wording/unused-scan.mjs'

// Where a text lives that the walk cannot see through `t` (scripts/wording/where.mjs, #629): the fixed table read out of the real files, and
// the first place code names a key. The files are read as text, so no test imports the app's TypeScript.
const root = join(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(join(root, file), 'utf8')
const files = {
  offline: read('public/offline.html'),
  nuxtConfig: read('nuxt.config.ts'),
  utilsChangelog: read('app/utils/changelog.ts'),
  sharedChangelog: read('shared/changelog.ts'),
}
type Fixed = { id: string, text: string, file: string, line: number | null }
const fixed = fixedTexts(files) as Fixed[]
const lineOfText = (file: string, text: string) => read(file).split('\n').findIndex(line => line.includes(text)) + 1

describe('fixedTexts', () => {
  it('finds 22 entries in the real files: 4 offline, 1 manifest, 12 months, 5 groups', () => {
    expect(fixed).toHaveLength(22)
    expect(fixed.filter(entry => entry.id.startsWith('offline.')).map(entry => entry.id)).toEqual(['offline.title', 'offline.heading', 'offline.text', 'offline.button'])
    expect(fixed.filter(entry => entry.id.startsWith('changelog.month.'))).toHaveLength(12)
    expect(fixed.filter(entry => entry.id.startsWith('changelog.group.')).map(entry => entry.id)).toEqual(['Neu', 'Geändert', 'Behoben', 'Entfernt', 'Sicherheit'].map(name => `changelog.group.${name}`))
    expect(fixed.filter(entry => entry.id === 'manifest.description')).toHaveLength(1)
  })

  it('gives every entry a text and the line it is found on', () => {
    for (const entry of fixed) {
      expect(entry.text, entry.id).not.toBe('')
      expect(entry.line, entry.id).toBeGreaterThan(0)
      expect(read(entry.file).split('\n')[(entry.line ?? 1) - 1], entry.id).toContain(entry.text)
    }
  })

  it('reads the offline page as its title, heading, text and button', () => {
    const offline = Object.fromEntries(fixed.filter(entry => entry.id.startsWith('offline.')).map(entry => [entry.id, entry]))
    expect(offline['offline.title']).toMatchObject({ text: 'Compies', file: 'public/offline.html' })
    expect(offline['offline.heading']?.text).toBe('Keine Verbindung.')
    expect(offline['offline.button']?.text).toBe('Seite neu laden')
    expect(offline['offline.text']?.line).toBe(lineOfText('public/offline.html', offline['offline.text']!.text))
  })

  it('has the manifest description exactly as nuxt.config.ts spells it', () => {
    const entry = fixed.find(item => item.id === 'manifest.description')!
    expect(entry).toMatchObject({ file: 'nuxt.config.ts', text: 'Spieleabende mit Glücksrad, Vetos und Siegerehrung.' })
    expect(files.nuxtConfig).toContain(`description: '${entry.text}'`)
  })

  it('lists the months in the order of the array, numbered 1 to 12, and the groups of CHANGE_GROUPS', () => {
    expect(fixed.find(entry => entry.id === 'changelog.month.1')?.text).toBe('Jan.')
    expect(fixed.find(entry => entry.id === 'changelog.month.3')?.text).toBe('März')
    expect(fixed.find(entry => entry.id === 'changelog.month.12')?.text).toBe('Dez.')
    expect(fixed.find(entry => entry.id === 'changelog.group.Geändert')?.file).toBe('shared/changelog.ts')
  })

  it('leaves out an entry whose text its file does not hold', () => {
    const thin = fixedTexts({ ...files, offline: '<html></html>' }) as Fixed[]
    expect(thin.filter(entry => entry.id.startsWith('offline.'))).toEqual([])
  })
})

describe('MONTH_PATTERN', () => {
  it('finds a month inside a date line', () => {
    expect(MONTH_PATTERN('Nov.').test('7. Nov. 2026')).toBe(true)
    expect(MONTH_PATTERN('Mai').test('12. Mai 2026')).toBe(true)
    expect(MONTH_PATTERN('Mai').test('Mai')).toBe(false)
    expect(MONTH_PATTERN('Jan.').test('7. Janx 2026')).toBe(false)
  })
})

describe('locationOf', () => {
  const vue = (text: string, file = 'app/pages/x.vue') => ({ file, text })
  const where = (key: string, ...sources: { file: string, text: string }[]) => locationOf(key, firstReferences(sources))

  it('finds the line of a literal key', () => {
    expect(where('home.title', vue('<template>\n  <h1>{{ t(\'home.title\') }}</h1>\n</template>'))).toEqual({ file: 'app/pages/x.vue', line: 2 })
  })

  it('takes the first reference when code names the key twice', () => {
    expect(where('a.b', vue('x\nt(\'a.b\')'), vue('t(\'a.b\')', 'app/pages/y.vue'))).toEqual({ file: 'app/pages/x.vue', line: 2 })
  })

  it('finds a child of a prefix that code builds', () => {
    expect(where('team.colors.3', vue('const name = t(`team.colors.${at}`)'))).toEqual({ file: 'app/pages/x.vue', line: 1 })
  })

  it('finds an array item through its parent', () => {
    expect(where('wheel.placeholders.2', vue('\n\nconst list = tm(\'wheel.placeholders\')'))).toEqual({ file: 'app/pages/x.vue', line: 3 })
  })

  it('finds mvp.ics.summary through a file that imports the locale file and writes de.mvp.ics', () => {
    const server = { file: 'server/api/e/[slug]/ics.get.ts', text: 'import de from \'../../../../i18n/locales/de.json\'\n\ncopy: de.mvp.ics,' }
    expect(where('mvp.ics.summary', server)).toEqual({ file: 'server/api/e/[slug]/ics.get.ts', line: 3 })
  })

  it('says nothing for a key no code names', () => {
    expect(where('nirgends.zu.finden', vue('t(\'home.title\')'))).toBeNull()
  })
})
