// Adds one line to a notes comment of an issue, edited in place (docs/agents/delivery.md § Issues: „For the Release PR“,
// „Waiting for the user“). In 0.18 a line appended by hand landed below the comment's footer, and a second script moved it (#833).
//
//   node scripts/issue-note.mjs <issue> "<comment heading>" <line file> [--under "<section>"]
//
// The comment is the issue's newest one whose first line holds the heading; without one it is made, headed „## <heading>“.
// The line (the first line of the file, written with the Write tool) goes at the end of the section whose bold or heading
// line names `--under`, a new section when there is none, or at the end of the text above the footer. It talks to GitHub
// through `gh api` only (REST), so it runs in a cloud session too. It prints the comment's URL.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withLine } from './issue-note-line.mjs'

const REPO = 'christried/compies'
const args = process.argv.slice(2)
const underAt = args.indexOf('--under')
const under = underAt === -1 ? undefined : args[underAt + 1]
const [issue, heading, lineFile] = args.filter((_, index) => underAt === -1 || (index !== underAt && index !== underAt + 1))
if (!issue || !heading || !lineFile) {
  console.log('usage: node scripts/issue-note.mjs <issue> "<comment heading>" <line file> [--under "<section>"]')
  process.exit(1)
}
const line = readFileSync(lineFile, 'utf8').split(/\r?\n/)[0]?.trimEnd() ?? ''
if (!line) {
  console.log(`no line in ${lineFile}`)
  process.exit(1)
}

const gh = (...ghArgs) => execFileSync('gh', ghArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
/** @type {{ id: number, html_url: string, body: string }[]} */
const comments = JSON.parse(gh('api', `repos/${REPO}/issues/${issue}/comments`, '--paginate', '--slurp')).flat()
const found = comments.filter(comment => (comment.body.split(/\r?\n/)[0] ?? '').includes(heading)).at(-1)

// The body goes through a file: a command-line argument would lose its quotes and umlauts on Windows.
const dir = mkdtempSync(join(tmpdir(), 'issue-note-'))
const bodyFile = join(dir, 'body.md')
try {
  if (found) {
    writeFileSync(bodyFile, withLine(found.body, line, under))
    gh('api', '-X', 'PATCH', `repos/${REPO}/issues/comments/${found.id}`, '-F', `body=@${bodyFile}`, '--jq', '.id')
    console.log(`added to ${found.html_url}`)
  }
  else {
    writeFileSync(bodyFile, withLine(`## ${heading}\n`, line, under))
    const url = gh('api', `repos/${REPO}/issues/${issue}/comments`, '-F', `body=@${bodyFile}`, '--jq', '.html_url').trim()
    console.log(`made ${url}`)
  }
}
finally {
  rmSync(dir, { recursive: true, force: true })
}
