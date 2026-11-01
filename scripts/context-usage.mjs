// The context window of the main Claude Code session, in tokens (retro 0.5.1): `/implement-spec` starts no new
// implementer from 300k on and hands off instead (.claude/skills/implement-spec/SKILL.md). Claude Code writes each
// session's transcript to ~/.claude/projects/<project>/<session id>.jsonl, and every assistant turn there records its
// usage. The context is the last main-session turn's input: new input plus what it wrote to and read from the prompt
// cache. Subagents keep their own transcripts and do not count. The newest transcript of this project is the session
// that runs the script; pass a session id when several sessions run in the same project.
// Usage: node scripts/context-usage.mjs [session id]
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LIMIT = 300_000
const TAIL_BYTES = 4 * 1024 * 1024

const folder = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'))
const given = process.argv[2]
const transcripts = readdirSync(folder)
  .filter(name => name.endsWith('.jsonl') && (!given || name === `${given}.jsonl`))
  .map(name => ({ file: join(folder, name), at: statSync(join(folder, name)).mtimeMs }))
  .sort((a, b) => b.at - a.at)
if (transcripts.length === 0) throw new Error(`No session transcript in ${folder}`)
const { file } = transcripts[0]

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
console.log(`Context: ${Math.round(tokens / 1000)}k tokens (${tokens}); limit for a new implementer: ${LIMIT / 1000}k → ${tokens >= LIMIT ? 'HAND OFF' : 'ok'}`)
