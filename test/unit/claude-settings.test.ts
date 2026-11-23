import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The permission rules in the project settings (#561): the operator approved exactly these three rules for session cleanup
// (docs/agents/delivery.md § Branch hygiene). The test pins the strings, not the harness's matching: nothing in this repo can
// run the matcher, and a mistyped rule fails silently (no match, the old refusal comes back).
const settingsFile = fileURLToPath(new URL('../../.claude/settings.json', import.meta.url))
const settings = JSON.parse(readFileSync(settingsFile, 'utf8'))

// The account's connectors COMPIES does not use, denied as whole servers so no session starts with their tools (the retro of
// 0.15–0.18.1, #833: Neon and Resend alone listed about 270 tool names). Neon also reaches the production database, which
// no agent may hold (docs/agents/delivery.md, Production data). Vercel, Claude Docs and Claude in Chrome stay.
const UNUSED_CONNECTORS = [
  'mcp__claude_ai_Neon',
  'mcp__claude_ai_Resend',
  'mcp__claude_ai_Gmail',
  'mcp__claude_ai_Google_Calendar',
  'mcp__claude_ai_Google_Docs',
  'mcp__claude_ai_Google_Drive',
  'mcp__claude_ai_Google_Sheets',
  'mcp__claude_ai_Google_Slides',
  'mcp__claude_ai_Notion',
  'mcp__claude_ai_Spotify',
  'mcp__claude_ai_Claude_Academy',
]

describe('.claude/settings.json permissions (#561)', () => {
  it('holds exactly the approved allow and deny rules, so a broader rule needs a decision', () => {
    expect(settings.permissions.allow).toEqual([
      'Bash(node scripts/worktree-clean.mjs *)',
      'Bash(git push origin --delete *)',
    ])
    expect(settings.permissions.deny).toEqual(['Bash(git push origin --delete v*)', ...UNUSED_CONNECTORS])
    expect(Object.keys(settings.permissions).sort()).toEqual(['allow', 'deny'])
  })

  it('has no autoMode key, which the classifier ignores in project settings', () => {
    expect(settings).not.toHaveProperty('autoMode')
  })
})
