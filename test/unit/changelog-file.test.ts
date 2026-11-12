import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareVersions, parseChangelog } from '~~/shared/changelog'
import { findGrownReleases } from './changelog-growth'

// Guard over the real CHANGELOG.md and package.json (#78): the file parses, Releases strictly go down in
// version and never up in date, and package.json names the newest Release.
const root = resolve(import.meta.dirname, '../..')
const source = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }

// A hook-inherited GIT_DIR would point git at the wrong repo (as in session-start-note-script.test.ts).
const { GIT_DIR: _dir, GIT_WORK_TREE: _tree, GIT_INDEX_FILE: _index, ...inherited } = process.env
const gitEnv = { ...inherited, GIT_TERMINAL_PROMPT: '0' }

function git(...args: string[]) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: gitEnv })
}

// null = origin/main is not available here; otherwise the changelog text and the commit it came from.
// Never fetches: a unit test must not reach the network (slow, flaky offline, can hang on a credential prompt).
function changelogOnMain(): { text: string, sha: string } | null {
  const ref = git('rev-parse', '--verify', '--quiet', 'origin/main^{commit}')
  if (ref.error || ref.status !== 0) return null
  const shown = git('show', 'origin/main:CHANGELOG.md')
  if (shown.error || shown.status !== 0) return null
  const sha = git('rev-parse', '--short', 'origin/main')
  return { text: shown.stdout, sha: sha.stdout.trim() }
}

const onMain = changelogOnMain()
// GitHub Actions sets GITHUB_ACTIONS; plain CI may be set in a cloud session that still lacks the ref.
const mustRun = process.env.GITHUB_ACTIONS === 'true'
const skippedTitle = 'holds no more list items in a released section than origin/main (SKIPPED: origin/main is not available here; run "git fetch origin main")'

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

  // The changelog is copy: the Neuigkeiten page renders it, so GLOSSARY.md's copy rules hold in it (retro 0.9, finding 7).
  // Compibert is never named in copy; the lines say „die App-Figur“. A further glossary word the user names joins the list.
  it('names no glossary word that stays out of copy', () => {
    const banned = ['Compibert']
    const lines = source.split('\n').flatMap((line, index) => banned.filter(word => line.includes(word)).map(word => `line ${index + 1} names ${word}`))

    expect(lines).toEqual([])
  })

  // A released section never gains lines (#566, retro 0.12): after the 0.11.0 cut git merged this file into the 0.12
  // integration branch without a conflict and left every 0.12 line under [0.11.0]. Compared with the same section on
  // origin/main by list item count. While a Release is on staging but not yet on main it passes as "absent": the check
  // guards a Release from the moment main has it. A stale local origin/main only weakens the check; its one false red is
  // a line main gained in a released section after the ref was fetched, and the message says how to refresh it.
  if (onMain === null && !mustRun) {
    console.warn(`changelog check ${skippedTitle}`)
    it.skip(skippedTitle, () => {})
  }
  else {
    it('holds no more list items in a released section than origin/main', () => {
      // CI fetches main before the tests (.github/workflows/ci.yml); without the ref this check would be silently green.
      expect(onMain, 'CI must fetch main before the tests (.github/workflows/ci.yml, step "Fetch main for the changelog check"); without origin/main this check is silently green').not.toBeNull()
      // The count of Releases in this file, the proof in the CI log that the case ran.
      console.info(`changelog check: ${changelog.releases.length} Releases compared with origin/main ${onMain!.sha}`)
      const grown = findGrownReleases(source, onMain!.text)

      expect(grown.map(g => `CHANGELOG.md: ${g.message} origin/main is at ${onMain!.sha}; if that ref is stale, run "git fetch origin main".`)).toEqual([])
    })
  }
})
