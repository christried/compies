# Browser checks

Headless Chrome driven over the DevTools protocol, one profile per account, so the Dev Host and the Dev Member are signed in side by side. For the browser check of `docs/agents/subagents.md` § Supervision when Claude in Chrome isn't there, and for every ticket with live behaviour or motion. No dependency: Node 24 and an installed Chrome (`CHROME_PATH` if it isn't in the usual place).

Needs `pnpm dev` and, for anything live, `pnpm dev:realtime` (README § Realtime). Profiles and screenshots go to `<tmp>/compies-browser/`, and a check that logs through `results(name)` writes its lines and screenshots to its own folder there.

| Command | What it does |
|---|---|
| `node scripts/browser/serve.mjs start <run> [--only=dev,realtime,prod] [--minutes=90]` / `stop <run>` | Starts the servers of a check (default `pnpm dev` on :3000 and the Worker on :8787, which also allows :3001; `prod` is `.output/server/index.mjs` on :3001 after a foreground `pnpm build`), logs to `<tmp>/compies-browser/<run>/` (`dev.log`, `rt.log`, `prod.log`, `serve.log`), prints `ready: …` once each answers HTTP and stays up (start it with `run_in_background`). It ends its own process trees on `stop`, when its parent process is gone, on a signal, and after `--minutes`, then checks that the ports are free; `stop` prints the result and exits 1 naming a port (and its PID, where Windows says it) that is still taken. After a TaskStop (which kills `serve.mjs` hard) run `stop` anyway: it ends the processes `serve.mjs` recorded while it ran. A plain `pnpm build` has no dev sign-in (404): a check of the minified build runs `COMPIES_STAGE=staging pnpm build` first, and waits 4-5 s after `open()` before the first click (the SSR page is clickable before it hydrates) |
| `node scripts/browser/shots.mjs <path> [selector]` | Screenshots of a page (or one element) as Host and Member, at 1440 and 390 px. The path goes without its leading slash (`e/my-event`): Git Bash turns `/e/…` into a Windows path |
| `node scripts/browser/moves.mjs <slug>` | Host at 1440 px, Member at 390 px on one Event with Team choice open: moves by API and by dragging the avatar picture (mouse and long press), every animation both sides draw (curve, duration, who), the seats after it, native drags, page errors |
| `node scripts/browser/pool-preview.mjs` | Host at 1440 px, Member at 390 px on an Event the script creates (Host pick, Pool preview on, one game with notes): what a Member sees of a pool game (picture and name; no notes, no player count), and the Pool preview switched off and on while the Member's page stays open. One PASS or FAIL line per check, also in `pool-preview/results.log`, exit code 1 on any FAIL |
| `node scripts/browser/standings.mjs [--third] [--only=<run>,…]` | The Standings in motion (#276): Host and Member (and with `--third` the Admin as a third Party) on an Event the script creates (four Rounds set); the Host enters, corrects and re-corrects Results by the API while the Member's page is open, and the Member's browser is sampled every frame. Runs: `phone-stage`, `phone-tab` (390 px), `desktop` (1440 px, stage and panel), each with full motion and `-reduced` (`data-motion`), plus `desktop-media` (`prefers-reduced-motion`). Checks the rows' glide (transforms, the CSSTransitions in `getAnimations()`, the 0.04 s stagger), the count-up, pill, stamp, confetti, the reduced-motion twins, the live region, that nothing plays on a load, a view switch or a hidden tab, and (first run) the result sheet's and the page's blocks' move transitions. One PASS or FAIL line per check, exit code 1 on any FAIL; the lines and the screenshots also in `standings/`; a run takes ~1.5 minutes |

A new check imports two modules. `chrome.mjs` is the DevTools protocol and knows nothing about COMPIES: `launch(account)` (ports per account in `PORTS`), `launchAll(accounts)` / `closeAll(tabs)`, `tab.send` / `tab.evaluate`, `resize`, `shot(tab, name, selector, dir)`, `sleep`. `kit.mjs` is what a COMPIES check needs on top:

- `results(name)`: the check's folder `<tmp>/compies-browser/<name>/` with `check(label, passed, measured)`, `skip` and `note` (each line printed and appended to its `results.log` at once, after a header with the script and the tested SHA), `shot` and `failed`;
- `open(tab, path, width, height, waitFor, { news })`: the dev sign-in, with the Nuxt devtools hidden; `theme(tab, 'dark')`;
- `api(tab, method, path, body)`, and `ok(answer, what)` for its body (it throws unless the answer is a 200);
- the scenario helpers `createGame`, `createEvent`, `joinEvent`, `runningEvent(tabs, { name, games, set, settings })` (one Party per tab, the Session started, games set), `finishedEvent(tabs, { name, outcome: 'winner' | 'tie', games })` (on top of it: every game set, Results for the outcome, the Finish), `setGame`, `enterResult` with `placesOf(order)`, `eventView`, `patchSettings` (throws when the answer lacks the change);
- a User's hands: `clickText`, `mouseClick`, `typeInto`, `pressKey`, `drag(tab, from, to, { touch })`, `stepperNext`; and the page read back: `textOf`, `visibleButtons`, `switches`, `animations(tab)`.

A browser-check agent writes its own scripts in `scratch/` here (gitignored), so they import `../kit.mjs` from whichever worktree runs them (`docs/agents/browser-frame.md`).

The game edit route is `/bibliothek/<id>/bearbeiten`; `?s=edit` is an artboard state, not a route.

## Staging

A check runs against staging with `BASE_URL=https://staging.compies.christried.me` and the staging project's „Protection Bypass for Automation“ secret in `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel → the project → Settings → Deployment Protection). `open()` then visits `/api/health` once per profile with the bypass query, which sets Vercel's bypass cookie, and signs in through the dev route as on `pnpm dev`; the secret reaches staging only, never a header on every request. So 390 px on staging, which Claude in Chrome cannot show (retro 0.10), is one call:

```
BASE_URL=https://staging.compies.christried.me VERCEL_AUTOMATION_BYPASS_SECRET=… node scripts/browser/shots.mjs e/<slug>
```

The secret is a credential like every other: it lives in `.env` (gitignored; the scripts read it with `node --env-file=.env …`) or in the user's `!` command, never in a transcript, an issue or a report. Test data lands on the staging database and follows `docs/agents/delivery.md` § Issues, „Events on staging“. The Worker and `pnpm dev` stay off: a staging check talks to the deployed app alone. Untested until the first run with the secret; that run removes this sentence.

Limits:
- Headless Chrome never starts the browser's own image drag, so a native drag problem shows only on a real device. `nativeDrags` catches the ones it does start.
- It signs in through `/api/dev/sign-in`, which `pnpm dev` and the staging build carry (#247) and production never does: production needs the user. Staging sits behind Vercel Authentication, which § Staging passes; without the secret, a Player check on staging signs in with `https://staging.compies.christried.me/api/dev/sign-in?as=member&to=/e/<slug>` in Claude in Chrome (`claude --chrome`), at the desktop width only.
- `shots.mjs` without a selector captures the viewport: pass the selector of anything below the fold (e.g. `'section:has(> dl)'` for „So wird gespielt“).
- A `pnpm dev` started in the background outlives its stopped shell on Windows (TaskStop ends the shell, not nuxt, the Worker or workerd), and an agent may not `taskkill` a PID: start and stop the servers with `serve.mjs`.
- `Network.setBlockedURLs` doesn't block WebSockets in headless Chrome. To check a failed connect, point the page at a port nothing listens on: `REALTIME_URL=http://localhost:8788 pnpm dev` (the Worker runs on 8787, and the shell's value wins over `.env`).
- A check of a list or a wheel covers its edges (`CODING_STANDARDS.md` § Tests): `createGame` with a name of `GAME_NAME_MAX` characters, and a pool of one game. The dev library's names are all short („Alpha mvyc0op7“).
