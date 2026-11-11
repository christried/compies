# Browser-check frame

The frame around every browser-check brief (`docs/agents/subagents.md` § Supervision). The brief lists the items to check; this file holds the setup, the measuring rules and the report, which were retyped in each session's brief until the 0.8 retro. The spawn prompt names the brief, the SHA to test and the run's name (`s8`, `g4`, …), and says which setup applies: the fresh setup in § Setup, or a prepared check worktree (§ Setup, the prepared path). Read this file first, then the brief.

You change no app code and commit nothing. Your **run folder** is `<tmp>/compies-browser/<run>/`, which `results('<run>')` makes.

## Setup

Two paths. The **fresh setup** (steps 1 to 5) is for an agent that builds its own worktree at the SHA. The **prepared check worktree** (below the list) is for a check whose worktree the orchestrator built once at the SHA: that agent skips steps 1 to 3 and the production build in step 4.

1. Reset your worktree onto the SHA (`git reset --hard <sha>`), then `pnpm install --frozen-lockfile` and `pnpm --dir realtime install --frozen-lockfile`.
2. `.env` and `realtime/.dev.vars` are already there (`.worktreeinclude`). If one is missing, copy it from the main checkout without printing it: without `.dev.vars` the Worker refuses every Room publish with a 401.
3. `pnpm db:migrate` brings the dev database to the SHA's migrations. Test data goes on the dev database only, named „R<release> <run> …“ (e.g. „R08 S7 …“).
4. Start the servers with `node scripts/browser/serve.mjs start <run>` (`run_in_background`) and wait for its `ready: dev :3000, realtime :8787` line; their output goes to the run folder's `dev.log` and `rt.log`. It exits 1 naming the port if 3000 or 8787 is taken. You alone use those ports. A check of a production build runs `COMPIES_STAGE=staging pnpm build` (in Git Bash, or with `COMPIES_STAGE=staging` uncommented in the worktree's `.env`, `.env.example` line 40; without it the production build has no dev sign-in, `stage.ts`) in the foreground first, then `serve.mjs start <run> --only=prod` (`prod.log`, port 3001; the Worker started by the first call already allows that origin). `serve.mjs` owns the servers' process trees, because TaskStop ends the shell and leaves nuxt, the Worker and workerd running on Windows. A brief that asks for a hard-kill test (a dropped socket, a dead Worker) names `serve.mjs stop <run>` as the cleanup before the test; without it, the 0.9 test left 14 processes for the user to end.
5. Before the first check, the first script's `results('<run>')` writes the header of `results.log` in the run folder (the script's name and the tested SHA). The log is the report (§ Report); no other report file is written.

### Prepared check worktree

The orchestrator builds it once per SHA, before the spawn, from the main checkout in Git Bash. `<check>` is the absolute path of `.claude/worktrees/check-<name>` (0.12's was `check-012c`): the cleaner sees only worktrees under `.claude/worktrees/`. The spawn prompt names `<check>` and the SHA:

1. `git worktree add --detach .claude/worktrees/check-<name> <sha>`
2. Copy `.env` and `realtime/.dev.vars` from the main checkout into `<check>`, without printing them. `.worktreeinclude` copies them only into worktrees Claude Code creates; `git worktree add` copies neither. Without `.dev.vars` the Worker refuses every Room publish with a 401.
3. `cd <check> && pnpm install --frozen-lockfile && pnpm --dir realtime install --frozen-lockfile`
4. `cd <check> && pnpm db:migrate` (the dev database, to the SHA's migrations)
5. `cd <check> && COMPIES_STAGE=staging pnpm build` in the foreground (or with `COMPIES_STAGE=staging` uncommented in the copied `.env`, `.env.example` line 40; without it the production build has no dev sign-in, `stage.ts`).
6. `git worktree lock --reason "<reason>" <check>`, where the reason names the SHA and the ticket, for example `prepared browser check of <sha>, #<ticket>`. A lock by hand has no pid, so the cleaner keeps the worktree until it is named (step 8 below).
7. Spawn the agent with the brief, `<check>`, the SHA and the run's name.

The agent on this path:

1. `git -C <check> rev-parse --short HEAD` must print the SHA in the spawn prompt. A different SHA, or no worktree at `<check>`, is a QUESTION for the orchestrator. Do not reset or check out anything there.
2. Skip steps 1 to 3 of the fresh setup and the production build of step 4. Write nothing into `<check>` yourself: no install, migrate, build, reset or scratch file, because your own writes into it are refused. The servers started from `<check>` write their own state there (`realtime/.wrangler/`, logs), as in the three 0.12 sessions that ran this way.
3. Scripts go into the run folder, `<tmp>/compies-browser/<run>/scripts/`, not into `scripts/browser/scratch/`. A script imports the kit by its absolute path in `<check>`, as a file URL, because a bare Windows path such as `C:\…` is not an ES module specifier:

     `import { results, open } from 'file:///<check>/scripts/browser/kit.mjs'`

     `kit.mjs` imports `chrome.mjs` from the same folder itself. A script that imports `chrome.mjs` directly uses the same form.

4. Start the Worker and the production server only, with `node <check>/scripts/browser/serve.mjs start <run> --only=realtime,prod` (`run_in_background`), and wait for its `ready:` line naming :8787 and :3001. No `dev` server. Its logs (`rt.log`, `prod.log`, `serve.log`) go to the run folder.
5. Set `BASE_URL=http://localhost:3001` in the environment of each script: the production build answers on :3001, and the kit's default base is :3000.
6. Each script starts with `const log = results('<run>')`, as in § Checks.
7. Stop with `node <check>/scripts/browser/serve.mjs stop <run>` (§ Report).
8. Cleaning, the orchestrator's call: after the last run on `<check>` has reported and its `stop` has printed, the orchestrator runs `node scripts/worktree-clean.mjs check-<name>` from the main checkout. The cleaner unlocks and removes a hand-locked worktree only when it is named by its folder name (#560); an unnamed one stays. Nothing else removes the check worktree.

## Checks

- Your scripts go in `scripts/browser/scratch/` (gitignored) and import `../chrome.mjs` and `../kit.mjs` (`scripts/browser/README.md` lists what they offer). To reuse an earlier run's scripts, copy them from its run folder's `scripts/`. On the prepared path they go in the run folder instead and import from `<check>` (§ Setup, step 3 of the agent's list).
- Start each script with `const log = results('<run>')`. `log.check(label, passed, measured)` prints each line and appends it to the run folder's `results.log` the moment it is decided, so a check that stops early keeps its evidence (the s6 agent of 0.8 hit the usage limit after 40 minutes). `log.shot` saves into the run folder. A QUESTION is a note, `log.note('QUESTION <label>: <what was found>')`, which the log prints as `NOTE  QUESTION …`: the kit has no QUESTION line of its own.
- Open every page with `open()`: it signs in through the dev route and hides the Nuxt devtools pill, which otherwise sits in what you measure.
- Accounts `host`, `member`, `admin` (`launchAll`); 1440 × 900, and 390 × 844 with touch; the Appearance comes through `open(…, { appearance: 'dark' })` (the dev sign-in sets it, light when absent; `data-theme` belongs to the head, so an attribute set by hand is set back), System's dark through `colorScheme(tab, 'dark')`.
- Every verdict is a number measured in the page (`getBoundingClientRect`, `getComputedStyle`, `getAnimations`, `document.activeElement`), logged with the number on a PASS too. A screenshot shows what the numbers decided.
- Three verdicts. PASS and FAIL come from `log.check`. A pass condition that cannot be measured as written is a QUESTION, not a FAIL: no such element, a quoted copy that the page does not show, a number the page does not give. The QUESTION names what was found in place of the number. The orchestrator decides what it means.
- Run ordering and timing checks back to back, at request speed. In 0.8 the feed check passed with 2.5 s pauses between the requests and failed without them: the two-clock bug (G5) was real.
- A motion limit scales with the distance: a share of the distance per frame, or a minimum number of frames. A fixed „≤ 40 px per frame“ can't hold for a card crossing 542 px on the UI's durations (it glides at 43 px). When a brief gives a fixed limit for a long move, report the share too.

## Report

The log is the report: `results.log` in the run folder. The kit writes each line the moment it is decided. No separate report file is written, and check agents cannot create one.

- Write each item's line as soon as it is decided: `log.check` for PASS or FAIL, with the measured numbers as the detail, and the screenshot with `log.shot` (it shows what the numbers decided). A FAIL's detail adds what was expected and a `file:line` guess at the cause. A QUESTION is a note (§ Checks).
- Before the stop, write the page errors of each tab (`tab.errors`) and the refused or failed lines of `dev.log` and `rt.log` (`prod.log` on the prepared path), each with the step it appeared on, as `log.note` lines.
- Never put a User's personal data in it.

You are done when every item of the brief has its line in `results.log`, every server and Chrome you started is stopped, and your scripts are copied to the run folder's `scripts/`. Always end with the `stop` of § Setup, also after a TaskStop: TaskStop kills `serve.mjs` hard on Windows and can leave part of the tree running, and `stop` ends what `serve.mjs` recorded. Quote the last line the `stop` printed in your last message; a taken port is named there, and you end nothing yourself. If a check agent died before its `stop`, the orchestrator runs `serve.mjs stop <run>` from the check worktree on the prepared path, or in that agent's worktree on the fresh one.

Return at most 200 words: the path of `results.log`, the tested SHA, the `stop`'s last line, and one line per FAIL or QUESTION.

## The brief

The orchestrator writes it; the frame covers everything above. Each item names the page, the account, the width and theme, what to measure, its pass condition as a number (a motion limit scaled to the distance), and the ticket bullet the condition tests. Items that need data name it: a 60-character game name without spaces, a pool of one game, a Tie. A literal in a pass condition (a JSON fragment, a copy string, a count) is copied from the code or the test that pins it, and an item about what a viewer may know quotes the decision or the Datenschutzerklärung sentence with its link: three 0.10 items failed on typed literals (`"cents":1999` against the server's `"cents": 1999`), and one paraphrased a secrecy decision. A pass condition that encodes a design trade-off the user accepted either quotes the decision's own number or asks the orchestrator to judge the frames; it never invents a threshold (the #379 clip check on 2026-11-09 wrote „opacity > 0.05“ for a residue the user had accepted as „while held invisible“, which turned it into a FAIL row, #379).

A FAIL whose pass condition contradicts a ticket is a question for the orchestrator, never a fix brief: in 0.9 an item asked for no GSAP request under reduced motion, #311 asked for a blink there, and a fix agent removed the blink to pass the item, which cost a round to revert.

The brief lists the FAILs that already have a ticket, each with its issue number (`#<n>`). A run does not report a ticketed FAIL again: it writes `log.skip(label, '#<n> already ticketed')` and goes on. A new symptom on the same page is reported as usual.
