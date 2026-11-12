# Review 0.13.1 „Kleinkram“ (2026-11-11)

Release 0.13.1 „Kleinkram“, spec #502. Diff `origin/staging...spec/502-kleinkram` at 137c3c0 (44 files, 3078 insertions). Three `sonnet` reviewers: Standards, Spec, code quality and architecture. Reviewed in a cloud session without a browser.

Runs: Quality ran `test/nuxt/game-create-page.test.ts` (5 pass), eslint on 12 changed files and `knip --production` (clean). Standards ran `git`, `gh api` (read) and greps. Spec only read. The worktree has no `node_modules`, so no full test run, lint or typecheck happened in any report; CI is the judge.

Findings: 1 must fix, 9 should fix, 15 notes (25 entries). Each id appears once.

## Merge notes

- Merged as the brief lists them: Q3 + P5, Q2 + P6, Q1 + P7, Q7 + P8, S5 + Q12, S2 + Q6, S3 with the popover part of Q8, S8 with the test-header part of Q13.
- Merged further, because two reports name the same thing: S1 + Spec S2 (missing 0.13.1 deviation lines in the hand-off docs), S4 + P3 (fourth bullet, `text-on-primary`), Q11 + P3 (first bullet, close on scroll and resize), Q8 test hooks + P3 (third bullet, `data-crop-*`).
- Q8 and P3 are split across entries, one bullet per entry. Q13 is split: its test-header part is under S8, its screen-reader doubt stands alone. P3 keeps its second bullet as its own note.
- „Spec S2“ is the Spec report's own label for the `03-screens.md` gap, not a numbered finding. Spec S1 is P6. Spec S3 was dropped by the Spec report; it is in the appendix.
- Severity: the highest of the reports that name an entry.
- Reports' own result lines and their „checked“ sections are kept in the appendix, unchanged.

---

## Must fix

### Q10. must fix. Strg + Enter, or a second click, can save the game twice on the create page

Report: Quality.

`app/components/GameForm.vue:202-221` (`save`) and `app/pages/bibliothek/neu.vue:11-16` (`onSaved`).

```
    if (next) emit('savedAndNext', saved)
    else emit('saved', saved)
  }
  ...
  finally {
    saving.value = false
  }
```
```
async function onSaved(game: GameView) {
  toast(...)
  await refreshGameLibrary()          // two network refreshes (list and Tags)
  await navigateTo(`/bibliothek/${game.id}`)
}
```

`emit('saved')` does not wait for the handler. `finally` resets `saving` at once, while the create page is still waiting for `refreshGameLibrary()`. In that window the form is mounted, filled and no longer guarded. A second Strg + Enter (a double tap, or the key held: the new capture listener does not look at `event.repeat`) calls `save(false)` again, passes `blocked`/`saving`, and POSTs the same game again. `POST /api/games` has no duplicate check (`grep duplicate server/api/games/index.post.ts` finds nothing), so the Host gets two identical games. The click on „Spiel anlegen“ has the same window and is older; #465 makes it far easier to hit (a held key repeats about 30 times a second). The „noch eins“ path is safe: `onSavedAndNext` bumps `formRound` first, so the form is replaced at once.

Found by tracing the code, not run. Partial Q10 claimed something else (a held key after „noch eins“ hitting the fresh form); that is wrong, because Strg + Enter always calls `save(false)`, which emits `saved` and navigates.

Smallest fix: keep `saving` true after a successful save (reset it only in `catch`): the page navigates away, the sheet closes, and the „noch eins“ form is remounted, so nothing needs it reset. Add `if (event.repeat) return` after the `event.key` check in `onShortcut` as well. Test: with `holdPost` released and a handler that never unmounts the form (as `mountSuspended(GameForm)` alone does), two Strg + Enter presses one tick apart after the first `saved` give one POST.

---

## Should fix

### S2 + Q6. should fix. A comment in `GameForm.vue` says the opposite of the code

Reports: Standards S2 (should fix), Quality Q6 (note).

Where: `app/components/GameForm.vue:228-230`.

Standards (S2):
- `app/components/GameForm.vue:228-230`: „… It is a click on the form's save button: `save` itself saves nothing while the form is blocked or a save runs.“ `onShortcut` (:231-236) clicks nothing: `event.preventDefault(); event.stopPropagation(); void save(false)`. The guard is in `save` (:200 `if (blocked.value || saving.value) return`). Behaviour is right (spec story 28, 29); only the comment is wrong. The JSDoc at :192-195 („Strg + Enter (#465) goes through `save(false)` too“) is correct, so the file contradicts itself.
- Standard: baseline smell Mysterious Name / misleading comment (judgement call); `CLAUDE.md` § Standing rules wants rules stated where later sessions read them.

Quality (Q6): „It is a click on the form's save button: `save` itself saves nothing while the form is blocked or a save runs.“ The code calls `save(false)` directly. Reword.

Smallest fix: replace the sentence with „It calls `save(false)`, the path of „Spiel anlegen“; `save` itself saves nothing while the form is blocked or a save runs.“

### S5 + Q12. should fix. Five #458 assertions would still pass if the old wording came back

Reports: Standards S5 (should fix), Quality Q12 (note).

Standards (S5):
- Standard: § Tests, the ticket's point is that „2 bis 4“ is gone; a test that pins a change must fail without it. The edits turned `toContain('2 bis 4')` into `toContain('bis 4')`, and „2 bis 4“ contains „bis 4“.
- Evidence (corrected from the partial report, which listed six):
  - `test/nuxt/event-game-dialog.test.ts:147` `expect(dialog()!.textContent).toContain('bis 4')`
  - `test/nuxt/event-rounds.test.ts:897` `expect(opened()!.textContent).toContain('bis 4')`
  - `test/nuxt/lucky-wheel.test.ts:423` `expect(dialog()!.textContent).toContain('bis 4')`
  - `test/nuxt/how-we-play-card.test.ts:457` `expect(dialog().textContent).toContain('bis 4')`
  - `test/nuxt/library.test.ts:819` `expect(page.text()).toContain('bis 10')` (the game page's spelled-out count)
- Dropped from the list: `test/nuxt/library.test.ts:329` (`halo!.text()` is the compact form; the old „2–10“ does not contain „bis 10“, so it does pin the change). The `game-dialog.test.ts` pills (`toEqual(['bis 6', …])`) and `test/unit/describe-game.test.ts` (1, 2, 3 and exact counts, null) are exact, so the rule itself is pinned.

Quality (Q12): `toContain('bis 4')` / `toContain('bis 10')` replaced `'2 bis 4'` / `'2 bis 10'`: `test/nuxt/event-game-dialog.test.ts:147`, `event-rounds.test.ts:897`, `how-we-play-card.test.ts:457`, `lucky-wheel.test.ts:423`, `library.test.ts:819`. „2 bis 4“ contains „bis 4“, so these pass with the rule switched off. The rule itself is pinned by `describe-game.test.ts` (exact strings), the exact `pills()` equalities in `game-dialog.test.ts` and `library.test.ts:329` („2–10“ is gone), so nothing is unguarded; use `not.toContain('2 bis')` or an exact match to make the five say what they mean.

Smallest fix: add `expect(…).not.toContain('2 bis')` next to each of the five, or compare the pill text exactly as `game-dialog.test.ts` does. (Quality: use `not.toContain('2 bis')` or an exact match to make the five say what they mean.)

### S7. should fix. Two tests in `game-form.test.ts` have the same body, and one claims a behaviour it does not exercise

Report: Standards.

- Standard: § Tests (a test pins what changed; its name says what it pins). Smell: Duplicated Code.
- Evidence: `test/nuxt/game-form.test.ts:1255` „emits saved with the game for „Spiel anlegen“, never savedAndNext“ and `:1267` „saves as „Spiel anlegen“ on Enter in a field, not as the new button“ both set the name, call `page.get('form').trigger('submit')` and assert `emitted('saved')` plus `emitted('savedAndNext')` undefined. The second never presses Enter in a field (happy-dom does not turn Enter into an implicit submit), so its name promises the spec's „Enter in a field = Spiel anlegen“ and pins nothing beyond the first test.
- Fix: delete the second test, or rename it to what it does. The Strg + Enter tests (`:1295` ff.) already pin the keyboard path.

### P5 + Q3. should fix. The image field is locked only while the image uploads, not while the game saves: tile and upload can differ (story 17)

Reports: Spec P5 (should fix), Quality Q3 (should fix).

Where: `app/components/GameForm.vue:204-210` and `app/components/GameImageField.vue:188,224,346`.

Spec (P5):
- Story 17: „As a Host, I want what I see in the tile to be exactly what is uploaded.“ Decision 4 on #457: a save waits for the WebP of the tile.
- `app/components/GameForm.vue:266` `:uploading="uploadingImage"`; `uploadingImage` is true only inside `uploadImage` (line ~175-190), after the POST/PATCH of the game. `save()` sets `saving.value = true` (line 201), awaits `settle()` (205), then the POST (207-209), and only then `uploadImage` reads `image.value`. In `GameImageField.vue` the guards are `props.uploading` only (lines 188, 224; slider `:disabled="uploading"` line 346). A drag, an arrow key or a slider step during the POST starts a new make (`rest()` on pointer-up, `restSoon()` 300 ms after a key) that emits a new blob. Depending on which side of `uploadImage`'s read `image.value` it lands, the upload holds crop A while the tile shows crop B; on the edit page the Host then sees the saved A.
- The window is the POST's duration, so rare, but the field's own contract (decision 4, `settle()`) is built to rule exactly this out and does not for the second half of the save. No test covers it (`game-image-field.test.ts` tests a save during a make, not an input during the save).
- Smallest fix: lock the field while the form saves: pass `saving || uploadingImage` as a new prop (keep `uploading` for the status text „Lädt hoch …“), use it in `onPointerDown`, `onKeydown`, the slider `:disabled` and the „Bild wählen“ button's `busy`. One test: a drag during a held POST changes nothing.

Quality (Q3):
- `GameForm.vue:204-210` and `GameImageField.vue:188,224,346`. `settle()` returns once, before the POST. `uploadImage` reads `image.value` after the POST resolves, and passes `uploading` to the field only while `uploadingImage` is true (`:uploading="uploadingImage"`). During `settle()` and the POST the tile, the arrow keys and the slider all work. A drag released, or a key pressed, during the POST starts a new make (`restSoon` 300 ms, or `rest()`); the upload sends whichever WebP the form holds at the moment the POST returns, which may be the older one, and the tile then shows another crop. A drag that is still running when Strg + Enter is pressed continues the same way.
- Impact is small (the Host must move the picture inside the POST's round trip, and the form is gone right after), but it breaks the promise „what the tile shows is what is uploaded“ (#502 user story 17).
- Smallest fix: a `locked` prop on the field (`saving || uploadingImage`) used by `onPointerDown`, `onPointerMove`, `onKeydown` and the slider's `disabled`; keep `uploading` for the status text only. Test: with `holdPost` held, a drag and an arrow key make no further `toCardWebp` call.

### P6 + Q2. should fix. A failed make leaves its error banner after a later make succeeds

Reports: Spec P6 (should fix; Spec S1 of the partial report), Quality Q2 (should fix).

Where: `app/components/GameImageField.vue:121` (the only reset), `:149-155` (`makeNow` catch).

Spec (P6):
- Decision 6 on #457: „A failed re-make puts the tile back to the crop of the WebP it holds and shows the existing banner.“ Nothing says it stays.
- `GameImageField.vue:121` `failure.value = null` is the only reset, inside `onPick`. `makeNow` (lines 142-156) sets `failure.value = t('gameEdit.imageConvertFailed')` on failure (154) but its success branch (146-147: `lastMade = snapshot; emit(...)`) never clears it. After one failed make, the next drag or zoom that works still shows „Dein Browser kann das Bild nicht umwandeln. Probier’s mit Chrome oder Firefox.“ beside a tile that works.
- Smallest fix: `failure.value = null` in the success branch of `makeNow` (and one assertion in „puts the tile back to the crop of the held WebP when a new one cannot be made“, `game-image-crop.test.ts:506`, that a following successful make clears the banner).

Quality (Q2):
- `app/components/GameImageField.vue:149-155` sets `failure.value` in `makeNow`'s `catch`; the only `failure.value = null` is in `onPick` (`:121`). Sequence: drag, make fails, tile returns to `lastMade`, banner „Dein Browser kann das Bild nicht umwandeln“ shows; drag again, make succeeds, `emit` hands the form a valid WebP, and the banner stays until the next pick, saying the opposite of what the form now holds. The same goes for a failed pick followed by a successful drag of the old picture.
- Smallest fix: `failure.value = null` at the top of `makeNow`, or on its success path (`:146`). Test in `game-image-crop.test.ts`: after „puts the tile back … when a new one cannot be made“ (`:506-516`), `mockResolvedValue` and drag again, expect the banner text gone. The existing test stops at the failure.

### P7 + Q1. should fix. The create-page test mocks `toCardWebp` with the old return shape, so its image assertions are partly vacuous

Reports: Spec P7 (note), Quality Q1 (should fix).

Where: `test/nuxt/game-create-page.test.ts:115-116`.

Spec (P7):
- `test/nuxt/game-create-page.test.ts:116` `toCardWebp.mockResolvedValue(cardWebp)` where `cardWebp = new Blob(…)` (line 64). Since #457 `toCardWebp` returns `{ blob, width, height }` (`app/utils/image-resize.ts:26`), so the field emits `undefined` and holds a picture of `width: undefined`. The test „carries nothing into the next game“ asserts `expect(uploads).not.toHaveBeenCalled()` (line ~150), which would also hold if the image were wrongly kept. The first test „empties … the image included“ asserts `imagePreview(page).exists()` false, which is `picture`, not the blob, so it still discriminates.
- The upload path itself is tested with the right shape in `game-image-field.test.ts:77, 294` („settles before „Speichern und noch eins“ too, and reports it once the image is up“). Spec Testing Decision „empties the form“ is met.
- Smallest fix: `toCardWebp.mockResolvedValue({ blob: cardWebp, width: 2000, height: 1000 })` in `game-create-page.test.ts:116`, and in „carries nothing“ assert that the first save did upload (`uploads` called once) before `mockClear()`.

Quality (Q1):
- `test/nuxt/game-create-page.test.ts:115-116`:
  ```
      toCardWebp.mockReset()
      toCardWebp.mockResolvedValue(cardWebp)        // a bare Blob
  ```
  `toCardWebp` has returned `{ blob, width, height }` since #457 (`app/utils/image-resize.ts:26`). Traced: `pickJob` (`GameImageField.vue:96-108`) reads `made.blob` of a Blob, which is `undefined`, and emits `update:modelValue` with `undefined`; `made.width` and `.height` are `undefined`, so the tile gets `NaN%` placement (the preview `<img>` still renders, so the `imagePreview` assertions still pass). In `GameForm.uploadImage`, `if (!image.value) return game` (`:176`), so no PUT is ever made. `uploads` (`:38`) is not asserted in the first test at all, and `expect(uploads).not.toHaveBeenCalled()` at `:157` is true for the wrong reason. The test named „empties every field, the image included“ never holds an image Blob.
- Answer to your question: at page level, no, the upload is not tested. At form level it is: `game-image-field.test.ts` („settles before „Speichern und noch eins“ too, and reports it once the image is up“, uploads `size: 555`) uses the correct mock shape. That is why this is should fix and not must fix: a Blob that leaked into the next game is structurally prevented by the `:key` remount and by the other emptied-field assertions, but the test claims more than it checks.
- Smallest fix: `toCardWebp.mockResolvedValue({ blob: cardWebp, width: 2000, height: 1000 })`; in the first test assert `uploads` was called once with `{ type: 'image/webp', size: 1234 }` after the first save; keep the `not.toHaveBeenCalled()` of the second game (now meaningful).

### Q4. should fix. Crop state is a hand-rolled state machine inside the component, with a duplicated reset block, a variable used before its declaration and a dead ref

Report: Quality.

`GameImageField.vue`: `dropPicture` (`:69-79`) and the success branch of `pickJob` (`:101-107`) both repeat `crop = CENTRE_CROP; lastMade; requested; drag = null; dragging = false; clearSettleTimer(); generation++`. `let drag` and `const dragging` are declared at `:182-183` but assigned in functions at `:75-76,104-105` (works only because nothing runs before setup ends). Seven module-level `let`s plus `crop` and `pending` make a 376-line component whose races (Q2, Q3, Q7) can only be tested through DOM events and fake timers (the 689-line `game-image-crop.test.ts`). Also dead: `const tile = useTemplateRef<HTMLElement>('tile')` (`:26`) is never read.

Smallest fix: one `resetCrop()`, and delete the `tile` ref. The judo move: extract make, generation, settle and pending into `useCropMaker(toCardWebp)` returning `{ crop, requested, make, settle, reset }`; then Q2 and Q3 are plain unit tests of the composable, and the component keeps only pointer, key and render. Not a blocker for the Release.

### Q5. should fix (decide, then pin with a test). Zooming does not keep the visible centre

Report: Quality.

`shared/image.ts:104-106` (`zoomCrop`) keeps the offset as a share of the room. The window centre in source pixels is `W/2 − c·(W − fw)/2`, so for a 1600×1200 picture at c = 0.5, zoom 1.5 → 3 moves the centre from 667 to 533: the subject the Host just positioned slides sideways as the slider moves. Spec #502 and #516 say only „the offset's clamps follow the zoom“, so this is not a spec breach. Scaling the offset by `(W − fw)/(W − fw')` (the share that keeps the same centre, then clamped) anchors it. Decide and add a unit test either way; the current `zoomCrop` tests pin only the clamp and the zero-axis rule. Related and documented: an axis that loses its room reads 0 and does not come back (tested at `game-image-crop.test.ts:593-601`).

### Q11 + P3 (first bullet). should fix. Closing the hint steals the focus from the field the Host is typing in, and scrolls the page to the „?“ (browser check needed)

Reports: Quality Q11 (should fix), Spec P3 first bullet (note).

Where: `app/components/HintElement.vue:91-94,123-131` (Quality's references).

Quality (Q11):
```
function close() {
  open.value = false
  trigger.value?.$el.focus()
}
function onScroll(event: Event) { ... close() }
function onResize() { if (open.value) close() }
```
`GameNotesButton` does the same, but there the focus moved into the popover (its close button), so giving it back is right. `HintElement`'s popover „holds no control“ and the focus never moves in, so after the Host opens the hint and tabs on (nothing closes it on Tab), any scroll anywhere (the wheel, or a textarea growing in Notizen: the listener is on `window` in the capture phase, so it sees every element's scroll) or a resize closes it and calls `focus()` on the „?“ without `preventScroll`. The focus jumps away from the field mid-typing, the next keystroke goes to the button (Space reopens the hint), and the browser scrolls the „?“ at the top of the form into view, undoing the Host's scroll. These are the keyboard users the hint is for. It is documented behaviour (`02-components.md` „returns to it on every close“), so it is the design that needs the change.

Smallest fix: in `close()` restore focus only when it is on the trigger, inside the popover, or on `body` (`const active = document.activeElement; if (!active || active === document.body || active === el || popover.contains(active)) el.focus({ preventScroll: true })`), and put the same sentence into 02-components. Test in `hint-element.test.ts`: focus a text input, open the hint, dispatch `scroll` on `document`, expect `document.activeElement` is still the input. Not run in a browser: put the scenario on #517.

Spec (P3, first bullet):
- `app/components/HintElement.vue:60-86` closes also on a scroll outside the popover and on a window resize (spec: click, Esc, click outside). Prior art `GameNotesButton.vue`; written in `02-components.md` § HintElement; not in the #515/#465 decision comments.

---

## Notes

### S1 + Spec S2. note. The design hand-off docs carry no 0.13.1 deviation for the game form, the player count or the Vetos in the stepper's info sheet

Reports: Standards S1 (note; was should fix), Spec S2 (note; Spec's own label, not a numbered finding).

Standards (S1):
- Standard: no rule of `CODING_STANDARDS.md` asks for it. The practice is the „Deviation (0.13)“ lines in `docs/design_handoff_compies/` (02-components.md:871, :884, :897; 04-motion.md:120, :134), and the cloud notes name them as part of what wins. Spec #502's Testing and Implementation sections list the changelog and the Datenschutzerklärung, and say nothing about the hand-off docs.
- Evidence: the diff adds the two new component sections (02-components.md `HintElement`, `RangeSlider`) and one deviation line (11-event-seite.md:60, #453). Untouched: `## GameLibrary / GameForm` (02-components.md:1165-1174, still „form: `name, image, youtubeUrl, start, length=30, players, formats`“, no crop, no „Speichern und noch eins“, no „?“, no „(optional)“) and `## GameCard` (:847-858, the 0.12 deviation says nothing about the player count). 0.13.0 did not note its Start/Ende/Länge form change under GameForm either (only the Clip component at :884), so this is the existing practice, not a regression.
- Why note: nothing a User, a later ticket or a test depends on; the next Claude Design hand-off for the form will start from stale text.
- Fix (docs only, optional): one „Deviation (0.13.1, #456, #457, #465, #516)“ line under `GameLibrary / GameForm` and one „Deviation (0.13.1, #458)“ under `GameCard`.

Spec (S2):
- `03-screens.md` § 24 has no 0.13.1 note, line 312 „### 24 Spiel anlegen“: confirmed as a gap in the hand-off docs, but nothing in spec #502 or the tickets asks for it (the tickets name `02-components.md` and `11-event-seite.md`, both done). note, for the Standards axis.
- Fix: one „Deviation (0.13.1)“ bullet under § 24 for the button, the hint row and the crop tile.

### P1. note. Changelog line „erfahren die Zahl auch sonst nirgends“ and the pool size

Report: Spec (kept, note, not rated as the task says).

- Spec story 5: „As a Member who looks at what the app sends before the start, I want to find no number there“. `CHANGELOG.md` (first `### Geändert` block, last line): „Alle anderen lesen in „So wird gespielt“ „Vetos: Anzahl erst zum Start“ und erfahren die Zahl auch sonst nirgends.“
- Confirmed: `shared/settings.ts:151-163` `poolNeed`/`recommendedPoolSize` = Game count + allowance × team count + 1 Tie game; `server/utils/event-read.ts:130` `poolGamesOf` hands a Member the pool's games while `poolPreview` is on, so its size. A Host who follows the recommendation makes the number computable. The number itself is in no response (see the sweep below), so story 5 as written holds. Open with the user (#453 comment 1, decision block); only the changelog sentence overclaims.
- Smallest fix, if the user does not decide the pool question first: drop „und erfahren die Zahl auch sonst nirgends“, or write „und sehen die Zahl in keiner Antwort der App“.

### P2. note. Roadmap and spec still carry what the decisions replaced

Report: Spec (kept, note, no finding against the code).

- `docs/roadmap.md:307`: „nothing happens while „Speichern“ is disabled“ (also spec story 28, #465 body). Shipped, decision 1 on #465: `app/components/GameForm.vue:233-238` `onShortcut` → `void save(false)`, and `save` (line 197-198) sets `attempted.value = true` before `if (blocked.value || saving.value) return`, so a blocked Strg + Enter shows the field errors and posts nothing.
- `docs/roadmap.md:304` and spec story 9 say „beside „Speichern““; the create page's primary button is `t('library.create')` = „Spiel anlegen“ (`GameForm.vue:~408`, decision 1 on #456). The new button is `v-if="saveAndNext && !game"` (line 417).
- The decisions win, so no finding. Because the cloud notes say the roadmap wins, amend lines 304 and 307 at the cut, or carry both into #518 (already on its list).
- Also shipped differently from the spec's wording „at the form's top right“: a right-aligned row above the grid (`GameForm.vue:246-251`), decision 2 on #465.

### P3 (second bullet). note. HintElement props `size` and `label` have no caller

Report: Spec. The other three bullets of P3 are under S4 + P3, Q8 + P3 and Q11 + P3.

- `HintElement.vue` props `size` and `label` have no caller (`GameForm.vue:250` passes only `text`): Speculative Generality, for the Standards axis. The spec calls for „an accessible name“, so `label` is defensible.

### P4. note. Test coverage gaps against the criteria

Report: Spec (kept, corrected, note).

- #516 „takes the arrow keys“: `test/nuxt/range-slider.test.ts` „takes the keyboard natively: no tabindex on the input“ is the only keyboard test; no key is fired (jsdom cannot move a native range). Left to #517.
- #456 „absent … in the stepper's sheet“: tested at the form (`game-form.test.ts` „is absent where the form is not asked for it, as in the stepper's sheet“), not through `StepPool`. The code is right: `app/components/stepper/StepPool.vue:176` is `<GameForm @saved="onSaved" />`. Optional: one `expect(button 'Speichern und noch eins').toBeUndefined()` in the new sheet test of `test/nuxt/event-stepper-pools.test.ts` (added at line ~496 for #465).
- #458 „the player filter's tests pass unchanged“: confirmed by the file list (no filter test is in the diff; only `test/nuxt/filter-select.test.ts` exists and is untouched).
- Corrected: the partial report counted the Meta case as covered „from any field“. `game-form.test.ts` has „saves from the name with Meta + Enter“ only; Ctrl + Enter is tested from the name, Notizen, „von“ and the Tag field. The spec's Testing Decision names „⌘ + Enter“ as well as Strg; Meta from a second field is a cheap addition, not a gap in the code (one capture listener, `event.ctrlKey || event.metaKey`).

### S3 + Q8 (popover part). note. `HintElement` repeats the popover mechanics of `GameNotesButton`

Reports: Standards S3 (note), Quality Q8 popover bullet (note).

Standards (S3):
- Standard: `CODING_STANDARDS.md` § One home, last paragraph: „A second page, flow or component that does what an existing one does needs its reason in the PR description. Without one, the review asks for the existing module to grow instead.“ Smell: Duplicated Code.
- Evidence: `app/components/HintElement.vue:27-92` against `app/components/GameNotesButton.vue:34-81`:
  - `place()` (`HintElement.vue:27-37`, `GameNotesButton.vue:34-44`) is the same body (`placeNotePopover({ cell, size, viewport })`)
  - `close()` (`:39-42` / `:46-49`) is the same (`open = false; trigger.$el.focus()`)
  - `onDocumentPointerDown` (`:62-67` / `:56-61`) has the same `popover.contains(target) || trigger.$el.contains(target)` test
  - `onScroll` (`:71-75` / `:65-69`) has the same „inside the popover is its own“ test
  - the `onMounted`/`onBeforeUnmount` pairs (`:81-92` / `:74-81`) register `pointerdown` and `scroll` the same way (capture, passive)
- The header comment (`HintElement.vue:5-9`) gives a reason for a new look (no sheet, short text); that is not a reason for a second copy of the dismissal logic.
- Why note: both copies are correct and tested; the spec says „Own build“. The release PR description is where § One home wants the reason.
- Fix: say in the PR description why there is no shared piece, or extract `usePlacedPopover({ trigger, popover, open })` (place, outside press, scroll close, listeners) used by both; Esc and resize stay `HintElement`'s own.

Quality (Q8, popover bullet):
- `HintElement.vue` and `GameNotesButton.vue` each carry outside-press, scroll-capture, resize and focus-back code around `placeNotePopover` (see Q11: they already diverge). A third popover should extract `usePopover`.

### S4 + P3 (fourth bullet). note. The `RangeSlider` thumb's `text-on-primary` is a no-op that only the colour scan needs, and nothing says so

Reports: Standards S4 (note), Spec P3 fourth bullet (note).

Standards (S4):
- `app/components/RangeSlider.vue:171`: `[&::-webkit-slider-thumb]:bg-primary … [&::-webkit-slider-thumb]:text-on-primary … [&::-moz-range-thumb]:bg-primary … [&::-moz-range-thumb]:text-on-primary`. A thumb has no text.
- Why it is there: `test/unit/on-colour.ts:15` treats every variant outside `CONTEXT_VARIANT` as a state („a false alarm costs one edit, a silent pass a review“) and `:47` says rule b „fails a state fill with no text at all“; `:67` computes `stateful`. `[&::…]:bg-primary` is therefore a state fill and needs its text partner. The partial report ran `checkClassString` on the string and got two rule-b findings without the partner and none with it. I could not rerun it here (no `node_modules`); I confirmed the three source lines.
- Recommendation: keep the class. An exemption in the scan would also let a real `[&::before]:bg-primary` with dark text through.
- Fix: one comment so the next cleaner does not delete it and break CI. A Vue template comment above the `<input>` works (the class string itself cannot carry one): „The thumbs carry `text-on-primary` only for test/unit/on-colour.ts (rule b); a thumb has no text.“

Spec (P3, fourth bullet):
- `app/components/RangeSlider.vue` thumb classes `[&::-webkit-slider-thumb]:text-on-primary` / `[&::-moz-range-thumb]:text-on-primary` exist only to satisfy `test/unit/on-colour.test.ts` (question for the review on #516).

### S6. note. `RangeSlider` documents its break from the common rule on disabled only in passing

Report: Standards.

- `docs/design_handoff_compies/02-components.md:10` (common rules): „Disabled = `aria-disabled="true"` + visible reason.“ The RangeSlider section (:241) says „disabled (the native attribute, muted to 60 % opacity; the caller says why)“. A native `disabled` is right for a range input (`aria-disabled` would still let the thumb move), and the caller does say why (`GameImageField.vue:346` `:disabled="uploading"` with the „Lädt hoch …“ status at :350-354).
- Fix: in that bullet say „Deviation from the common rule: native `disabled`, since `aria-disabled` would still move the thumb“.

### S8 + Q13 (test header). note. Two stale or dangling comments in the new tests

Reports: Standards S8 (note), Quality Q13 test-header bullet (note).

Standards (S8):
- `test/nuxt/hint-element.test.ts:9`: „It is placed nowhere yet (#465 puts it on the game form).“ At this tip the game form uses it (`GameForm.vue:251`, tested in `game-form.test.ts` „the hint (#465)“). Drop the sentence.
- `test/unit/image-resize.test.ts:216`: „The orchestrator's rule (brief § 8.1): a zoom change goes through zoomCrop …“. The brief is not in the repo, so a later session cannot read it (`CLAUDE.md` § Standing rules: cloud sessions see just what is committed). Say the rule itself („a zoom change goes through `zoomCrop`, so an axis without room at the new zoom reads 0“, already in `shared/image.ts` `zoomCrop`'s JSDoc) and drop the pointer.

Quality (Q13, test header):
- `test/nuxt/hint-element.test.ts:9`: „It is placed nowhere yet (#465 puts it on the game form)“ is no longer true (`GameForm.vue` renders it).

### S9. note. A real 350 ms sleep where the file otherwise uses fake timers

Report: Standards.

- `test/nuxt/game-image-crop.test.ts:544` `const wait = (ms: number) => new Promise(done => setTimeout(done, ms))` and `:651` `await wait(350)` (the zoom-failure test) against `CROP_SETTLE_MS = 300` (`GameImageField.vue:22`). Every other timing test in the file uses `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` and `advanceTimersByTimeAsync(300)`. The real sleep is order-safe (the settle timer is armed first), so it is not flaky, but it adds 350 ms and is the one place that hard-codes a margin over the constant.
- Fix: use the fake-timer pattern of the neighbouring tests.

### Q7 + P8. note. `GameImageField` can be stuck in a drag if `setPointerCapture` throws and the pointer is released outside the tile

Reports: Quality Q7 (note), Spec P8 (note).

Quality (Q7):
- `GameImageField.vue:192-199`. `drag` is set before the capture call; the `catch` is empty. If the pointer has already gone inactive no `pointerup` arrives, and `onPointerDown`'s `|| drag` guard ignores every later press (any pointer id) until a pick or unmount. A pointerdown always comes from an active pointer, so a Host will hardly meet this; the test at `game-image-crop.test.ts:261` only shows that a drag still works when a `pointerup` follows.
- Fix: set `drag` and `dragging` after the `try`, or reset them in the `catch`.

Spec (P8):
- `GameImageField.vue:185-200` `onPointerDown` sets `drag` and `dragging` before `setPointerCapture`, and swallows its failure (195-199); `drag` is cleared only by `endDrag` (pointerup, pointercancel, lostpointercapture on the tile). Without capture a release outside the tile never reaches it. Then `|| drag` (188) refuses every later pointerdown, and a later move with the same pointer id keeps panning. The test „still drags when the browser refuses to capture the pointer“ covers the in-tile case only. `setPointerCapture` throws only for an inactive pointer, so rare. Not a story failure.
- Fix, if wanted: in the catch, listen once for `pointerup` on `window` to call `endDrag`, or clear `drag` when a `pointermove` arrives with `event.buttons === 0`.

### Q8 (dead branch). note. A watch with no production caller

Report: Quality.

- `watch(() => props.modelValue …)` → `dropPicture` (`GameImageField.vue:89-91`) has no production caller: `GameForm` never assigns `image` (`grep 'image.value =' GameForm.vue` finds nothing) and the create page re-keys the form. It is reachable only from the test „is emptied when the parent removes the image“. Keep it with a comment saying so, or delete both.

### Q8 (test hooks; eslint-disable lines) + P3 (third bullet). note. Test hooks ship in production

Reports: Quality Q8 (note), Spec P3 third bullet (note).

Quality (Q8):
- Correction to the partial: `data-crop-x`, `data-crop-y`, `data-crop-zoom` (`GameImageField.vue:285-287`) are read by most of `game-image-crop.test.ts` (`tile().dataset.cropX`), not replaceable by the `<img>` style without rewriting those tests. They ship to production as a test hook; say so in a comment.
- `eslint-disable-next-line vuejs-accessibility/no-static-element-interactions` at `GameImageField.vue:276` and `GameForm.vue:240`: both carry a reason; `eslint.config.mjs` is **not** in this diff (no change), so nothing to review there beyond these two disables.

Spec (P3, third bullet):
- `app/components/GameImageField.vue:285-287` ships `data-crop-x/-y/-zoom` in production (decision 3 on #457, for #517).

### Q9. note. The compact count is worded two ways for the same text

Report: Quality.

- `app/utils/describe-game.ts:12,31`. `if (leftOut) playersCompact = players` makes min 2, max 10 compact „bis 10“, while max 10 alone gives „10“ (`test/unit/describe-game.test.ts`: `[2,10,'bis 10','bis 10']` against `[null,10,'bis 10','10']`). Two cards for „2 bis 10“ and „bis 10“ read differently. Normalising `min` to `null` and letting the existing branches word both would delete the override line; the #458 text does not constrain the compact form, so decide which reading wins.

### Q13 (screen reader). note. A screen-reader doubt about the hint inside a sheet

Report: Quality (the test-header part is under S8 + Q13).

- The popover is teleported to `body`, outside the `aria-modal` sheet (`AppSheet`) that holds the game form in the stepper. Some screen readers do not read content outside a modal dialog, so the hint text may be unreadable there although the button says `aria-expanded`. Put a VoiceOver or NVDA pass on #517. Not a bug I can show from code.

---

## Spec report: story table

„met“ means met by the code at 137c3c0 as the orchestrator's decisions read; the part a browser must judge is named where it matters.

| Story | Verdict | Note |
|---|---|---|
| 1 Host hides from others | met | `settingsForViewer`, `poolsSection` |
| 2 row „Vetos: Anzahl erst zum Start“ | met | `summaryRows`, `HowWePlayCard`; the row is label „Vetos“, value „Anzahl erst zum Start“ (decision 4) |
| 3 visible from the start on, between Sessions, after the Finish | met | Phase `running`/`finished`/`archived`; unit table and integration (between Sessions); P-gap 1 in the sweep |
| 4 Host sees it at all times | met | `knows = viewer.isHost || …` |
| 5 no number in anything sent | met for the number; pool size hint open (P1) | sweep above |
| 6 Host pick: no row | met | `!eventHasWheel` → no row, marker false |
| 7 Bonus Veto entry as before | met | params `{ team, teamNames }` |
| 8 info sheet sentence for the Host | met, wording open | `info.…wheel.vetoHidden` under „So läuft’s“, `info-sections.ts`; decision 3 |
| 9 „Speichern und noch eins“ beside the save button | met, label deviation recorded | the primary button is „Spiel anlegen“ (decision 1 on #456), P2 |
| 10 saves, toast, empties, cursor in name | met | `neu.vue` re-keys, `focusName`, `onMounted` |
| 11 nothing carried over | met | fresh form per key; test „carries nothing“ (P7 for its image half) |
| 12 only on the create page | met | `v-if="saveAndNext && !game"`; `StepPool.vue:176`, `bearbeiten.vue` pass no prop |
| 13 failed save keeps the form | met | `save` catch; tests |
| 14 drag the picture in the tile | met in code and component tests; feel on a 120 px tile only in a browser | pointer events with capture; #517 A, B |
| 15 zoom from „fits“ up to 3× | met | `CROP_ZOOM_MAX = 3`, step 0.1, `zoomCrop` |
| 16 arrow keys move; slider takes keys | met (slider keys are the native input's, not fired in a test, P4) | `onKeydown`, `RangeSlider` without tabindex |
| 17 tile equals upload | met except P5 | `tilePlacement` and `coverCrop` share one rectangle; the save waits (`settle`); P5 for an input during the save; EXIF orientation of real files only in a browser (#517) |
| 18 picture always fills the tile | met | clamps in `coverCrop`, `clampCrop` |
| 19 existing image: pick again, no original kept | met | no control without a pick; object URL only in the browser |
| 20 untouched = centre crop | met | `toCardWebp(file)` default `CENTRE_CROP`; test „hands the form the pick as the centre crop“ |
| 21 label „(optional)“ | met | `gameEdit.players` |
| 22 1 or 2 left out, cards and dialog | met | `describeGame`; the card shows „bis 4“ for 2 to 4 (decision 1 on #458) |
| 23 3 and more as before | met | |
| 24 filter and stored numbers stay | met | no filter or parser file in the diff |
| 25 Strg + Enter from any field, Notizen too | met | capture listener on the form |
| 26 ⌘ + Enter on a Mac | met | `event.metaKey`; tested from the name only |
| 27 create, edit, the stepper's sheet | met | tests for all three |
| 28 nothing while disabled or saving | met by decision: a blocked press shows the errors, posts nothing (decision 1 on #465); open with the user | P2 |
| 29 not „noch eins“ | met | `save(false)` |
| 30 „?“ with „Strg + Enter speichert“ / „⌘ + Enter speichert“ | met; position is a row above the grid (decision 2); the look in Hell and Dunkel only in a browser | `HintElement`, `gameEdit.saveShortcut*` |
| 31 labelled button, Esc, outside, focus returns | met | `hint-element.test.ts`; screen-reader behaviour only in a browser |
| 32 no „?“ on a phone | met by the `(pointer: fine)` query; on a real phone only in a browser | `FINE_POINTER_QUERY`; `finePointer === true` (null before the browser answers) |

## Covered and not covered, per report

### Standards: Covered

Read in full at the tip: `CODING_STANDARDS.md`, `eslint.config.mjs`, `app/components/GameForm.vue`, `GameImageField.vue`, `HintElement.vue`, `RangeSlider.vue`, the diffs of `shared/image.ts`, `shared/settings.ts`, `shared/event.ts`, `server/utils/event-read.ts`, `app/utils/*` (image-resize, describe-game, settings-summary, info-sections, platform), `app/pages/bibliothek/neu.vue`, `HowWePlayCard.vue`, `EventStage.vue`, `useMediaQuery.ts`, `i18n/locales/de.json`, `CHANGELOG.md`, `CODING_STANDARDS.md`, `02-components.md`, `11-event-seite.md`; test bodies in full: `test/nuxt/hint-element.test.ts`, `range-slider.test.ts`, `game-image-crop.test.ts`, `game-create-page.test.ts`, `image-resize.test.ts`; the diffs of `game-form.test.ts`, `game-image-field.test.ts`, `test/unit/image-resize.test.ts`, `platform.test.ts`, `describe-game.test.ts`, `settings.test.ts`, `settings-summary.test.ts`, `info-sheet.test.ts`, `event-stepper-pools.test.ts`, `event-page.ts`, and the changed hunks of the six #458 assertion files and `library.test.ts`. Spec #502 (read via `gh api`) for the docs and changelog requirements. `GameNotesButton.vue` (head), `NotePopover.vue` (head), `test/unit/copy.test.ts` and `changelog-file.test.ts` (rules read, applied by hand to the new lines).

### Standards: Not covered

- Nothing was executed: `pnpm lint`, `typecheck`, `knip` and the tests (no `node_modules` here; CI is the judge). The `on-colour` scan (S4) was not re-run.
- `test/integration/veto-allowance-secrecy.test.ts`, `test/nuxt/event-game-dialog`, `event-rounds`, `lucky-wheel`, `how-we-play-card`, `library` bodies beyond the changed hunks: relied on the partial report's reading of the secrecy test.
- `docs/roadmap.md` § 0.13.1 was only grepped for hand-off requirements.
- Spec-axis questions (pick during a pending make, drag while uploading, story coverage) belong to the Spec reviewer; I read `GameImageField`'s race handling (`generation`, `pending`, `settle`) without finding a standards issue and did not judge its correctness.

### Spec: Covered

- All 32 stories against the code at the tip; the secrecy surface of #453 route by route; every Testing Decision against the test names and, for #453, #456, #458, the crop maths and the settle path, against the test bodies.
- The `CHANGELOG.md` lines: four (#456, #457 with #516, #465 under `### Neu`; #453 under `### Geändert`), none for #458 and #515, 0.13.0's untouched; each describes what the code does except the #453 sentence (P1).
- `docs/roadmap.md` § 0.13.1 against the shipped decisions (P2); `02-components.md` and `11-event-seite.md` notes.

### Spec: Not covered

- Browser behaviour: the drag and touch feel, `touch-action`, the focus ring, EXIF orientation of real files, the popover in Hell and Dunkel, the hint on a real phone (all on #517).
- Whether CI is green at 137c3c0 (a merge of `origin/staging` into the integration branch); no test file was executed here.
- The bodies of `hint-element.test.ts`, `range-slider.test.ts` and most of `game-image-crop.test.ts` were read by name, plus their key cases; the Standards and quality axes own their style.
- `eslint.config.mjs` and the two `eslint-disable` comments (GameForm form tag, the tile) belong to the Standards axis.

### Quality: Covered

Read fully at 137c3c0: `app/components/GameImageField.vue`, `GameForm.vue` (script and the changed template parts), `HintElement.vue`, `RangeSlider.vue`, `app/pages/bibliothek/neu.vue`, `app/utils/image-resize.ts`, `describe-game.ts`, `platform.ts`, `shared/image.ts`, the diffs of `shared/settings.ts`, `shared/event.ts`, `server/utils/event-read.ts`, `settings-summary.ts`, `info-sections.ts`, `HowWePlayCard.vue`, `EventStage.vue`, `de.json`, `useMediaQuery.ts`, `CHANGELOG.md`, `CODING_STANDARDS.md`, `02-components.md`, `11-event-seite.md`; `eslint.config.mjs` (unchanged in the diff); the tests `game-create-page`, `game-image-crop`, `game-image-field` (diff), `game-form` (diff), `hint-element`, `range-slider`, `image-resize` (nuxt and unit), `settings`, `settings-summary`, `platform`, `describe-game`, `how-we-play-card` (diff), `info-sheet` (diff), `event-stepper-pools` (diff), `library` (diff), `veto-allowance-secrecy` (lines 1-200); the small `toContain('bis …')` diffs in five other tests. Ran: `game-create-page.test.ts`, eslint on 12 changed files, `knip --production`.

### Quality: Not covered

- Any browser behaviour: iOS image callout on the tile `<img>` causing `pointercancel`, touch scrolling against `touch-none`, the focus and scroll behaviour of Q11, screen-reader reading of the popover inside the sheet (Q13), the look of the slider track and thumb in Hell and Dunkel.
- `pnpm typecheck` (the worktree has no `.nuxt`); I relied on CI for it.
- Full-suite and the other nuxt test files were not run; I did not reproduce Q2, Q3 or Q10 in a running test (I may not add test files), they are traced from the code.
- `useMediaQuery.ts` beyond the new constant; `StepPool.vue` and `bearbeiten.vue` beyond their `onSaved`; server routes other than the Event read; the Datenschutzerklärung wording for the new Veto-secrecy surface (that is the security and spec reviewers' axis).

---

## Appendix: other sections of the reports, unchanged

These sections contain no finding of their own that is not already above. They are kept as the reports wrote them.

### Standards: result line and „Checked and clean“

Result (as written): **no must fix.** Three should fix (a wrong comment, six weak assertions, a misnamed duplicate test) and six notes. The partial report's S1 to S6 were each checked at the tip: S2, S3, S4, S6 kept as written, S1 downgraded to a note, S5 corrected (five assertions, not six).

Checked and clean (at tip 137c3c0):

- **§ Secrecy / #453.** `settingsForViewer` (`shared/settings.ts:298-312`) is the one mask; its only caller is `poolsSection` (`server/utils/event-read.ts:140`); state and rules keep the true number. It masks by Phase and `isHost`, never by the number (0 is hidden like any other; unit test `settings.test.ts` „hides an allowance of 0“). `settings === null` and Host pick give `vetoAllowanceHidden: false`. Client consumers of `settings.vetoAllowance` are the Host's stepper (`StepMode`, `event-draft.ts`, never masked) and `summaryRows` (guarded by `vetoHidden`). `InfoSheet` is used only in `EventSetupWizard`. `test/integration/veto-allowance-secrecy.test.ts` matches the § Secrecy bullet (whole-JSON search, identical response for 0, 1, 9, Phases poll, date_set, between Sessions, Host in every Phase, feed, room messages, GET sweep). `CODING_STANDARDS.md` got the § One home row and the § Secrecy bullet with the right file names.
- **§ One home.** Crop maths is pure in `shared/image.ts` and used by the canvas (`app/utils/image-resize.ts:41`) and the tile (`GameImageField.vue:259`) from the same rectangle; the player count wording stays in `describeGame` (grep: no other `playersBetween`/`playersUpTo` consumer); `FINE_POINTER_QUERY` sits beside `MD_QUERY`; `isApplePlatform` is the only platform check; no new `.transaction(` or `for('update')`; no new Event write route.
- **Lint conventions.** `eslint.config.mjs` is unchanged by the diff. The two new `eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- <reason>` lines (`GameForm.vue:240`, `GameImageField.vue:276`) follow the file-wide convention (same rule, same `-- reason` form in `NoteDialog.vue:35`, `MoveToMenu.vue:73`, `NoteEditor.vue:101`, `HostDock.vue:157`, `AppSheet.vue:61`) and each carries a reason. No other disable added.
- **§ Tests.** Edges are covered where the rule asks: crop at wide, tall and exact-16:10 pictures, zoom 1, 1.5, 2, 3 and out-of-range, tile without size, 0 and one-sided player counts (1, 2, 3, null, exact counts), HintElement at the right edge, flipped below, capped scroll, two hints, Esc inside a Sheet, unmount while open. The hint tests assert behaviour through the DOM (role, aria, text, position), not internals. `test/nuxt/event-page.ts` `view()` gets `vetoAllowanceHidden`; the Event-read asserts use `toMatchObject` or fixtures. `toCardWebp` is mocked at the canvas seam only (`game-image-crop`, `game-create-page`, `game-image-field`), and `test/nuxt/image-resize.test.ts` pins the canvas rectangle itself with concrete numbers (200/0/1600/1000 and 600/250/800/500).
- **§ Copy.** UI words follow `GLOSSARY.md`; none of `RETIRED`'s words and no `COMPIES`/`Compibert` in `de.json` or the Unreleased lines; the strings the spec prescribes match word for word. `CHANGELOG.md` has four lines in the right groups (`Neu` before `Geändert`, parser order), German, linked; #458 and #515 correctly have none (spec). No new third party, so no Datenschutzerklärung change.
- **02-components.md** for `HintElement` and `RangeSlider` agrees with the code (sizes, `max-w-72`, `animate-enter`, `layer-popover`, `role="note"`, `aria-expanded`/`aria-controls`, 44 px input, tokens, no colour literal); index entries are in.
- **Knip.** Every new export has a production consumer (`CROP_ZOOM_*`, `zoomOf`, `cropRoom`, `CENTRE_CROP`, `isApplePlatform`, `FINE_POINTER_QUERY`); `CropRect` is used in its file.
- **§ Personal data.** New tests use made-up names and addresses only.
- **Unchecked suspicion from the partial report, resolved:** `AppButton` with `aria-disabled` on „Speichern und noch eins“: `save` returns early on `blocked || saving` (`GameForm.vue:200`), and `game-form.test.ts` „does not send twice while a save runs“ clicks it twice and sees one POST, so a click on the aria-disabled button is harmless.

### Spec: result line and the partial report's suspicions

Result (as written): **Result: no „must fix“.** No User Story is unmet against the recorded decisions, and the secrecy sweep of #453 found no surface that carries or reveals the Veto allowance to a Member before the start. Two „should fix“ (P5, P6), the rest notes.

The partial report's suspicions:

- **S1** = P6 (confirmed).
- **S2** (`03-screens.md` § 24 has no 0.13.1 note, line 312 „### 24 Spiel anlegen“): confirmed as a gap in the hand-off docs, merged above as „S1 + Spec S2“.
- **S3** dropped: `app/pages/e/[slug]/einstellungen.vue:23` `const view = computed(() => (data.value?.event.isHost ? data.value : null))` shows a Member the Construction page; `settings.patch.ts` is `changeEvent(event, { hostOnly: true, … })`. The Member never sees the editor with a masked allowance.

### Spec: #453 secrecy sweep (nobody had reviewed it)

Rule: the Veto allowance reaches no Member but the Host before the first Session starts. The code: `shared/settings.ts:298-311` `settingsForViewer` (Host or Phase `running`/`finished`/`archived` knows; a Lucky Wheel Member before gets `vetoAllowance: null` and `vetoAllowanceHidden: true`; 0 hidden like any number); applied only in `server/utils/event-read.ts:138-143` `poolsSection`. The Phase becomes `running` in the same transaction as the Session start (`server/api/e/[slug]/sessions/start.post.ts:24`) and nowhere goes back (the only other `phase` writes are `finish.ts:32` and the poll/date confirmation), so „from the first Session start“ and „Phase running“ are the same instant.

Every server route and derived value that carries or reveals the number, and whether a test calls it as a Player before the start (the test is `test/integration/veto-allowance-secrecy.test.ts`):

| Surface | Carries or reveals the number? | Player's view before the start | Called as Player before the start |
|---|---|---|---|
| `GET /api/e/:slug`, `settings.vetoAllowance` | the number | `null` + `vetoAllowanceHidden: true` | yes: Phase `poll` and `date_set`, Player and Stands member (`expectHidden`: whole-text regex `"vetoAllowance":\s*\d` and `numbersIn` search); bytes equal for 0, 1 and 9 („answers the Player the same …“, Player `one` in `date_set` only) |
| `GET /api/e/:slug`, `settingsFloors.vetoAllowance` (`event-read.ts:142`) | floor = Vetoes spent, derived from the number's use | `null` (`viewer.isHost ? … : null`) | yes (whole read searched; the 0/1/9 test) |
| `GET /api/e/:slug`, `setGame.poolWarning`, `setGame` (`stage-read.ts:117-121`) | derived: pool need uses the number | `null` for a Member (`viewer.isHost ? … : null`) | yes (whole read) |
| `GET /api/e/:slug`, `bonusVetoes` (`stage-read.ts:123, 295`) | counts per Party, Host only | `null` | yes |
| `GET /api/e/:slug`, `wheel.vetoes` (`left`, `partyLeft`; built from `vetoesLeftCounting`, which uses the allowance) | derived | `null` until a Session runs (`onWheel` needs `runningOf(sessions)`, `stage-read.ts:81-82, 122`), i.e. when the number is known anyway | yes before the start (null); after the start `expectKnown` |
| `GET /api/e/:slug`, `pool` | its size hints at the number while the Pool preview is on (`poolNeed`) | known and open with the user | **not tested, by decision**; see P1 |
| `GET /api/e/:slug`, `start` | start rejection does not use the allowance (`shared/session-state.ts:92-97`) | `null` for a Member | yes |
| `GET /api/e/:slug/activity` | no `veto_allowance` entry type exists; `bonus_veto_granted` params are `{ team, teamNames }` (`server/utils/vetoes.ts:37`, `shared/activity.ts:118`); the allowance change records nothing (`settings.patch.ts` records only `game_count_changed`, `team_size_changed`) | none | yes („keeps the number out of the feed“: type filter, `numbersIn`, no `vetoAllowance` string) |
| Room messages (`event.changed`, `activity.added`, …) | `event.changed` after a settings PATCH tells everybody that something changed, not what | none | yes (`notifier.messages` searched after PATCH 4, PATCH 7, a Bonus Veto) |
| `GET /api/e/:slug/ics`, `/share-image`, `/api/e`, `/api/invite/:invite`, `/api/me`, `/api/games*`, `/api/images/:key`, `/api/health`, `/api/internal/deploy-check` | none (grep of `server/` for `vetoAllowance`, `settingsFromRow`, `veto` in these handlers: no use of the number in a response) | none | yes: `sweepGets` over `getRoutes()` as the Player (`not.toMatch(/"vetoAllowance":\s*\d/)` and `numbersIn` for JSON); `games: []`, so the `:id` and `:key` routes are not requested at all |
| `POST …/draws/:drawId/veto` as a Player | could reveal `no_vetoes_left` (= left < 1) | the rejection order is `not_a_player`, `no_running_session`, … `no_vetoes_left` last (`shared/rounds.ts:208-214`), so before the start the answer is `no_running_session` whatever the number | **no** |
| `PATCH …/settings`, `POST /api/e`, `POST …/bonus-vetoes` | the number (`settings` in the response; `veto_allowance_range`, `veto_allowance_below_spent`) | Host only (`hostOnly: true`) | PATCH and bonus-veto are called as the Host only; a Player's refusal is not in this file |
| Client | `HowWePlayCard` (the only Member-side reader, `EventStage.vue:271-273`), `EventSettingsSummary` (create page, Host), `EventHostDialogs`, `StepMode` (Host wizard), `InfoSheet` (Host wizard only, `EventSetupWizard.vue`) | none | n/a |

Findings of the sweep:

- **No gap found.** The one masking point is `poolsSection`; every other consumer either is Host-only by its own `viewer.isHost` condition or sits behind a running Session.
- **Test gaps (note, all small):**
  1. The integration test has no case in Phase `finished` or `archived` (story 3 „after the Finish too“). The unit table `settings.test.ts` „hides the Veto allowance from a Member exactly until the first Session starts“ covers all six phases, so the rule is pinned, but not through the HTTP API.
  2. The 0/1/9 same-bytes test reads as Player `one` in `date_set` only, not in `poll` and not as the Stands member.
  3. No test calls `POST /draws/:id/veto` as a Player before the start to pin that the refusal does not depend on the number (the rule order does the work today; a reorder of `vetoRejection` would leak „no_vetoes_left“ for an allowance of 0 with no test failing).
  4. The sweep passes `games: []`, so the image and game routes are not exercised in it (they carry no Event settings; fine, but the sweep's „every GET route“ means the Event-level ones).
  5. A Pool-preview-on case that asserts the Player reads the pool and still no number is absent (deliberately, with P1).
- Secrecy standard `CODING_STANDARDS.md` § Secrecy: the new bullet and the `One home` row are there (diff lines +23, +44).
- Datenschutzerklärung: unchanged, as the spec says; nothing in 0.13.1 shows Members something new beyond „Anzahl erst zum Start“.

### Spec: Testing Decisions of the spec, seam and cases

| Testing Decision | Test at the named seam | Missing case |
|---|---|---|
| Event read as a Player (integration) | `test/integration/veto-allowance-secrecy.test.ts`: before the start no number and the marker; from the start on the number; Host always; Host pick unchanged; whole-response search; plus feed, room, GET sweep | Phase `finished`/`archived` through the API; veto POST as a Player (see sweep) |
| Settings summary (unit) | `test/unit/settings-summary.test.ts` „says in the Vetos row that the number comes at the start…“: hidden row, shown row, no row under Host pick | none |
| Game form (component) | `test/nuxt/game-form.test.ts`: Ctrl + Enter from name, Notizen, „von“, Tag field; Meta + Enter from the name; blocked and saving; „Speichern und noch eins“ saves and emits `savedAndNext`; `game-create-page.test.ts` empties every field and focuses the name; absent on edit and without the prop; `event-stepper-pools.test.ts` Strg + Enter in the sheet | Meta + Enter from Notizen and a number field; „noch eins“ absent in the sheet through `StepPool` (P4); „bis“ number field |
| Hint element (component, new) | `test/nuxt/hint-element.test.ts` (15 cases): click toggle, Esc, press outside, name and `aria-expanded`, focus returns, right-edge placement, flip, slot, scroll, resize, inside a sheet | none |
| Crop maths (unit) | `test/unit/image-resize.test.ts`: zoom 1 = centre crop for wide, tall and exact; clamps at every edge, at zoom 2 and with a wild offset; zoom 3 shows a third, from centre and to each side; `panCrop`, `nudgeCrop`, `cropRoom` | none |
| Image field (component) | `test/nuxt/game-image-crop.test.ts` (drag mouse and touch, keys, edges, no control without a file, name and instructions, slider) and `game-image-field.test.ts` (save waits for the make) | an input during a running save (P5); a later successful make clearing the banner (P6) |
| Game description (unit) | `test/unit/describe-game.test.ts` table: 1 and 2 left out, 3 kept, „von“ alone, „bis“ alone, both, exact counts | none (the `toContain('bis 4')` assertions in the Event-page tests would also hold for „2 bis 4“, but the dialog tests use `toBe('bis 6')` and the unit table pins the text) |
| In the browser (local) | #517 comments for all seven tickets exist (cited in the handoff) | n/a here |

### Quality: verdict line and „Checked and dropped, or corrected, from the partial“

Verdict (as written): the design is sound (one crop module in `shared/image.ts`, one mask function `settingsForViewer`, the form waits for the crop through `settle()`). One bug a Host can meet (Q10), four smaller bugs and test holes (Q1, Q2, Q3, Q11), and one decision to take (Q5). No file crosses 1000 lines because of this diff (`GameForm.vue` 436, `GameImageField.vue` 121 → 376; `game-form.test.ts` was already 1201 and is now 1511).

Checked and dropped, or corrected, from the partial:

- Q10 (held key): corrected, see Q10 above. The `settle()` microtask remark: sound. `job.finally(() => pending.delete(job))` is registered before `settle()`'s `Promise.all`, and the worst case is one extra loop, never a hang. The `ImageBitmap` not closed when `getContext` is null: older code, `getContext('2d')` on a fresh canvas does not return null in a browser that has `createImageBitmap`; dropped.
- #453 read path: re-checked `settingsForViewer` (`shared/settings.ts:298-311`), `poolsSection`, the client consumers (`HowWePlayCard`, `summaryRows`) and the only other consumers of `settings.vetoAllowance` in `app/` (Host-only stepper and `event-draft.ts`). The `getRoutes()` sweep discovers `server/api/**/*.get.ts` dynamically and throws on a new method-less route; the GET files under `server/api/e/[slug]` are `[slug].get.ts`, `activity`, `ics`, `share-image`; none touches the allowance (`grep vetoAllowance server realtime shared` finds only schema, event-state, event-read). No leak found. One transient: a browser that cached the old client while the new server answers reads `settings.vetoAllowance: null` and `vetoAllowanceHidden: true` it does not know, so `summaryRows` words „null pro Partei“ until the next reload (`app/utils/settings-summary.ts:72`); acceptable for the minutes of a deploy, say so in the Release notes only if a stale client matters.
- Pointer handling, crop maths (clamps at the use sites, tile percentages equal to the canvas rectangle), `settle()` termination, the capture-phase listener against the Tag field's Enter: sound as the partial said; I re-read them and found nothing new.

### Quality: test bodies

Do they assert what a Host can observe, and would they fail if the feature broke?

- `game-image-crop.test.ts` (read in full): strong. Asserts the tile's `<img>` percentages against `coverCrop`, the crop handed to `toCardWebp`, the number of makes, pointer capture released, the 300 ms rest (fake timers), result dropped when outrun, tile restored on failure. Would fail if drag, keys, zoom or the generation guard broke. Holes: Q2 (no failing-then-succeeding make), Q3 (nothing during a held save), Q5 (no centre-anchor pin).
- `game-image-field.test.ts` new block: strong. Holds `toCardWebp` open and proves the POST waits (`creates` not called) and that the uploaded size is the remade blob's (777, 555, 888); fails if `settle()` is removed. Misses Q3.
- `game-form.test.ts` new blocks: good. Exercise real `keydown` events with `defaultPrevented`, two presses give one POST, blocked shows the error, IME and Shift/Alt left alone, Mac and PC wording by user agent, no hint without a fine pointer. Holes: no `event.repeat` and no post-save double press (Q10); the hint tests do not look at focus.
- `hint-element.test.ts`: good on toggle, Esc inside a sheet, placement near edges (exact numbers), cap, scroll inside/outside, unmount. Asserts nothing about where the focus goes on a scroll or resize close (Q11).
- `range-slider.test.ts`: adequate for a thin wrapper (bounds, label `for`, `aria-valuetext`, input and forwarded change). „no tabindex“ is a weak assertion, but the keyboard is the browser's.
- `test/nuxt/image-resize.test.ts` and `test/unit/image-resize.test.ts`: good. The rectangle given to `drawImage` is compared with `coverCrop` and with literal numbers (centre `200,0,1600,1000`, zoom 2 `600,250,800,500`), zoom 1 equals no zoom for 75 offset pairs, clamps at every edge, NaN and out-of-range zoom. Would fail if the maths or the canvas call changed.
- `test/unit/settings.test.ts` (`settingsForViewer`), `settings-summary.test.ts`, `platform.test.ts`, `how-we-play-card.test.ts` (+ the Event-page one), `info-sheet.test.ts`, `describe-game.test.ts`: good; `settingsForViewer` runs all six phases for Host and Member, includes allowance 0, Host pick and not-set-up. `veto-allowance-secrecy.test.ts`: good (byte-identical Player read at allowances 0, 1, 9; number search over reads, feed, room and every GET route); the sweep passes `games: []`, so routes with `:id` and `:key` are skipped there, and none of them is an Event route.
- Q1 and Q12 above are the two test files that claim more than they check.
