// PreToolUse hook on Bash (registered in .claude/settings.json): refuses a command whose heredoc feeds a file write
// (cat >, cat >>, tee) or whose heredoc body runs past 15 lines, and points to the Write tool (#483). `CLAUDE.md` section
// Scripting says why: a heredoc broke twice in 0.11 ("unexpected EOF"), a 67-line copy command and a 122-line script.
//
//   stdin: the harness's hook JSON ({ tool_name, tool_input: { command } })    exit 2: refused, the reason on stderr
//   exit 0: allowed, and also for any input this script cannot parse or any error of its own: the guard never blocks on its own failure.
//
// It is a guard against a slip, not a security boundary: a heredoc inside `bash -c '...'` or `eval` is not seen.

const MAX_BODY_LINES = 15

const MESSAGE_TAIL = 'Create the file with the Write tool instead, then pass it on: `gh issue create --body-file <file>`, `git commit -F <file>`, or `node <file>` for a script. A short heredoc (up to 15 lines, such as a commit message with its attribution lines) and a here-string (<<<) are fine.'

/** Does the text of one command unit (the heredoc operator's own command, a pipeline included) write a file? */
function writesFile(unit) {
  // A quoted string can hold `>` or the word tee; drop its content.
  const flat = unit.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, ' Q ')
  for (const segment of flat.split('|')) {
    const words = segment.trim().split(/\s+/)
    let k = 0
    while (k < words.length && (/^[A-Za-z_]\w*=/.test(words[k]) || /^(?:if|then|else|elif|do|while|until|!|\{|time|command|exec|sudo|env)$/.test(words[k]))) k++
    const name = (words[k] ?? '').split(/[<>]/)[0].replace(/^.*[\\/]/, '')
    if (name === 'tee') return true
    if (name === 'cat') {
      for (const match of segment.matchAll(/(?<![>0-9&])(?:1|&)?>>?\s*([^\s&<>|;()]\S*)/g)) {
        if (match[1] !== '/dev/null') return true
      }
    }
  }
  return false
}

/** Every heredoc of a command, in order: how many body lines it has and whether it feeds a file write. */
function heredocsOf(command) {
  const text = command.replace(/\r/g, '')
  const n = text.length
  const found = []
  const stack = [] // 'dq' (inside "...") or 'cs' (inside $( ), ( ) or <( ))
  const savedUnitStarts = []
  let pending = [] // heredocs whose body starts at the next newline
  let unitStart = 0
  let i = 0

  const closeUnit = (end) => {
    for (const heredoc of pending) heredoc.unitEnd ??= end
  }
  // At the first `(` of `((`: the index after the matching `))`, or the end of the text.
  const skipArithmetic = (from) => {
    let depth = 0
    for (let j = from; j < n; j++) {
      if (text[j] === '(') depth++
      else if (text[j] === ')' && --depth === 0) return j + 1
    }
    return n
  }
  const finish = (heredoc, lines) => {
    found.push({ lines, writes: writesFile(text.slice(heredoc.unitStart, heredoc.unitEnd ?? n)) })
  }
  const readBodies = (from) => {
    let pos = from
    for (const heredoc of pending) {
      let lines = 0
      while (pos < n) {
        const eol = text.indexOf('\n', pos)
        const line = text.slice(pos, eol === -1 ? n : eol)
        pos = eol === -1 ? n : eol + 1
        if ((heredoc.strip ? line.replace(/^\t+/, '') : line) === heredoc.delimiter) break
        lines++
      }
      finish(heredoc, lines)
    }
    pending = []
    return pos
  }

  while (i < n) {
    const c = text[i]
    if (stack.at(-1) === 'dq') {
      if (c === '\\') {
        i += 2
      }
      else if (c === '"') {
        stack.pop()
        i++
      }
      else if (c === '$' && text[i + 1] === '(') {
        if (text[i + 2] === '(') {
          i = skipArithmetic(i + 1)
        }
        else {
          stack.push('cs')
          savedUnitStarts.push(unitStart)
          i += 2
          unitStart = i
        }
      }
      else {
        i++
      }
      continue
    }
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '\'') {
      const close = text.indexOf('\'', i + 1)
      i = close === -1 ? n : close + 1
      continue
    }
    if (c === '"') {
      stack.push('dq')
      i++
      continue
    }
    if (c === '#' && (i === 0 || /[\s;|&(]/.test(text[i - 1]))) {
      const eol = text.indexOf('\n', i)
      i = eol === -1 ? n : eol
      continue
    }
    if (c === '$' && text[i + 1] === '(') {
      if (text[i + 2] === '(') {
        i = skipArithmetic(i + 1)
        continue
      }
      stack.push('cs')
      savedUnitStarts.push(unitStart)
      i += 2
      unitStart = i
      continue
    }
    if (c === '(') {
      if (text[i + 1] === '(') {
        i = skipArithmetic(i)
        continue
      }
      stack.push('cs')
      savedUnitStarts.push(unitStart)
      i++
      unitStart = i
      continue
    }
    if (c === ')') {
      if (stack.at(-1) === 'cs') {
        closeUnit(i)
        stack.pop()
        unitStart = savedUnitStarts.pop()
      }
      i++
      continue
    }
    if (c === ';' || (c === '&' && text[i + 1] === '&') || (c === '|' && text[i + 1] === '|')) {
      const length = c === ';' ? 1 : 2
      closeUnit(i)
      i += length
      unitStart = i
      continue
    }
    if (c === '&') {
      // `2>&1`, `>&2` and `&>file` are redirections; a lone `&` ends a command.
      if (text[i - 1] !== '>' && text[i - 1] !== '<' && text[i + 1] !== '>') {
        closeUnit(i)
        i++
        unitStart = i
      }
      else {
        i++
      }
      continue
    }
    if (c === '\n') {
      closeUnit(i)
      i = pending.length ? readBodies(i + 1) : i + 1
      unitStart = i
      continue
    }
    if (c === '<') {
      if (text.startsWith('<<<', i)) {
        i += 3
        continue
      }
      if (text.startsWith('<<', i)) {
        let j = i + 2
        const strip = text[j] === '-'
        if (strip) j++
        while (text[j] === ' ' || text[j] === '\t') j++
        let delimiter = ''
        while (j < n && !/[\s;|&<>()]/.test(text[j])) {
          const ch = text[j]
          if (ch === '\'' || ch === '"') {
            const close = text.indexOf(ch, j + 1)
            const end = close === -1 ? n : close
            delimiter += text.slice(j + 1, end)
            j = end + 1
          }
          else if (ch === '\\') {
            delimiter += text[j + 1] ?? ''
            j += 2
          }
          else {
            delimiter += ch
            j++
          }
        }
        if (delimiter === '') {
          i += 2
          continue
        }
        pending.push({ delimiter, strip, unitStart, unitEnd: undefined })
        i = j
        continue
      }
    }
    i++
  }
  // A heredoc whose body never starts (no newline after the operator): nothing to count.
  for (const heredoc of pending) finish(heredoc, 0)
  return found
}

/** The refusal's text, or null when the command may run. */
function verdict(command) {
  const heredocs = heredocsOf(command)
  const longest = Math.max(0, ...heredocs.map(heredoc => heredoc.lines))
  const reasons = []
  if (heredocs.some(heredoc => heredoc.writes)) reasons.push('a heredoc feeds a file write (`cat >`, `cat >>` or `tee`)')
  if (longest > MAX_BODY_LINES) reasons.push(`a heredoc body runs ${longest} lines (the limit is ${MAX_BODY_LINES})`)
  if (!reasons.length) return null
  return `Refused by the heredoc guard (CLAUDE.md, Scripting): ${reasons.join(' and ')}. A heredoc broke twice in 0.11 with "unexpected EOF". ${MESSAGE_TAIL}`
}

async function main() {
  let raw = ''
  process.stdin.setEncoding('utf8') // a chunk boundary must not split a multi-byte character (umlauts, „“)
  for await (const chunk of process.stdin) raw += chunk
  const input = JSON.parse(raw)
  const command = input?.tool_name === 'Bash' ? input.tool_input?.command : undefined
  if (typeof command !== 'string') return
  const refusal = verdict(command)
  if (refusal) {
    process.stderr.write(`${refusal}\n`)
    process.exitCode = 2
  }
}

try {
  await main()
}
catch {
  // Unparseable input or an error of our own: never block on it.
}
