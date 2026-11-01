import { describe, expect, it } from 'vitest'
import { compareVersions, parseChangelog, seenAfter, unseenReleases } from '~~/shared/changelog'

// The Changelog parser (CHANGELOG.md, Keep a Changelog, German for Users). Each block type gets a case;
// anything the parser does not know throws, so a broken file never reaches the Neuigkeiten page.

const release = `## [1.0.0] - 2026-10-22 – Terminfindung

Die erste Version.

### Neu

- Du kannst ein Event anlegen. ([#1](https://github.com/christried/compies/issues/1))
  - Mit einem Einladungslink.
`

describe('parseChangelog', () => {
  it('returns an empty [Unreleased] and no Releases for a file with only the headings', () => {
    expect(parseChangelog('# Changelog\n\n## [Unreleased]\n')).toEqual({ unreleased: [], releases: [] })
  })

  it('parses a Release heading into version, date, name and an inline intro', () => {
    const { releases } = parseChangelog(`# Changelog\n\n## [Unreleased]\n\n${release}`)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      version: '1.0.0',
      date: '2026-10-22',
      name: 'Terminfindung',
      intro: [{ type: 'text', text: 'Die erste Version.' }],
    })
  })

  it('reads groups with their type slug and name, items, and one nested level', () => {
    const { releases } = parseChangelog(`# Changelog\n\n## [Unreleased]\n\n${release}`)
    expect(releases[0]!.groups).toEqual([
      {
        type: 'neu',
        name: 'Neu',
        items: [
          {
            inline: [
              { type: 'text', text: 'Du kannst ein Event anlegen. (' },
              { type: 'link', text: '#1', href: 'https://github.com/christried/compies/issues/1' },
              { type: 'text', text: ')' },
            ],
            children: [[{ type: 'text', text: 'Mit einem Einladungslink.' }]],
          },
        ],
      },
    ])
  })

  it('splits bold and code out of item text as inline nodes', () => {
    const source = '# Changelog\n\n## [Unreleased]\n\n### Behoben\n\n- **Fett** und `Code` hier.\n'
    expect(parseChangelog(source).unreleased[0]!.items[0]!.inline).toEqual([
      { type: 'bold', text: 'Fett' },
      { type: 'text', text: ' und ' },
      { type: 'code', text: 'Code' },
      { type: 'text', text: ' hier.' },
    ])
  })

  it('rejects a link that is not http(s)', () => {
    const source = '# Changelog\n\n## [Unreleased]\n\n### Behoben\n\n- [Klick](javascript:alert(1))\n'
    expect(() => parseChangelog(source)).toThrow()
  })

  it('gives a Release without an intro a null intro', () => {
    const source = '# Changelog\n\n## [Unreleased]\n\n## [1.0.1] - 2026-10-23 – Name\n\n### Behoben\n\n- Ein Fehler.\n'
    expect(parseChangelog(source).releases[0]!.intro).toBeNull()
  })

  it('returns [Unreleased] groups separately from the Releases', () => {
    const source = '# Changelog\n\n## [Unreleased]\n\n### Neu\n\n- Noch nicht live.\n\n' + release
    const parsed = parseChangelog(source)
    expect(parsed.unreleased).toEqual([
      { type: 'neu', name: 'Neu', items: [{ inline: [{ type: 'text', text: 'Noch nicht live.' }], children: [] }] },
    ])
    expect(parsed.releases.map(r => r.version)).toEqual(['1.0.0'])
  })

  it('keeps the Releases in the order the file gives them', () => {
    const source = '# Changelog\n\n## [Unreleased]\n\n## [1.1.0] - 2026-10-24 – Feinschliff\n\n## [1.0.0] - 2026-10-22 – Terminfindung\n'
    expect(parseChangelog(source).releases.map(r => r.version)).toEqual(['1.1.0', '1.0.0'])
  })

  it('rejects a file without the „# Changelog“ title', () => {
    expect(() => parseChangelog('## [Unreleased]\n')).toThrow()
  })

  it('rejects a file where [Unreleased] is not the first section', () => {
    expect(() => parseChangelog(`# Changelog\n\n${release}`)).toThrow()
  })

  it('rejects a Release heading outside the form [x.y.z] - YYYY-MM-DD – Name', () => {
    const source = '# Changelog\n\n## [Unreleased]\n\n## [1.0] - 2026-10-22 – Terminfindung\n'
    expect(() => parseChangelog(source)).toThrow()
  })

  it('rejects a group name outside the five', () => {
    const source = '# Changelog\n\n## [Unreleased]\n\n### Verbessert\n\n- Etwas.\n'
    expect(() => parseChangelog(source)).toThrow()
  })

  it('rejects groups out of the fixed order', () => {
    const source = '# Changelog\n\n## [Unreleased]\n\n### Behoben\n\n- Ein Fehler.\n\n### Neu\n\n- Etwas Neues.\n'
    expect(() => parseChangelog(source)).toThrow()
  })

  it('rejects a nested item below the first level', () => {
    const source = '# Changelog\n\n## [Unreleased]\n\n### Neu\n\n- Eins.\n  - Zwei.\n    - Drei.\n'
    expect(() => parseChangelog(source)).toThrow()
  })

  it('rejects an intro text in [Unreleased] and text between groups and items', () => {
    expect(() => parseChangelog('# Changelog\n\n## [Unreleased]\n\nText ohne Gruppe.\n')).toThrow()
    expect(() => parseChangelog('# Changelog\n\n## [Unreleased]\n\n### Neu\n\nText nach Gruppe.\n')).toThrow()
  })
})

// „Was ist neu“ (#184): which Releases a User still has to be shown.
describe('compareVersions', () => {
  it('orders versions by their numbers, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.2.0', '1.2.1')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(compareVersions('1.3.0', '1.3.0')).toBe(0)
  })
})

describe('unseenReleases', () => {
  const releases = ['1.4.0', '1.3.0', '1.2.0', '1.1.0'].map(version => ({
    version, date: '2026-10-22', name: `Release ${version}`, intro: null, groups: [],
  }))
  const versions = (seen: string | null) => unseenReleases(releases, seen).map(r => r.version)

  it('shows only the newest Release to a User who never saw one', () => {
    expect(versions(null)).toEqual(['1.4.0'])
  })

  it('shows every Release newer than the seen one, newest first', () => {
    expect(versions('1.2.0')).toEqual(['1.4.0', '1.3.0'])
  })

  it('shows nothing once the newest Release is seen', () => {
    expect(versions('1.4.0')).toEqual([])
  })

  it('treats a version that is no Release like never having seen one', () => {
    expect(versions('0.9.0')).toEqual(['1.4.0'])
  })

  it('shows nothing when there are no Releases', () => {
    expect(unseenReleases([], null)).toEqual([])
  })
})

// A User who saw 1.4.0 has the stored version 0.5.0 after the renumbering (#220): only the newer Release is shown.
describe('unseenReleases after the renumbering', () => {
  const renumbered = ['0.5.1', '0.5.0', '0.4.0', '0.3.0'].map(version => ({
    version, date: '2026-10-31', name: `Release ${version}`, intro: null, groups: [],
  }))

  it('shows only the Releases newer than a mapped 0.5.0', () => {
    expect(unseenReleases(renumbered, '0.5.0').map(r => r.version)).toEqual(['0.5.1'])
  })

  it('shows every newer Release to a User whose stored version was mapped from the middle of the list', () => {
    // A User who saw 1.2.0 is stored as 0.3.0 (#220): 0.5.1, 0.5.0 and 0.4.0 are the Releases since.
    expect(unseenReleases(renumbered, '0.3.0').map(r => r.version)).toEqual(['0.5.1', '0.5.0', '0.4.0'])
  })
})

// „Was ist neu“ (#242): the one rule for a stored version when a User marks a Release seen, on the server and on the
// client. A stored version above the newest Release is old code’s value from a deploy and counts as unknown.
describe('seenAfter', () => {
  it('takes the version for a User who has seen nothing', () => {
    expect(seenAfter(null, '0.5.1', '0.5.1')).toBe('0.5.1')
  })

  it('replaces an older stored version with the newer one', () => {
    expect(seenAfter('0.3.0', '0.5.0', '0.5.1')).toBe('0.5.0')
  })

  it('keeps a stored version that is newer than or equal to the one marked', () => {
    expect(seenAfter('0.5.0', '0.3.0', '0.5.1')).toBe('0.5.0')
    expect(seenAfter('0.5.0', '0.5.0', '0.5.1')).toBe('0.5.0')
  })

  it('replaces a stored version above the newest Release, which old code stores during a deploy', () => {
    expect(seenAfter('1.4.0', '0.5.1', '0.5.1')).toBe('0.5.1')
    expect(seenAfter('1.4.0', '0.5.0', '0.5.1')).toBe('0.5.0')
  })
})
