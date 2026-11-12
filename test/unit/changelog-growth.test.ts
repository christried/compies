import { describe, expect, it } from 'vitest'
import { findGrownReleases } from './changelog-growth'

// The growth check over two changelog texts (#566): a Release section that holds more list items than the same
// section of the other text (origin/main's) is a finding. Texts are built from small sections, newest first.

const unreleased = (...items: string[]) => `## [Unreleased]\n\n${items.map(i => `- ${i}`).join('\n')}${items.length ? '\n' : ''}`

const changelogOf = (...sections: string[]) => `# Changelog\n\n${sections.join('\n')}`

const release0110 = (...items: string[]) => `## [0.11.0] - 2026-11-10 – Profil

### Neu

${items.map(i => `- ${i}`).join('\n')}
`

const release0100 = `## [0.10.0] - 2026-11-03 – Wunschliste

### Neu

- Eins.
- Zwei.
`

describe('findGrownReleases', () => {
  it('passes equal texts', () => {
    const text = changelogOf(unreleased('Neu.'), release0110('A.', 'B.'), release0100)

    expect(findGrownReleases(text, text)).toEqual([])
  })

  it('fails a Release section with more list items and names the Release', () => {
    const current = changelogOf(unreleased(), release0110('A.', 'B.', 'C.'))
    const other = changelogOf(unreleased(), release0110('A.', 'B.'))

    expect(findGrownReleases(current, other)).toEqual([{
      version: '0.11.0',
      items: 3,
      itemsOnOther: 2,
      added: 1,
      message: 'Release 0.11.0 holds 1 more list item than on origin/main (3 against 2). A released section never gains lines: move the added lines under [Unreleased].',
    }])
  })

  it('passes a changed word in a released line', () => {
    const current = changelogOf(unreleased(), release0110('A.', 'Bee.'))
    const other = changelogOf(unreleased(), release0110('A.', 'B.'))

    expect(findGrownReleases(current, other)).toEqual([])
  })

  it('passes a Release that the other text lacks', () => {
    const current = changelogOf(unreleased(), `## [0.12.0] - 2026-11-11 – Eventseite\n\n### Neu\n\n- X.\n- Y.\n- Z.\n`, release0110('A.'))
    const other = changelogOf(unreleased(), release0110('A.'))

    expect(findGrownReleases(current, other)).toEqual([])
  })

  it('counts a nested item added under an existing item', () => {
    const current = changelogOf(unreleased(), `## [0.11.0] - 2026-11-10 – Profil\n\n### Neu\n\n- A.\n  - Mit Kind.\n- B.\n`)
    const other = changelogOf(unreleased(), release0110('A.', 'B.'))

    expect(findGrownReleases(current, other)).toMatchObject([{ version: '0.11.0', items: 3, itemsOnOther: 2, added: 1 }])
  })

  it('passes fewer list items', () => {
    const current = changelogOf(unreleased(), release0110('A.'))
    const other = changelogOf(unreleased(), release0110('A.', 'B.'))

    expect(findGrownReleases(current, other)).toEqual([])
  })

  it('never compares [Unreleased]', () => {
    const current = changelogOf(unreleased('A.', 'B.'), release0110('A.'))
    const other = changelogOf(unreleased(), release0110('A.'))

    expect(findGrownReleases(current, other)).toEqual([])
  })

  it('passes an item moved to another group, and a new group heading alone', () => {
    const other = changelogOf(unreleased(), `## [0.11.0] - 2026-11-10 – Profil\n\n### Neu\n\n- A.\n- B.\n\n### Behoben\n\n- C.\n`)
    const moved = changelogOf(unreleased(), `## [0.11.0] - 2026-11-10 – Profil\n\n### Neu\n\n- A.\n\n### Behoben\n\n- B.\n- C.\n`)
    const heading = changelogOf(unreleased(), `## [0.11.0] - 2026-11-10 – Profil\n\n### Neu\n\n- A.\n- B.\n\n### Behoben\n\n- C.\n\n### Geändert\n`)

    expect(findGrownReleases(moved, other)).toEqual([])
    expect(findGrownReleases(heading, other)).toEqual([])
  })

  it('compares a CRLF text with an LF text by list items', () => {
    const lf = changelogOf(unreleased(), release0110('A.', 'B.'))
    const crlf = lf.replace(/\n/g, '\r\n')
    const crlfGrown = changelogOf(unreleased(), release0110('A.', 'B.', 'C.')).replace(/\n/g, '\r\n')

    expect(findGrownReleases(crlf, lf)).toEqual([])
    expect(findGrownReleases(crlfGrown, lf)).toMatchObject([{ version: '0.11.0', items: 3, itemsOnOther: 2, added: 1 }])
  })

  it('gives one finding per grown Release, newest first, in plural wording', () => {
    const newer = (...items: string[]) => `## [0.12.0] - 2026-11-11 – Eventseite\n\n### Neu\n\n${items.map(i => `- ${i}`).join('\n')}\n`
    const current = changelogOf(unreleased(), newer('A.', 'B.', 'C.'), release0110('A.', 'B.', 'C.', 'D.'), release0100)
    const other = changelogOf(unreleased(), newer('A.'), release0110('A.', 'B.'), release0100)

    const findings = findGrownReleases(current, other)

    expect(findings.map(f => f.version)).toEqual(['0.12.0', '0.11.0'])
    expect(findings[0]!.message).toBe('Release 0.12.0 holds 2 more list items than on origin/main (3 against 1). A released section never gains lines: move the added lines under [Unreleased].')
  })
})
