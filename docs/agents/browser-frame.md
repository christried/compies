# Browser-check frame

The frame around every browser-check brief (`docs/agents/subagents.md` § Supervision). The brief lists the items to check; this file holds the setup, the measuring rules and the report, which were retyped in each session's brief until the 0.8 retro. The spawn prompt names the brief, the SHA to test and the run's name (`s8`, `g4`, …), and says which setup applies: the fresh setup in § Setup, the prepared path (§ Setup, Prepared check worktree), or a check against staging (§ Setup, Staging). Read this file first, then the brief.

You change no app code and commit nothing. Your **run folder** is `<tmp>/compies-browser/<run>/`, which `results('<run>')` makes.

## Setup

Two paths. The **fresh setup** (steps 1 to 5) is for an agent that builds its own worktree at the SHA. The **prepared path** (§ Prepared check worktree, below the list) is for a check whose prepared check worktree the orchestrator built once at the SHA: that agent skips steps 1 to 3 and the production build in step 4.

1. Reset your worktree onto the SHA (`git reset --hard <sha>`), then `pnpm install --frozen-lockfile` and `pnpm --dir realtime install --frozen-lockfile`.
2. `.env` and `realtime/.dev.vars` are already there (`.worktreeinclude`). If one is missing, copy it from the main checkout without printing it: without `.dev.vars` the Worker refuses every Room publish with a 401.
3. `pnpm db:migrate` brings the dev database to the SHA's migrations. Test data goes on the dev database only, named „R<release> <run> …“ (e.g. „R08 S7 …“).
4. Start the servers with `node scripts/browser/serve.mjs start <run>` (`run_in_background`) and wait for its `ready: dev :3000, realtime :8787` line; their output goes to the run folder's `dev.log` and `rt.log`. It exits 1 naming the port if 3000 or 8787 is taken. You alone use those ports of slot 1, the checks' slot (§ Port slots). A check of a production build runs `COMPIES_STAGE=staging pnpm build` (in Git Bash, or with `COMPIES_STAGE=staging` uncommented in the worktree's `.env`, `.env.example` line 40; without it the production build has no dev sign-in, `stage.ts`) in the foreground first, then `serve.mjs start <run> --only=prod` (`prod.log`, port 3001; the Worker started by the first call already allows that origin). `serve.mjs` owns the servers' process trees, because TaskStop ends the shell and leaves nuxt, the Worker and workerd running on Windows. A brief that asks for a hard-kill test (a dropped socket, a dead Worker) names `serve.mjs stop <run>` as the cleanup before the test; without it, the 0.9 test left 14 processes for the user to end.
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

1. The tested SHA is in the header that your first script's `results('<run>')` writes to `results.log` (`== <script> on <sha>, …`): the kit reads it from `<check>` itself. It must be the SHA in the spawn prompt. A different SHA, or no kit at `<check>`, is a QUESTION for the orchestrator, before any item runs. Run no git command that names `<check>`, and no `cd <check>` in front of one: the harness refuses both. Until 0.13 this step was `git -C <check> rev-parse --short HEAD`, refused 14 times between 2026-11-11 and 2026-11-13, with 29 more refusals for a `cd` into the check worktree (#599). Do not reset or check out anything there.
2. Skip steps 1 to 3 of the fresh setup and the production build of step 4. Write nothing into `<check>` yourself: no install, migrate, build, reset or scratch file, because your own writes into it are refused. The servers started from `<check>` write their own state there (`realtime/.wrangler/`, logs), as in the three 0.12 sessions that ran this way.
3. Scripts go into the run folder, `<tmp>/compies-browser/<run>/scripts/`, not into `scripts/browser/scratch/`. A script imports the kit by its absolute path in `<check>`, as a file URL, because a bare Windows path such as `C:\…` is not an ES module specifier:

     `import { results, open } from 'file:///<check>/scripts/browser/kit.mjs'`

     A file URL takes forward slashes only, so write `<check>` with `/` and without a backslash, for example `file:///C:/Users/<you>/…/.claude/worktrees/check-<name>/scripts/browser/kit.mjs`.

     `kit.mjs` imports `chrome.mjs` from the same folder itself. A script that imports `chrome.mjs` directly uses the same form.

4. Start the Worker and the production server only, with `node <check>/scripts/browser/serve.mjs start <run> --only=realtime,prod` (`run_in_background`), and wait for its `ready:` line naming :8787 and :3001. No `dev` server. Its logs (`rt.log`, `prod.log`, `serve.log`) go to the run folder.
5. Set `BASE_URL=http://localhost:3001` in the environment of each script: the production build answers on :3001, and the kit's default base is :3000.
6. Each script starts with `const log = results('<run>')`, as in § Checks.
7. Stop with `node <check>/scripts/browser/serve.mjs stop <run>` (§ Report).
8. Cleaning, the orchestrator's call: after the last run on `<check>` has reported and its `stop` has printed, the orchestrator runs `node scripts/worktree-clean.mjs check-<name>` from the main checkout. The cleaner unlocks and removes a hand-locked worktree only when it is named by its folder name (#560); an unnamed one stays. Nothing else removes the check worktree.

### Port slots

Slot 1 is the checks': the app on :3000, the Worker on :8787, the production server on :3001, the four Chromes on :9311 to :9314. A check agent sets a slot only when its spawn prompt names slot 2; otherwise every command in this file runs on slot 1. Slot 2 serves an implementer's measurement while tickets are built (a fix, or the layout items its brief marks, `docs/agents/implementer-frame.md` § Checks), and a second check agent once no implementer runs (`docs/agents/subagents.md` § Supervision; 0.13.2's ten runs on slot 1 alone took four hours, #599). A check agent on slot 2 sets `COMPIES_SLOT=2` on `serve.mjs` and on each script, reads :8887 and :3101 in the `ready:` line, sets `BASE_URL=http://localhost:3101` on the prepared path, and has a prepared check worktree of its own. Slot 2 is every port 100 higher (:3100, :8887, :3101, :9411 to :9414), chosen with `COMPIES_SLOT=2` in the environment of `serve.mjs` and of each script (or `serve.mjs start <run> --slot=2`), with its own Chrome profiles (`profile-<account>-slot2`). `serve.mjs` passes slot 2's origins (:3100 and :3101) to its Worker and its Worker's address (:8887) to its app, so the page of slot 2 talks to the Worker of slot 2. A production build on slot 2 is measured with `BASE_URL=http://localhost:3101`. A run name belongs to one slot, and one worktree serves one slot. Both slots share the dev database and the dev Users: name every Event of the run „R<release> <run> …“, and a check that changes the dev Users (`dark.mjs` sets their Appearance) waits while a check measures on the other slot. A taken port is refused with the port named, per slot: `start <run>: port 3100 (dev) is taken (PID <n> listens)`. Take the other slot only if it is the right one for your work, otherwise wait.

### Staging

A check against staging itself, when the spawn prompt says so: 390 px there, or the verification of tickets once their PR is on `staging`. Until 0.13 no check agent could reach staging, and three sessions verified there in the orchestrator's own context, near its limit (#599).

1. `.env` must hold `VERCEL_AUTOMATION_BYPASS_SECRET` (`scripts/browser/README.md` § Staging). Test for the line with `grep -c VERCEL_AUTOMATION_BYPASS_SECRET .env`; a count of 0 is a QUESTION, and you run nothing. Never open `.env` with a tool, and never print, log or return the secret.
2. Start no server, build nothing and run no `pnpm db:migrate`: of the fresh setup only step 1 applies.
3. Run each script as `BASE_URL=https://staging.compies.christried.me COMPIES_TESTED_SHA=<the SHA the spawn prompt names> node --env-file=.env <script>`. The kit sends the secret to an https base only, once per profile, and signs in through the dev route as on `pnpm dev`.
4. Test data lands on the staging database: name it „R<release> <run> …“ and treat Events as `docs/agents/delivery.md` § Issues says (Events on staging, Finishing a test Event). An Event the operator hosts is changed only where the brief says so.
5. The header of `results.log` names the commit staging serves, from `COMPIES_TESTED_SHA`, and your worktree's beside it as the kit's. Without the variable the log names your worktree's commit and says so in a NOTE, as every staging log of 0.14 did (#780). Repeat the served commit in your return.

## Checks

- Your scripts go in `scripts/browser/scratch/` (gitignored) and import `../chrome.mjs` and `../kit.mjs` (`scripts/browser/README.md` lists what they offer). To reuse an earlier run's scripts, copy them from its run folder's `scripts/`. On the prepared path they go in the run folder instead and import from `<check>` (§ Prepared check worktree, step 3 of the agent's steps).
- Create each script with the Write tool, and write a git call plainly: from your worktree's folder, with no shell variable, no `cd` and no `git -C` in the call (`docs/agents/implementer-frame.md` § Rules, Shell). A heredoc that writes a file and a git call the harness cannot verify are both refused, 261 times in the subagents of 2026-11-11 to 2026-11-13 (#599).
- Start each script with `const log = results('<run>')`. A log of another commit in the run folder is set aside as `results-<sha>.log` first, so the log holds this commit's lines only. `log.check(label, passed, measured)` prints each line and appends it to the run folder's `results.log` the moment it is decided, so a check that stops early keeps its evidence (the s6 agent of 0.8 hit the usage limit after 40 minutes). `log.shot` saves into the run folder. A QUESTION is a note, `log.note('QUESTION <label>: <what was found>')`, which the log prints as `NOTE  QUESTION …`: the kit has no QUESTION line of its own.
- Open every page with `open()`: it signs in through the dev route and hides the Nuxt devtools pill, which otherwise sits in what you measure.
- Accounts `host`, `member`, `admin` and `member2` (`launchAll`): four dev Users, so two Parties of two, for a teammate's view or two Vetoes of one Party. 1440 × 900, and 390 × 844 with touch; the Appearance comes through `open(…, { appearance: 'dark' })` (the dev sign-in sets it, light when absent; `data-theme` belongs to the head, so an attribute set by hand is set back), System's dark through `colorScheme(tab, 'dark')`.
- The kit's Chrome reports a hovering fine pointer (a mouse) from 600 px up and a coarse one without hover below, on every machine, from the next page load on: read a hover item after `open()`, never after a bare `resize()`. Left to itself, headless Chrome answers as the machine does, which changed within minutes on 2026-11-16 and failed every hover item of a 0.14 run (#780). The case without a fine pointer at desktop width (the „?“ hint of #465) is `finePointer(tab, false)` before `open()`: it answers the page's JavaScript only, and the item's line says so (`scripts/browser/README.md`).
- `resize()` and `open()` return once the page has the new width. An item about the page moving sideways when a scrollbar comes or goes launches its Chrome with `launchAll(accounts, { scrollbars: true })`: the kit hides scrollbars otherwise.
- A curve is read with `motionOf(tab, selector)` while the animation runs, a shadow with `shadowOf(tab, selector)`: a CSS animation reports `linear` as its effect's easing, and the first layers of a Tailwind shadow are transparent.
- Every verdict is a number measured in the page (`getBoundingClientRect`, `getComputedStyle`, `getAnimations`, `document.activeElement`), logged with the number on a PASS too. A screenshot shows what the numbers decided.
- Three verdicts. PASS and FAIL come from `log.check`. A pass condition that cannot be measured as written is a QUESTION, not a FAIL: no such element, a quoted copy that the page does not show, a number the page does not give. The QUESTION names what was found in place of the number. The orchestrator decides what it means.
- An item headed „typed, not measured“ comes from a cloud run, whose drafter wrote the pass condition from the code and nobody measured it (`docs/agents/cloud.md`). Judge it against the ticket bullet it names. The bullet holds and only the typed literal differs → a QUESTION with the measured value and what the literal left out (a border, a state, a Tag the server adds), and a PASS line for the bullet. The bullet does not hold → a FAIL. In 0.14 about one in eight typed conditions did not match a page that was right, each a FAIL line, and the orchestrator triaged them over thirteen runs, from 156k to 313k (#780).
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

The orchestrator writes it; the frame covers everything above. Each item names the page, the account, the width and theme, what to measure, its pass condition as a number (a motion limit scaled to the distance), and the ticket bullet the condition tests. Items that need data name it: a 60-character game name without spaces, a pool of one game, a Tie. A literal in a pass condition (a JSON fragment, a copy string, a count) is copied from the code or the test that pins it, and an item about what a viewer may know quotes the decision or the Datenschutzerklärung sentence with its link: three 0.10 items failed on typed literals (`"cents":1999` against the server's `"cents": 1999`), and one paraphrased a secrecy decision. An item the ticket's implementer measured on slot 2 goes in with the literal it measured (`docs/agents/implementer-frame.md` § Checks). A pass condition that encodes a design trade-off the user accepted either quotes the decision's own number or asks the orchestrator to judge the frames; it never invents a threshold (the #379 clip check on 2026-11-09 wrote „opacity > 0.05“ for a residue the user had accepted as „while held invisible“, which turned it into a FAIL row, #379).

A FAIL whose pass condition contradicts a ticket is a question for the orchestrator, never a fix brief: in 0.9 an item asked for no GSAP request under reduced motion, #311 asked for a blink there, and a fix agent removed the blink to pass the item, which cost a round to revert.

The brief lists the FAILs that already have a ticket, each with its issue number (`#<n>`). A run does not report a ticketed FAIL again: it writes `log.skip(label, '#<n> already ticketed')` and goes on. A new symptom on the same page is reported as usual.
