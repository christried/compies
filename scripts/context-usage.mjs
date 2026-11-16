// The context window of the main Claude Code session, in tokens (retro 0.5.1): `/implement-spec` starts no new
// implementer from 300k on and hands off instead (.claude/skills/implement-spec/SKILL.md). Claude Code writes each
// session's transcript to ~/.claude/projects/<project>/<session id>.jsonl, and every assistant turn there records its
// usage. The context is the last main-session turn's input: new input plus what it wrote to and read from the prompt
// cache. Subagents keep their own transcripts and do not count. The transcript folder is the main checkout's, also
// from a worktree. A session id (argument, else $CLAUDE_CODE_SESSION_ID when its transcript exists) picks the session;
// without one the newest transcript is measured, unless another changed in the last 10 minutes: then exit 2 (#480).
// The limit is 300k unless the operator set another for the session: pass it as --limit (retro 0.14, #780: they raised it to
// 400k and to 600k, and the script still said HAND OFF at 300k). --startup lists instead what the session read before its
// first subagent, the largest first: local session 1 of 0.14 was at 71k on its first turn and at 156k when it first spawned.
// Usage: node scripts/context-usage.mjs [session id] [--limit <tokens, e.g. 400k>] [--startup]
import { execFileSync } from 'node:child_process'
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

const DEFAULT_LIMIT = 300_000
const TAIL_BYTES = 4 * 1024 * 1024
const RECENT_MS = 10 * 60 * 1000

/** Not a crash but an answer the agent can act on: stderr, nothing on stdout, exit 2. */
function refuse(message) {
  console.error(message)
  process.exit(2)
}

// The main checkout's path names the project folder, from a worktree too; outside a normal repository it is the cwd.
let main = process.cwd()
try {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  if (basename(common) === '.git') main = dirname(common)
}
catch {
  // not a git repository, or no git
}
const projectName = main.replace(/[^a-zA-Z0-9]/g, '-')
const projects = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects')
// The drive letter's case follows how the session was started, so the lookup ignores case.
let real
try {
  real = readdirSync(projects).find(name => name.toLowerCase() === projectName.toLowerCase())
}
catch {
  // no projects directory
}
if (!real) refuse(`No transcript folder for ${main} (looked for ${projectName} in ${projects})`)
const folder = join(projects, real)

// Sessions only: directories (<id>/subagents, memory) are never looked into.
const sessions = readdirSync(folder, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
  .map(entry => ({ id: entry.name.slice(0, -'.jsonl'.length), at: statSync(join(folder, entry.name)).mtimeMs }))
  .sort((a, b) => b.at - a.at)

// `--limit 400k`, `--limit 400000`; `--startup`; anything else is the session id.
const args = process.argv.slice(2)
const startup = args.includes('--startup')
const limitAt = args.indexOf('--limit')
let limit = DEFAULT_LIMIT
if (limitAt !== -1) {
  const match = /^(\d+)(k?)$/i.exec(args[limitAt + 1] ?? '')
  limit = match ? Number(match[1]) * (match[2] ? 1000 : 1) : 0
  if (limit <= 0) refuse(`--limit needs a number of tokens above 0, such as 400k or 400000 (got "${args[limitAt + 1] ?? ''}")`)
}

// The id is compared with the listing, never joined into a path.
const given = args.find((arg, index) => !arg.startsWith('--') && (limitAt === -1 || index !== limitAt + 1))
const fromEnv = process.env.CLAUDE_CODE_SESSION_ID
let session
if (given) {
  session = sessions.find(s => s.id === given)
  if (!session) refuse(`No transcript for session id ${given} in ${folder}`)
}
else if (fromEnv) {
  session = sessions.find(s => s.id === fromEnv) // a stale value is no error
}
if (!session) {
  if (sessions.length === 0) refuse(`No session transcript in ${folder}`)
  const now = Date.now()
  const recent = sessions.slice(1).filter(s => now - s.at < RECENT_MS)
  if (recent.length > 0) {
    const list = recent.slice(0, 3).map(s => `${s.id} ${Math.floor((now - s.at) / 60000)} min ago`).join(', ')
    refuse(`Not sure which session is yours: another session of this project changed its transcript in the last 10 minutes (${list}). Pass your session id: node scripts/context-usage.mjs <session id>. It is the folder above your scratchpad directory, and $CLAUDE_CODE_SESSION_ID in a Claude Code session.`)
  }
  session = sessions[0]
}
const file = join(folder, `${session.id}.jsonl`)

const contextOf = usage => (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
const thousands = tokens => `${Math.round(tokens / 1000)}k`

if (startup) {
  // The whole transcript up to the turn that spawns the first subagent: each tool result with its size in characters,
  // and the context the API reported at the first turn and at that one.
  const calls = new Map()
  const seen = new Set()
  const reads = []
  let first
  let last
  let spawned = false
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line || spawned) continue
    let entry
    try {
      entry = JSON.parse(line)
    }
    catch {
      continue
    }
    const content = entry.message?.content
    if (entry.isSidechain || !Array.isArray(content)) continue
    if (entry.message.role === 'assistant') {
      if (entry.message.usage) {
        last = contextOf(entry.message.usage)
        first ??= last
      }
      for (const part of content) {
        if (part.type !== 'tool_use') continue
        calls.set(part.id, part)
        if (part.name === 'Agent' || part.name === 'Task') spawned = true
      }
    }
    else {
      for (const part of content) {
        // A transcript can hold one result twice; it reached the context once.
        if (part.type !== 'tool_result' || seen.has(part.tool_use_id)) continue
        seen.add(part.tool_use_id)
        const call = calls.get(part.tool_use_id)
        const text = typeof part.content === 'string' ? part.content : (part.content ?? []).map(piece => piece.text ?? '').join('\n')
        const input = call?.input ?? {}
        const what = String(input.description ?? input.file_path ?? input.skill ?? input.query ?? input.command ?? '').replace(/\s+/g, ' ').slice(0, 90)
        reads.push({ chars: text.length, label: `${call?.name ?? 'tool'}: ${what}` })
      }
    }
  }
  if (first === undefined) throw new Error(`No assistant turn with usage in ${file}`)
  const end = spawned ? `${thousands(last)} before its first subagent` : `${thousands(last)} now, no subagent yet`
  console.log(`Startup of session ${session.id}: ${thousands(first)} tokens at its first turn, ${end}: ${thousands(last - first)} read in ${reads.length} tool results. The largest:`)
  for (const read of reads.sort((a, b) => b.chars - a.chars).slice(0, 12)) console.log(`  ${read.chars.toLocaleString('en-US')} ch  ${read.label}`)
  process.exit(0)
}

// Only the end of the file matters, and a long session's transcript runs to many MB.
const size = statSync(file).size
const length = Math.min(size, TAIL_BYTES)
const buffer = Buffer.alloc(length)
const fd = openSync(file, 'r')
readSync(fd, buffer, 0, length, size - length)
closeSync(fd)

let usage
for (const line of buffer.toString('utf8').split('\n').reverse()) {
  if (!line.includes('"usage"')) continue
  let entry
  try {
    entry = JSON.parse(line)
  }
  catch {
    continue // the first line of the tail is cut off
  }
  if (entry.isSidechain || entry.message?.role !== 'assistant' || !entry.message.usage) continue
  usage = entry.message.usage
  break
}
if (!usage) throw new Error(`No assistant turn with usage in the last ${TAIL_BYTES} bytes of ${file}`)

const tokens = contextOf(usage)
console.log(`Context: ${thousands(tokens)} tokens (${tokens}); limit for a new implementer: ${thousands(limit)} → ${tokens >= limit ? 'HAND OFF' : 'ok'}; session ${session.id}`)
