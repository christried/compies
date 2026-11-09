# Browser-check frame

The frame around every browser-check brief (`docs/agents/subagents.md` § Supervision). The brief lists the items to check; this file holds the setup, the measuring rules and the report, which were retyped in each session's brief until the 0.8 retro. The spawn prompt names the brief, the SHA to test and the run's name (`s8`, `g4`, …). Read this file first, then the brief.

You change no app code and commit nothing. Your **run folder** is `<tmp>/compies-browser/<run>/`, which `results('<run>')` makes.

## Setup

1. Reset your worktree onto the SHA (`git reset --hard <sha>`), then `pnpm install --frozen-lockfile` and `pnpm --dir realtime install --frozen-lockfile`.
2. `.env` and `realtime/.dev.vars` are already there (`.worktreeinclude`). If one is missing, copy it from the main checkout without printing it: without `.dev.vars` the Worker refuses every Room publish with a 401.
3. `pnpm db:migrate` brings the dev database to the SHA's migrations. Test data goes on the dev database only, named „R<release> <run> …“ (e.g. „R08 S7 …“).
4. Start the servers with `node scripts/browser/serve.mjs start <run>` (`run_in_background`) and wait for its `ready: dev :3000, realtime :8787` line; their output goes to the run folder's `dev.log` and `rt.log`. It exits 1 naming the port if 3000 or 8787 is taken. You alone use those ports. A check of a production build runs `COMPIES_STAGE=staging pnpm build` in the foreground first, then `serve.mjs start <run> --only=prod` (`prod.log`, port 3001; the Worker started by the first call already allows that origin). `--only=prod` has not run yet: the first run that reaches `ready` removes that note from `scripts/browser/README.md`. `serve.mjs` owns the servers' process trees, because TaskStop ends the shell and leaves nuxt, the Worker and workerd running on Windows. A brief that asks for a hard-kill test (a dropped socket, a dead Worker) names `serve.mjs stop <run>` as the cleanup before the test; without it, the 0.9 test left 14 processes for the user to end.
5. Write `browser-report.md` in the run folder before the first check: the tested SHA and a verdict table with one empty row per item of the brief.

## Checks

- Your scripts go in `scripts/browser/scratch/` (gitignored) and import `../chrome.mjs` and `../kit.mjs` (`scripts/browser/README.md` lists what they offer). To reuse an earlier run's scripts, copy them from its run folder's `scripts/`.
- Start each script with `const log = results('<run>')`. `log.check(label, passed, measured)` prints each line and appends it to the run folder's `results.log` the moment it is decided, so a check that stops early keeps its evidence (the s6 agent of 0.8 hit the usage limit after 40 minutes). `log.shot` saves into the run folder.
- Open every page with `open()`: it signs in through the dev route and hides the Nuxt devtools pill, which otherwise sits in what you measure.
- Accounts `host`, `member`, `admin` (`launchAll`); 1440 × 900, and 390 × 844 with touch; light and dark with `theme()`.
- Every verdict is a number measured in the page (`getBoundingClientRect`, `getComputedStyle`, `getAnimations`, `document.activeElement`), logged with the number on a PASS too. A screenshot shows what the numbers decided.
- Run ordering and timing checks back to back, at request speed. In 0.8 the feed check passed with 2.5 s pauses between the requests and failed without them: the two-clock bug (G5) was real.
- A motion limit scales with the distance: a share of the distance per frame, or a minimum number of frames. A fixed „≤ 40 px per frame“ can't hold for a card crossing 542 px on the UI's durations (it glides at 43 px). When a brief gives a fixed limit for a long move, report the share too.

## Report

- Fill an item's row in `browser-report.md` as soon as it is decided: PASS or FAIL, the measured numbers, the screenshot that shows it. A FAIL adds what was expected and a `file:line` guess at the cause.
- Last row: the page errors of each tab (`tab.errors`), and the refused or failed lines in `dev.log` and `rt.log`, with the step they appeared on.
- Never put a User's personal data in it.

You are done when every item of the brief has its row, every server and Chrome you started is stopped, and your scripts are copied to the run folder's `scripts/`. Always end with `node scripts/browser/serve.mjs stop <run>`, also after a TaskStop: TaskStop kills `serve.mjs` hard on Windows and can leave part of the tree running, and `stop` ends what `serve.mjs` recorded. Make the report's last row the `stop` output (`stopped: ports :3000, :8787 free`); a taken port is named there, and you end nothing yourself. If a check agent died before its `stop`, the orchestrator runs `serve.mjs stop <run>` in that agent's worktree. Return at most 200 words: the report's path, the tested SHA, and one line per FAIL.

## The brief

The orchestrator writes it; the frame covers everything above. Each item names the page, the account, the width and theme, what to measure, its pass condition as a number (a motion limit scaled to the distance), and the ticket bullet the condition tests. Items that need data name it: a 60-character game name without spaces, a pool of one game, a Tie. A literal in a pass condition (a JSON fragment, a copy string, a count) is copied from the code or the test that pins it, and an item about what a viewer may know quotes the decision or the Datenschutzerklärung sentence with its link: three 0.10 items failed on typed literals (`"cents":1999` against the server's `"cents": 1999`), and one paraphrased a secrecy decision. A pass condition that encodes a design trade-off the user accepted either quotes the decision's own number or asks the orchestrator to judge the frames; it never invents a threshold (b379c wrote „opacity > 0.05“ for a residue the user had accepted as „while held invisible“, which turned it into a FAIL row, #379).

A FAIL whose pass condition contradicts a ticket is a question for the orchestrator, never a fix brief: in 0.9 an item asked for no GSAP request under reduced motion, #311 asked for a blink there, and a fix agent removed the blink to pass the item, which cost a round to revert.
