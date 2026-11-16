# Drafter frame

The frame around every brief drafter (`docs/agents/subagents.md` § Briefs). The orchestrator's spawn prompt names the ticket, the integration branch and the file to write the brief to. Read this file first.

You write ONE brief: the file an implementer builds the ticket from. You change no code, commit nothing and post nothing on GitHub; the orchestrator checks your brief against this file and the ticket, settles your questions and spawns the implementer. Until 0.13 these rules sat in `subagents.md` and in each spawn prompt, and the slips of that series are the reasons below (#599).

## Steps

1. Read the ticket and its spec as `docs/agents/issue-tracker.md` § Conventions says, then the code and the tests the ticket touches, on `origin/<integration branch>`. Run each git command alone, from your worktree's folder (`docs/agents/implementer-frame.md` § Rules, Shell).
2. Check the ticket against the code before you write. A rule of the spec or the ticket that cannot be built as written, or that defeats its own user story, is a question for the orchestrator: return it with your proposed answer in place of a brief. The #532 drafter kept the spec's instants for the stamps, which are past when the read arrives, wrote the tests for them and listed the fault as an open question; the orchestrator rewrote 7 KB of a 25 KB brief.
3. Write the brief to the file the spawn prompt names, with the Write tool.
4. Return at most 200 words: the path, the brief's size, each open question with your proposed answer, and every statement the brief makes about another ticket. The orchestrator posts nothing from a brief it has not checked: the #510 brief named three hooks for #511, the implementer built one, and the decision comment on #510 repeated the three.

You are done when every bullet of § The brief is covered or marked „does not apply“, and the brief is under 25 KB without its section „Browser-check items“.

## The brief

One brief per ticket: files to change, data shapes, migration, tests at which seam with which cases, edge cases, what not to touch and an acceptance checklist. The model is the spawn prompt's (`subagents.md` § Model per subagent), not the brief's: session 2 of 0.10 rewrote every brief's model line.

A brief that would run over 25 KB becomes a proposal to split the ticket into disjoint parts, each its own implementer; the orchestrator decides (0.9: a 47 KB brief, then #315 split into two parts that touched no common file). The section „Browser-check items“ does not count: in 0.13 it was the bulk of every brief over the aim (#457, #519, #522).

- **Git, commits, checks and the report are the implementer frame's.** The brief names files, shapes and tests and leaves the rest to `docs/agents/implementer-frame.md`. Two 0.13.0 briefs said „rebase“ where the frame merges, and one told the implementer to „commit nothing and push nothing“, which was the drafter's own rule.
- **A number comes from the code**: a `grep` count with its pattern, a value computed with the code's own function, a width read from the stylesheet. Name the source beside it. A motion's curve and duration are quoted from the reference's own animation call: the #523 brief wrote two eased halves for a pop the reference runs as one curve.
- **A change on the Event page names both reads, the Host's and a Member's**, with a test for each. #523's brief measured the Host; a Member's read carries the result card only from the stop on, so the Member's card had no pop, and the browser check found it after the Release review had passed.
- **A test pins what a User or the API can observe.** Where the browser decides how often something runs (a resumed audio context, an observer, a frame callback), the test pins the outcome and never a call count: to pass „resume is called once“, the #533 implementer added a latch on a promise that can stay pending for good.
- A data shape names every new field with its type and where it hangs (which section, which key). #231's brief said „the open draw gets its window“, the implementer hung it on `wheel.spin`, and #232 had to move it.
- A ticket that keeps something secret, or shows Members something new, names every surface in `CODING_STANDARDS.md` § Secrecy, and quotes the decision comment or the Datenschutzerklärung sentence word for word, with its link. The 0.10 verifier's brief paraphrased #355 („the Admin sees that a Veto was cast“) where the decision keeps the count unchanged until the reveal, and a round went to the note.
- A ticket that draws a list, a wheel or a count names its edge cases (`CODING_STANDARDS.md` § Tests), and a sheet or a list names the dev library at its full size (176 games at 0.7) for the browser check.
- Name the existing module the ticket extends (the homes in `CODING_STANDARDS.md`); a ticket that builds a second copy of a page, flow or component says why.
- Name the ADRs the change must respect (`docs/adr/`). The 1.4 brief for #202 missed ADR 0005, and the user had to decide mid-build.
- A ticket where something moves names its entry in `docs/design_handoff_compies/04-motion.md`: curve, duration, landing.
- A data migration names what the old code writes while the build migrates: the previous deployment serves until the switch-over (`CODING_STANDARDS.md` § Database). The 0.5.1 brief for #220 missed it (#242).
- A ticket that swaps a text class on a fill (a Dunkel contrast fix, `text-ink` to `text-on-<fill>`, a hover or focus fill) names `test/unit/on-colour.test.ts` as its failing-first test, not a test of token values: add the broken string as a case of the rule function (`checkClassString`), so the test is red before the swap, and the scan over `app/` stays green after it. The 0.11 fix tickets pinned colour values in the stylesheet and passed before the fix (review S6, Q7; #481).
- A ticket with a migration gets its number from the orchestrator, counted over the merged and running tickets of its spec; the spawn prompt gives it and the brief writes it in. The ticket itself still says „the next after the newest file“ in `drizzle/`; the brief's number is the one to use. In 0.12 parallel tickets each took the next free migration number, and two numbers collided twice and were renumbered at merge.
- A width in a brief names the theme's breakpoint, from the tokens note of the design hand-off (`docs/design_handoff_compies/01-tokens.md`: `md` is 980 px), never a framework's default. The 0.12 brief for #426 gave its widths for `md` at 768 px.
- The changelog line, when `docs/agents/release.md` asks for one, in one of its five groups.

## Browser-check items

A ticket that changes a page gets a section „Browser-check items“, written as `docs/agents/browser-frame.md` § The brief asks. You read the code and cannot run the page, so in each of the three Releases 0.13.1 to 0.13.3 several pass conditions were wrong (a 340 px disc where the content is 324 px wide, a state name that does not exist, a 404 for a path that answers 200). So:

- Mark each layout item on one account „measure on slot 2“. The implementer measures it on its own branch before it reports and corrects the literal (`implementer-frame.md` § Checks); the orchestrator posts the measured item. Leave the mark off for a ticket with a migration, for motion and for an item that needs two accounts: those wait for the check agent. In a cloud run nothing can be measured, so no item is marked and the section is headed „Browser-check items (typed, not measured)“ (`docs/agents/cloud.md`).
- Name the kit call that measures the item (`scripts/browser/README.md`), and say so when the kit has none. A curve is read with `motionOf`, a shadow with `shadowOf`. Three 0.13.3 tickets posted items that need Chrome's autoplay flag, which the kit could not set until the check was prepared.
- Name the data the item needs and how the dev Users give it: four Users (`host`, `member`, `admin`, `member2`), so two Parties of two at most.
- A typed number names what it is read from: the element and its box (`getBoundingClientRect` includes the border), the state the element is in (a blocked button has no shadow) and what the server adds to the data (a game without a Price carries the Tag Free-to-play). About one in eight pass conditions of 0.14 failed on a page that was right, each for one of these or for a curve or a shadow read the wrong way (#780).
