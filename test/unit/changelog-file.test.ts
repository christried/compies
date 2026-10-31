import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareVersions, parseChangelog } from '~~/shared/changelog'

// Guard over the real CHANGELOG.md and package.json (#78): the file parses, Releases strictly go down in
// version and never up in date, and package.json names the newest Release.
const root = resolve(import.meta.dirname, '../..')
const source = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }

describe('CHANGELOG.md', () => {
  const changelog = parseChangelog(source)

  it('parses, which covers the heading forms and the five group names', () => {
    expect(changelog.releases.length).toBeGreaterThan(0)
  })

  it('lists the Releases with versions strictly going down', () => {
    const versions = changelog.releases.map(r => r.version)
    for (let i = 1; i < versions.length; i++) {
      expect(compareVersions(versions[i - 1]!, versions[i]!), `${versions[i - 1]} before ${versions[i]}`).toBeGreaterThan(0)
    }
  })

  it('never puts a later date above an earlier one', () => {
    const dates = changelog.releases.map(r => r.date)
    for (let i = 1; i < dates.length; i++) expect(dates[i]! <= dates[i - 1]!).toBe(true)
  })

  it('has package.json at the newest Release version', () => {
    expect(packageJson.version).toBe(changelog.releases[0]!.version)
  })
})
