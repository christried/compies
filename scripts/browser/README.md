# Browser checks

Headless Chrome driven over the DevTools protocol, one profile per account, so the Dev Host and the Dev Member are signed in side by side. For the browser check of `docs/agents/subagents.md` § Supervision when Claude in Chrome isn't there, and for every ticket with live behaviour or motion. No dependency: Node 24 and an installed Chrome (`CHROME_PATH` if it isn't in the usual place).

Needs `pnpm dev` and, for anything live, `pnpm dev:realtime` (README § Realtime). Profiles and screenshots go to `<tmp>/compies-browser/`.

| Command | What it does |
|---|---|
| `node scripts/browser/shots.mjs <path> [selector]` | Screenshots of a page (or one element) as Host and Member, at 1440 and 390 px. The path goes without its leading slash (`e/my-event`): Git Bash turns `/e/…` into a Windows path |
| `node scripts/browser/moves.mjs <slug>` | Host at 1440 px, Member at 390 px on one Event with Team choice open: moves by API and by dragging the avatar picture (mouse and long press), every animation both sides draw (curve, duration, who), the seats after it, native drags, page errors |
| `node scripts/browser/pool-preview.mjs` | Host at 1440 px, Member at 390 px on an Event the script creates (Host pick, Pool preview on, one game with notes): what a Member sees of a pool game (picture and name; no notes, no player count), and the Pool preview switched off and on while the Member's page stays open. One PASS or FAIL line per check, exit code 1 on any FAIL |

A new check imports two modules. `chrome.mjs` is the DevTools protocol and knows nothing about COMPIES: `launch(account)` (ports per account in `PORTS`), `tab.send` / `tab.evaluate`, `resize`, `shot(tab, name, selector)`, `sleep`. `kit.mjs` is what a COMPIES check needs on top: `open(tab, path, width, height, waitFor, { news })` (the dev sign-in), `api(tab, method, path, body)`, `drag(tab, from, to, { touch })`, `animations(tab)`, and the scenario helpers `createGame`, `createEvent`, `joinEvent`, `patchSettings` (throws when the answer lacks the change), `clickText`, `typeInto`, `switches`, `stepperNext`.

The game edit route is `/bibliothek/<id>/bearbeiten`; `?s=edit` is an artboard state, not a route.

Limits:
- Headless Chrome never starts the browser's own image drag, so a native drag problem shows only on a real device. `nativeDrags` catches the ones it does start.
- It signs in through `/api/dev/sign-in` only. Staging and production need Claude in Chrome (`claude --chrome`) or the user.
- `shots.mjs` without a selector captures the viewport: pass the selector of anything below the fold (e.g. `'section:has(> dl)'` for „So wird gespielt“).
- A `pnpm dev` started in the background outlives its stopped shell: stop the `nuxt dev` process listening on port 3000.
