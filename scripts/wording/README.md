# Wording harness

Shows every text of the app in its place and keeps the operator's verdict on each (spec #620). Developer tooling beside the browser scripts: nothing of it is in a build. Run from the repo root, on the dev database. The pictures hold dev Users' data: never commit or post them.

A sitting, in this order:

1. Start the dev server with the key tags, in the background (`run_in_background`):
   `COMPIES_SLOT=2 node scripts/browser/serve.mjs start walk --wording`
2. Record the walk, with the run name of step 1 (`--run`, default `walk`):
   `COMPIES_SLOT=2 node scripts/wording/walk.mjs [--run=<run>] [--only=<state>,…] [--section=<id>,…] [--width=390|1440]`
   It writes `recording.json`, `report.md` and `pictures/` to `<tmp>/compies-browser/wording/` (`<tmp>` is the system temp folder) and the log to `<tmp>/compies-browser/<run>/results.log`.
3. List the texts nothing uses, per group: `node scripts/wording/unused.mjs`. It writes `unused.json` to the same folder.
4. Open the review page: `node scripts/wording/review.mjs [--new] [--recording=<dir>] [--answers=<file>] [--port=<n>] [--no-open]`. It serves on `127.0.0.1:4747` and opens the browser. Every answer is written at once to `docs/reviews/wording_<date>.json`, so the same command resumes a sweep over days: the newest file that still has an open step. A new sweep, such as the one before a cut, starts with `--new` (today's file, whatever older ones hold; without it an older sweep with open steps, say unused groups nobody decided, resumes for good). The filter „neu seit dem letzten Durchgang“ compares with every answers file git tracks, the newer answer winning per key (#810; until 0.16.1 it was the newest file alone, and a sweep of a few texts made every other text new again), so commit a sweep's file when its sitting ends. It holds copy only. A mono element answered with an empty comment is „seen, no remark“: whoever applies the file reads it so.
5. Stop the dev server: `node scripts/browser/serve.mjs stop walk`. Only the walk needs it; the scan and the page read files.
6. Check the answers: `node scripts/wording/check-answers.mjs` (the newest file, or one named). It refuses a replacement the app would break on, names a text reworded since the sweep, and prints each of the user's remarks as a `COMMENT` line, a „passt“ with a comment included: in 0.18 the remarks on the look came that way and a session wrote its own script to find them (#833).

A sweep before a cut starts from a fresh walk (step 2) on the code being cut, so the pictures show that code and not an earlier one's (#810). The walk's report lists every new text that still has no picture, one `key  reason` line each (screen-reader only, covered by a layer each time, no code refers to it, or no state reached it, with the file and line of its first reference): a text there is a state still to write, not a text to answer blind.
