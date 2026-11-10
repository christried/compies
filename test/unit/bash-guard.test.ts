import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The heredoc guard (#483): a PreToolUse hook on Bash. What the harness sees is its exit code and stderr, so the test runs
// it as the harness does, a Node process with the hook JSON on stdin.
const script = fileURLToPath(new URL('../../scripts/bash-guard.mjs', import.meta.url))
const settingsFile = fileURLToPath(new URL('../../.claude/settings.json', import.meta.url))

/** Runs the hook on `stdin` (a string) and resolves its exit code and what it wrote to stdout and stderr. */
function run(stdin: string) {
  return new Promise<{ code: number | null, stdout: string, stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [script])
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
    child.stdin.end(stdin)
  })
}

const hook = (command: string) => run(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }))
const lines = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n')

/** The refusal names the Write tool and how to pass the file on. */
async function expectRefused(command: string) {
  const result = await hook(command)
  expect(result.code).toBe(2)
  expect(result.stdout).toBe('')
  for (const hint of ['Write tool', '--body-file', 'git commit -F', 'node <file>']) expect(result.stderr).toContain(hint)
  return result
}

async function expectAllowed(command: string) {
  const result = await hook(command)
  expect(result.code).toBe(0)
  expect(result.stdout).toBe('')
  expect(result.stderr).toBe('')
}

describe('scripts/bash-guard.mjs', () => {
  describe('refuses', () => {
    it.each([
      ['cat > file', `cat > a.txt <<'EOF'\nhello\nEOF`],
      ['a redirect after the operator', `cat <<EOF > a.txt\nx\nEOF`],
      ['cat >> file', `cat >> a.txt <<EOF\nx\nEOF`],
      ['tee', `tee a.txt <<EOF\nx\nEOF`],
      ['a pipe into tee', `cat <<EOF | tee a.txt\nx\nEOF`],
      ['a write after a separator, double-quoted delimiter', `cd sub && cat > f <<"EOF"\nx\nEOF`],
      ['<<- with a tab-indented closing line', `cat > f <<-EOF\n\tx\n\tEOF`],
      ['a write after a commit-message substitution', `git commit -m "$(cat <<EOF\nx\nEOF\n)" && cat > f <<EOF\ny\nEOF`],
      ['a first heredoc that writes', `cat <<A; cat > f <<B\na\nA\nb\nB`],
    ])('a heredoc that writes a file: %s', async (_name, command) => {
      await expectRefused(command)
    })

    it.each([
      ['a long body without a file write', `node - <<'EOF'\n${lines(16)}\nEOF`, '16 lines'],
      ['a long commit message', `git commit -m "$(cat <<'EOF'\n${lines(20)}\nEOF\n)"`, '20 lines'],
      ['the second of two heredocs', `cat <<A; cat <<B\na\nA\n${lines(16)}\nB`, '16 lines'],
      ['an unterminated heredoc', `cat <<EOF\n${lines(20)}`, '20 lines'],
    ])('a heredoc body past 15 lines: %s', async (_name, command, expected) => {
      const result = await expectRefused(command)
      expect(result.stderr).toContain(expected)
    })

    it('names both reasons for a write with a long body', async () => {
      const result = await expectRefused(`cat > f <<EOF\n${lines(20)}\nEOF`)
      expect(result.stderr).toContain('feeds a file write')
      expect(result.stderr).toContain('20 lines')
    })
  })

  describe('allows', () => {
    it.each([
      ['exactly 15 lines', `node - <<'EOF'\n${lines(15)}\nEOF`],
      ['a commit message with attribution lines', `git commit -m "$(cat <<'EOF'\nfix(home): keep the hot button readable\n\nThe hover fill had no on-colour.\nThe fix gives it text-on-hot.\nRefs #431\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_x\nEOF\n)"`],
      ['two short heredocs', `cat <<A; cat <<B\na\nA\nb\nB`],
    ])('a short heredoc: %s', async (_name, command) => {
      await expectAllowed(command)
    })

    it.each([
      ['cat <<< "hello"'],
      ['cat > f <<< "hello"'],
    ])('a here-string: %s', async (command) => {
      await expectAllowed(command)
    })

    it.each([
      ['echo hi'],
      ['cat > f < in.txt'],
      ['echo x | tee f'],
      ['node scripts/context-usage.mjs'],
    ])('a command without a heredoc: %s', async (command) => {
      await expectAllowed(command)
    })

    it.each([
      ['cat <<\'EOF\'\nbody\nEOF'],
      ['gh issue comment 1 --body-file - <<\'EOF\'\nhi\nEOF'],
      ['cat <<EOF >/dev/null\nx\nEOF'],
      ['cat <<EOF >&2\nx\nEOF'],
      ['cat <<EOF | grep x > out\nx\nEOF'],
    ])('a heredoc that does not write a file: %s', async (command) => {
      await expectAllowed(command)
    })

    it.each([
      ['echo $((1 << 4)) && cat > f'],
      ['echo "$(( 1 << 4 ))"'],
      ['node -e "console.log(1 << 4)" > out.txt'],
      ['echo \'<<EOF\' > out.txt'],
      ['echo "a <<EOF" > out.txt'],
      ['# note <<EOF\necho hi'],
    ])('a << that is not a heredoc: %s', async (command) => {
      await expectAllowed(command)
    })

    it('a body that mentions a heredoc', async () => {
      await expectAllowed(`gh issue create --body-file - <<'EOF'\nuse cat > f <<EOF\nnot a heredoc\nEOF\nEOF2\nEOF`)
    })

    it('non-ASCII text that spans stdin chunks', async () => {
      await expectAllowed(`git commit -m "$(cat <<'EOF'\nGlücksrad „Profil“ ${'ä'.repeat(70000)}\nEOF\n)"`)
    })

    it.each([
      ['empty stdin', ''],
      ['not json', 'not json'],
      ['null', 'null'],
      ['an empty object', '{}'],
      ['no tool_input', '{"tool_name":"Bash"}'],
      ['a command that is not a string', '{"tool_name":"Bash","tool_input":{"command":5}}'],
      ['another tool', JSON.stringify({ tool_name: 'Read', tool_input: { command: `cat > a.txt <<'EOF'\nhello\nEOF` } })],
    ])('input it cannot use: %s', async (_name, stdin) => {
      const result = await run(stdin)
      expect(result.code).toBe(0)
      expect(result.stderr).toBe('')
    })
  })

  it('is registered as a PreToolUse hook on Bash next to the SessionStart hook', () => {
    const settings = JSON.parse(readFileSync(settingsFile, 'utf8'))
    const entry = settings.hooks.PreToolUse.find((candidate: { matcher: string }) => candidate.matcher === 'Bash')
    expect(entry.hooks[0].type).toBe('command')
    expect(entry.hooks[0].command).toContain('scripts/bash-guard.mjs')
    expect(settings.hooks.SessionStart).toHaveLength(1)
  })
})
