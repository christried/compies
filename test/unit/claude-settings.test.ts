import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The permission rules in the project settings (#561): the operator approved exactly these three rules for session cleanup
// (docs/agents/delivery.md § Branch hygiene). The test pins the strings, not the harness's matching: nothing in this repo can
// run the matcher, and a mistyped rule fails silently (no match, the old refusal comes back).
const settingsFile = fileURLToPath(new URL('../../.claude/settings.json', import.meta.url))
const settings = JSON.parse(readFileSync(settingsFile, 'utf8'))

describe('.claude/settings.json permissions (#561)', () => {
  it('holds exactly the approved allow and deny rules, so a broader rule needs a decision', () => {
    expect(settings.permissions.allow).toEqual([
      'Bash(node scripts/worktree-clean.mjs *)',
      'Bash(git push origin --delete *)',
    ])
    expect(settings.permissions.deny).toEqual(['Bash(git push origin --delete v*)'])
    expect(Object.keys(settings.permissions).sort()).toEqual(['allow', 'deny'])
  })

  it('has no autoMode key, which the classifier ignores in project settings', () => {
    expect(settings).not.toHaveProperty('autoMode')
  })

  it('names only the cleaner and the remote branch deletion, each as a Bash rule', () => {
    const rules: string[] = [...settings.permissions.allow, ...settings.permissions.deny]
    for (const rule of rules) {
      expect(rule).toMatch(/^Bash\((node scripts\/worktree-clean\.mjs |git push origin --delete )/)
    }
  })
})
