// The context window of the main Claude Code session, in tokens (retro 0.5.1): `/implement-spec` starts no new
// implementer from 300k on and hands off instead (.claude/skills/implement-spec/SKILL.md). Claude Code writes each
// session's transcript to ~/.claude/projects/<project>/<session id>.jsonl, and every assistant turn there records its
// usage. The context is the last main-session turn's input: new input plus what it wrote to and read from the prompt
// cache. Subagents keep their own transcripts and do not count. The transcript folder is the main checkout's, also
// from a worktree. A session id (argument, else $CLAUDE_CODE_SESSION_ID when its transcript exists) picks the session;
// without one the newest transcript is measured, unless another changed in the last 10 minutes: then exit 2 (#480).
// Usage: node scripts/context-usage.mjs [session id]
import { execFileSync } from 'node:child_process'
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

const LIMIT = 300_000
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

// The id is compared with the listing, never joined into a path.
const given = process.argv[2]
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

const tokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
console.log(`Context: ${Math.round(tokens / 1000)}k tokens (${tokens}); limit for a new implementer: ${LIMIT / 1000}k → ${tokens >= LIMIT ? 'HAND OFF' : 'ok'}; session ${session.id}`)
