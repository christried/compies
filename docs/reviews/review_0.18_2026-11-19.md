# Review 0.18 „Chat“ (2026-11-19)

Diff `71c905bd...c0b037a8`, `origin/staging` (which holds the cut of 0.17.0) to the tip of `spec/719-chat`, the integration branch of spec #719, after the merge of #764. The review ran on the integration branch (`docs/agents/release.md` § Review, walk-through, retro), in a cloud session, so nothing was run in a browser. Three `sonnet` reviewers: Standards, Spec, and code quality with architecture. The Skill tool refused the quality skill, so that reviewer followed its list and the architecture vocabulary.

## Result

- **No must-fix on any axis.**
- **Clean, per axis:**
  - Standards: no hard violation. Secrecy holds (`chat.added` and `chat.deleted` leave through `changeEvent(…, { broadcast: false })`, and their exact key sets are pinned), migration 0040 is sound, the Homes, the motion tokens, the changelog format, the copy and the test data hold.
  - Spec: the build does what the spec says and the tickets' criteria are met. Every line under `## [Unreleased]` is true of the tip (P6 names omissions, not false lines), and each Secrecy rule has a test.
  - Code quality: no must-fix. The server side (`server/utils/chat.ts`, the pure shared parsers, `judgeEmote`, the room's counters, the undo and the listeners) is sound, and no file of the diff crosses 1000 lines except the test file named in Q6.
- **Findings two axes share** (each keeps its own number and severity below):
  - P2 and Q2: the re-read after a long disconnect. When more than 50 Messages arrived while the socket was down, `loadFirst` (`ChatPanel.vue:51-60`) brings only the newest page, and the Messages between the held ones and that page are never shown. Q2 also names `ActivityFeed.vue:51-62` as having the same shape.
  - S5 and Q4: the copy of the Activity feed's paging in `ChatPanel.vue` (S5 item 1: `ChatPanel.vue:37-100` against `ActivityFeed.vue:32-100`; Q4: `ChatPanel.vue:36-90` against `ActivityFeed.vue:34-125`), and the 536-line file that holds it (S5: four reasons to change; Q4: five jobs).
  - S7 and Q5: the composer's line-break pattern, `ChatPanel.vue:164`, which is narrower than the shared `LINE_BREAK` (S7 cites `shared/message-text.ts:12`, Q5 cites `:41`).
  - S2 and P6 (b): the Emotes line of `CHANGELOG.md:7` promises a rise that a covered board, a hidden tab or a scrolled-away avatar does not show.
  - S4 and P6 (a): the „Der Chat“ line of `CHANGELOG.md:9` says nothing about links in Messages (#762).
  - S9 and Q11: the comment of `server/utils/clock.ts` (S9: its first sentence, that a change reads the clock once, is false; Q11 at `clock.ts:7`: the new sentence sits in the middle of a list).
  - P7 and Q11: the header of `ChatPanel.vue` (P7 at `:14-20`, Q11 at `:14-19`) calls the component read only and lists features that are built as later tickets.
  - S10 and Q10: the one-line wrapper `parseActivityQuery` in `server/domain/activity.ts:6-8` (S10 item 1, Q10), and the Chat's page limits named `ACTIVITY_PAGE_DEFAULT` and `ACTIVITY_PAGE_MAX` (S10 item 2, Q10).
- **What the orchestrator did with them** (2026-11-19, before the integration PR merged):
  - Fixed in #848, on the integration branch: Q1 (a delete that comes before its Message), P2 and Q2 for the Chat (the re-read after a long disconnect; the Activity feed keeps its shape), P3 (the page's Emote wait gets a margin over the room's two seconds), S7 (one line-break rule), S6 (the home rows), the stale comments of Q11, P7 and S9, and P5 (the Chat's read in the Hidden-wheel flow).
  - Corrected in `CHANGELOG.md`: S2 and P6 (b) (the Emotes line now says who sees the rise, and no longer „mit einem Klick“), S4 and P6 (a) (the Chat line names links).
  - Already a ticket: S1 is #775, the Datenschutzerklärung, part of the Release's local phase.
  - Not fixed, kept as review notes for the Release PR: P1 (the keyboard's way to „Rückgängig“ within 5 seconds), S3 (the send's error texts and a send that can never succeed), Q3 (a send in flight when the phone leaves the Chat view), Q4 and S5 (one composable for the two paged logs, and `ChatPanel`'s jobs), Q5 (the composer as a third length-limited field), Q6 (the page tests' harness), P4, Q7, Q8, Q9, Q10 and S10, S8.
  - For the operator: the four settled run decisions the Spec report lists as open points (a spin of the Lucky Wheel is no cover for the rise, own Messages under „Du“, leaving the phone's Chat view drops a draft, the phone's bottom sheet).


## Standards

Read: the whole diff `71c905bd...c0b037a8` outside `sound-candidates/`, `public/`, `drizzle/meta/` and `docs/design_handoff_compies/` (these were read only where a standard speaks: `credits.json` rows, the 0040 journal entry, the motion deviation notes of 04-motion). Order: `CHANGELOG.md`, `CODING_STANDARDS.md`, `shared/`, `server/` and the migration, `realtime/`, `app/utils`, `app/composables`, `app/components`, `i18n`, `scripts/`, then the tests. Sources: `CODING_STANDARDS.md` (every section), `GLOSSARY.md` (Chat and emotes), ADR 0001, 0013 (with its amendments of 2026-11-05 and 2026-11-16), 0015 and 0016, `CLAUDE.md` § Personal data, `docs/agents/release.md` § Changelog lines, and the smell baseline of `.claude/skills/code-review/SKILL.md` § 3 (judgement calls, labelled so). The settled decisions of the briefs (756 to 770, 667, 668, 778, 764) are not repeated as findings, except where a line of the Release notes or a standard says otherwise. Ran: `pnpm vitest run test/unit/changelog-file.test.ts test/unit/copy.test.ts test/unit/realtime-deploy-paths.test.ts test/unit/api-error.test.ts` (54 tests, green). No must-fix found.

### S1. Open Release gate: the Datenschutzerklärung does not name the Chat yet

- **Severity:** should-fix (a gate before the cut, already ticketed as #775, which is outside this cloud phase).
- **Where:** `i18n/locales/de.json` (the Datenschutz sections „Event“ and „Anmeldung“, line 1369 at the tip); `server/db/schema.ts` (`messages`), `shared/realtime.ts` (`chat.added`).
- **What is wrong:** the page lists what is stored per Event and what every Member sees („… Anzeigename, Profilbild, Stimmen und Anmerkungen ihrer Mitglieder sind für alle Mitglieder dieses Events sichtbar“). Since 0.18 a Member's free text is stored per Event with the writer's id and time, shown to every Member including the Stands, and a deleted Message keeps a line with who deleted it. None of this is on the page. The Emote is correctly not stored.
- **Rule:** `CODING_STANDARDS.md` § Secrecy: „A feature that shows Members something they didn't see before … is checked against every section of the Datenschutzerklärung that says who sees what … the user approves the new text (§ Copy).“
- **Fix:** keep #775 as a blocker of the cut: name the Messages (text, writer, time, deleted line, readable after the Finish, deleted for good on the writer's or the Host's delete, removed with the Event) and the links a Message may carry („Öffnest du einen Link aus einem Chat …“, as for Notes). The user approves the text.

### S2. The Emotes line promises more than the app draws

- **Severity:** should-fix.
- **Where:** `CHANGELOG.md:7` (the #668 line, written before #769 landed).
- **What is wrong:** „Alle, die das Event gerade offen haben, sehen es über deinem Avatar aufsteigen, im Team und auf der Tribüne.“ After #769 an Emote is drawn only where the board is seen: it is dropped with the Clip or the Tour up, with the tab hidden, with the sender's avatar outside the window, and on a phone's other views, which now include the Chat (`app/utils/emote-seen.ts`, `app/composables/useRisingEmotes.ts`). A Member reading the Chat on a phone has the Event open and sees nothing rise. The line was not revisited when #769 merged. „mit einem Klick“ is also two taps on a phone (#768: one button, then the pick from the sheet).
- **Rule:** `CODING_STANDARDS.md` § Copy: „Copy promises only what the app does today.“
- **Fix:** „Alle, die gerade das Spielbrett sehen, sehen es über deinem Avatar aufsteigen …“, and „tippst du ein Emote an“ for the click. Run `pnpm vitest run test/unit/changelog-file.test.ts`.

### S3. A refused send is shown outside the error table, and a send that can never succeed offers „Erneut senden“ for good

- **Severity:** should-fix.
- **Where:** `app/components/ChatPanel.vue:139` (`entry.limited = failure.status === 429 || failure.code === 'rate_limited'`) and `:457-473` (`t('error.rateLimited')` and the one button `chat.failed`).
- **What is wrong:** the Chat picks the 429 copy by hand and treats every other refusal alike. `wrong_phase` (the Host finishes the Event while a Member's Message is in flight or already failed, 409), an Event gone (404, 410) and a signed-out session (401) all leave „Nicht gesendet. Erneut senden“, which fails the same way each time, while the composer has already given way to the finished note. The reason is never shown.
- **Rule:** `CODING_STANDARDS.md` § One home per concern: „An API error shown to Users: `reasonKey` / `apiErrorKey` and their table in `app/utils/api-error.ts` (a screen's own words are a screen entry there, not an override at the call site …)“. The `useEventMutation` exemption is settled (brief 667: it refetches the Event), the table is not exempted.
- **Fix:** keep the failure code on the `Outgoing` entry and draw its text with `t(apiErrorKey(failure, 'chat.failed'))`, so the rate-limit line stops being a special case. Offer the resend button only for refusals that can pass later (429, network, 5xx); for `wrong_phase` and gone-Event show the reason and no button. Add the case to `chat-panel.test.ts` („a failed send after the Finish“).

### S4. The Release notes say nothing about links in Messages

- **Severity:** low.
- **Where:** `CHANGELOG.md:9` (the #667 line „Der Chat“).
- **What is wrong:** #762 turns every `http` and `https` address of a Message into a link that opens in a new tab. Its brief gave the line to #667 („No changelog line (the Chat's line is 0.18-7's)“), and #667's line does not carry it. A User-visible change has no line.
- **Rule:** `docs/agents/release.md` § Changelog lines: „A PR with a change Users can see adds its lines under `## [Unreleased]`.“
- **Fix:** add one sentence to the „Der Chat“ line: „Adressen mit http oder https werden zu Links, die in einem neuen Tab aufgehen.“

### S5. The Chat re-implements the Activity feed's log, a third and fourth copy sit next to it

- **Severity:** should-fix for the first, low for the rest (all Duplicated Code, a baseline judgement call; the first also touches a documented rule).
- **Where and what:**
  1. `app/components/ChatPanel.vue:37-100` copies `ActivityFeed.vue:32-100` line for line: `status`, `next`, `loadingOlder`, `atEnd`, `scrollToEnd`, `loadFirst`, `loadOlder` with its scroll-keeping, `retry`, the `room.state` re-read and the `active` watcher. The component's header says „It follows the Activity feed“. The component is also 536 lines for four reasons to change (the read, the composer with its outgoing lines, the delete with its undo toast, the groups with their name lines): Divergent Change.
  2. `app/components/EventChatView.vue:9-45` copies the keyboard-follow of `app/components/RichNotesEditor.vue:157-181` (`fitKeyboard`, `onFocus`/`onFocusIn`, `stopKeyboard`, the `visualViewport` guards, the 120 px test); its comment says „as RichNotesEditor does“.
  3. `app/components/EmoteBar.vue:76-92` and `:110-126` draw the same ring `<svg>` twice (the row's button and the phone's button); `tap()` finds them by `circle[stroke-dasharray]`.
- **Rule:** `CODING_STANDARDS.md` § One home per concern: „A second page, flow or component that does what an existing one does needs its reason in the PR description. Without one, the review asks for the existing module to grow instead.“ Baseline: Duplicated Code.
- **Fix:** 1: a composable `usePagedLog` (status, cursor, `loadFirst`, `loadOlder`, `retry`, the end-following scroll) that both components call, each with its own `merge` and `readPage`. 2: `useKeyboardFit(target, apply)`. 3: a four-line `EmoteRing` component or one `v-for`. Do 1 before a third paged log (Leute is planned in 11-event-seite) copies it again.

### S6. CODING_STANDARDS.md has no home rows for the Chat

- **Severity:** should-fix.
- **Where:** `CODING_STANDARDS.md` § One home per concern (the diff adds the Emote row and edits the two sound rows, none for the Chat).
- **What is wrong:** the Chat introduced five concerns a later ticket can copy: the text of a Message (`parseMessageText`, `MESSAGE_MAX`, `shared/message-text.ts`); a Message's wire shape and its stored row (`shared/chat.ts`, `messageOfRow`); links in a Message (`splitMessageText` on `notesLinkHref` and `NOTES_LINK_REL`); the paged read's query (`parsePageQuery`, shared with the feed); and the tab table with its place per surface (`TABS`, `useEventTabs`). Brief 762 already leaned on the table („`CODING_STANDARDS.md` § One home per concern names the notes' link address“), so the table is where agents look.
- **Rule:** `CODING_STANDARDS.md` § One home per concern: „Each concern below has one home. New code calls it; a second copy is a finding even when it works.“
- **Fix:** three rows: „The text of a Message, its limit and its line breaks“ (`shared/message-text.ts`; add the exported rule for S7); „The Chat: reading, writing, deleting“ (`server/utils/chat.ts`, `shared/chat.ts`, `ChatPanel`, `app/utils/chat.ts` for grouping, merging and links); „Which tabs exist, in which order, on which surface, and which count“ (`TABS` in `useEventTabs.ts`, #756, #778).

### S7. The composer has a second line-break rule

- **Severity:** low.
- **Where:** `app/components/ChatPanel.vue:164` (`el.value.replace(/\r\n|[\r\n]/g, ' ')`) against `shared/message-text.ts:12` (`LINE_BREAK`, which also takes VT, FF, NEL, U+2028 and U+2029).
- **What is wrong:** the file says the rule is shared „so the composer and the server enforce one rule“, but the field's pre-filter is its own regex, narrower than the shared one. A pasted U+2028 stays in the field until `send()` runs `parseMessageText`. No wrong result for the User (the send normalises), but it is a second copy of a rule both sides enforce.
- **Rule:** `CODING_STANDARDS.md` § One home per concern: „A rule both sides enforce … a pure function in `shared/`, called by the form and by the server parser.“
- **Fix:** export `normaliseMessageLineBreaks(raw)` from `shared/message-text.ts`, call it in `parseMessageText` and in `onInput`.

### S8. No test draws the longest Display name in the Chat's name line

- **Severity:** low.
- **Where:** `test/nuxt/chat-panel.test.ts` (members `Sanne`, `Larsi`, `Kitty`, lines 29-31); the name line truncates with `truncate` at `ChatPanel.vue:~330`.
- **What is wrong:** the list is tested at 0, 1 and 2 Messages and the longest text (`MESSAGE_MAX`), but not with a writer whose name is `DISPLAY_NAME_MAX` (32) long, with the Host pill, a team name and the time on the same line, which is where the phone's width runs out.
- **Rule:** `CODING_STANDARDS.md` § Tests: „A list, a wheel or a count is tested at its edges: 0, 1 and 2 items, and the longest name allowed.“
- **Fix:** one test with a 32-character name in a team with a long team name and the Host pill; assert the `b` carries `truncate` and the time stays in the row (no wrap).

### S9. The clock comment still says a change reads the clock once

- **Severity:** low.
- **Where:** `server/utils/clock.ts:3-7`, `server/utils/event-access.ts` (`beforeBody?.(user, useClock(event).now())`); `CODING_STANDARDS.md` § Database, last bullet.
- **What is wrong:** the head of the clock's comment still reads „A change of an Event reads the clock once, in `changeEvent` (`EventChange.now`, #259)“, and the line the diff appended contradicts it: a Message write reads the request's clock once for the limiter and again after the lock for `now`. The reason is sound (a limiter a test must move, before the lock), but the first sentence is now false.
- **Rule:** `CODING_STANDARDS.md` § Database: „A change of an Event takes its instants from `EventChange.now` and never calls `useClock` in a handler.“ (kept: the call sits in `changeEvent`, not in the handler).
- **Fix:** reword the lead to „reads the clock once for its instants (`EventChange.now`); a `beforeBody` limiter gets the request's clock before the lock (#758)“, and split the long appended sentence in two.

### S10. Names and a pass-through in the paged read (baseline, judgement calls)

- **Severity:** low.
- **Where and what:**
  1. `server/domain/activity.ts:6-8`: `parseActivityQuery` is now only `return parsePageQuery(query)` (Middle Man). Its test file `test/unit/activity-query.test.ts` pins `parseActivityQuery`, so the two names carry one rule.
  2. `server/domain/paging.ts:14-15`: the Chat's default and maximum page are `ACTIVITY_PAGE_DEFAULT` and `ACTIVITY_PAGE_MAX` (Mysterious Name for a Chat limit); the header comment says why they are shared.
  3. `server/utils/chat.ts:31`: the keyset subselect names the table as text (`from messages c`) next to `${messages.writtenAt}`; a rename of the table breaks it silently, at run time only.
  4. `app/composables/useEventTabs.ts:108` still returns `unread`, which no component reads any more (the count goes through `tabs` and `panelTabs`); `useRisingEmotes.rise` returns a boolean no caller reads (`EventPage.vue:103`). Speculative Generality, minor.
- **Rule:** baseline smells (Middle Man, Mysterious Name, Speculative Generality), no documented standard.
- **Fix:** 1 and 2: rename the constants to `PAGE_DEFAULT` and `PAGE_MAX` in `shared/paging.ts` or leave the comment as the reason; point `activity.get.ts` at `parsePageQuery` and delete the wrapper with its test moved to `paging.test.ts`. 3: use `sql.identifier` or alias `messages` through drizzle. 4: drop the return value of `unread` unless a test needs it.

### Checked and sound (Standards)

- **Secrecy (§ Secrecy, ADR 0013):** `chat.added` and `chat.deleted` leave through `changeEvent(…, { broadcast: false })`, so no `event.changed` tells the room that something happened; `hidden-wheel-room.test.ts` pins the exact key sets of both messages (`['deletedBy','id','serverTime','type','v']`, `['message','serverTime','type','v']`, a Message holds `at`, `id`, `text`, `writerId` only), and `/api/e/:slug/messages` is in the `EXPECTED_STATUS` table of `hidden-wheel-world.ts` (200, 404, 200). The read uses `loadEvent`, so the answers are the Event read's (401, 404, 410). An unknown, a foreign-Event and a malformed id answer alike, on the delete and the retry of a write. No Chat value derives from a Veto, a draw or the allowance.
- **ADR 0013 amendment of 2026-11-16:** the room's Emote rules (`judgeEmote`, two windows, counters in memory, sender from the token, a refused Emote not recorded) match the amendment word for word; the Message is Event state and goes through Nuxt, Postgres and `chat.added`. `realtime-deploy.yml` lists `shared/emote.ts` and `shared/chat.ts` and `shared/chat.ts` is a types-only leaf, so `realtime-deploy-paths.test.ts` stays green.
- **Database:** migration 0040 adds the table with the index its read filters and orders on (`event_id, written_at`) in the same file; the enum `message_deleter` belongs to one term; two CHECKs keep the deleted pair and the erased text in step (the text is gone from the row, not hidden); the journal and snapshot carry 0040; the table is new, so no data migration or old-code case; `writer_id` has no index by a stated reason, and no route deletes a User. A deleted Event cascades.
- **Homes:** request input goes through `asRecord` and a pure parser (`parseMessageText`, `parsePageQuery`); text length is `characterCount`; the time shown is `formatActivityTime` (berlin-time); the cue is `emoteCue` in `sound-cues.ts` (a row in `CUE_IDS`, `CUE_VOLUME`, `CUE_GROUPS`, `CUE_LENGTHS`, `CUE_BRIEF`, `MOMENT_OF`, `credits.json`, one recipe file `emote.mjs`), played only through the Event page's `cues.playNow` and before anything that draws; the Emote's cooldown is one number (`EMOTE_COOLDOWN_MS`) for the room, the bar and the ring; link addresses and `rel` come from `notesLinkHref` and `NOTES_LINK_REL`; the badge rule is one function for both layouts (`arrived`).
- **Motion (§ Motion, ADR 0015):** `chatRise`, `emoteRise` and `emoteRing` sit in `motion.ts`, take `--cp-dur-base`, `--cp-ease-out` and `--cp-ease-pop` through `motionMs`/`motionToken`, and have tests for the tokens, the duration and the reduced-motion twin (`chat-motion.test.ts`, `emote-motion.test.ts`, which also pins that no keyframe moves the picture). No GSAP outside the ceremony. The deviation notes in 04-motion name the picks the handoff leaves open.
- **Changelog (release.md § Changelog lines):** groups `### Neu` then `### Geändert`, plain German, links to the issues, one nesting level; `changelog-file.test.ts` is green. The #667, #765, #763, #764 and #778 lines match the code: the panel order is Chat, Aktivität, Tabelle with the Chat open first; the phone's tab sits between „Tabelle“ and „Aktivität“; own Messages do not count; the delete works after the Finish (`allowFinished`), the undo runs 5 s, the lines read „Gelöscht“ and „Vom Host gelöscht“; the Emote sound line matches `emoteCue` (own at full volume, others at 0.6, three sounds a second, the Ton gate). No ticket PR added a line itself (integration-branch rule); the second #667 line is its own commit, as the notes record.
- **Copy and Glossary:** the UI words are the glossary's (Chat, Nachricht, Emote, Tribüne, Host); the new keys are gender-neutral („Alle im Event lesen mit“); `error.messageInvalid`, `messageNotFound` and `messageNotYours` are in the table, `api-error.test.ts` (every code × screen) is green; the empty state words changed from „Session“ to „Event“ as the Glossary says the Chat belongs to the Event. The ADR 0016 contrast (a Message stores no name and no place, the name line is live) is on purpose and written in `ChatPanel.vue`.
- **Tests:** Members that a test renders come from `memberView()`; the integration files use the file-local fake users the other 58 files use; the Chat's list is tested at 0, 1, 2 and the longest text, a pasted line break, 500 emoji (graphemes), the IME case; the integration tests pin the finished-Event rule (`finished-readonly.test.ts` adds the write as `wrong_phase` and the delete as still taken); no whole-object `toEqual` on a read section that grows (the Event read is untouched).
- **Personal data (CLAUDE.md):** the diff holds only fixed fake names and `example.com` addresses in tests, nothing from a database or a log; the Chat and Emote text in `docs/` and the changelog contains no operator or User data.
- **Not findings:** the Chat does not poll while the socket is down (the feed does not either; ADR 0001's fallback is the Event read's), `TourStep.panelTab` is a `string` for the stated reason (`shared/` imports nothing of `app/`), the Chat's own `$fetch` instead of `useEventMutation` (brief 667).

## Spec

Verdict: the build does what the spec says, and the tickets' criteria are met. No must-fix found. Every line under `## [Unreleased]` of `CHANGELOG.md` is true of the tip (checked line by line below). Three should-fix findings (P1 to P3: an undo a keyboard user cannot reach in time, a silent hole in the Chat after a long disconnect, an Emote that the room can drop right after the ring ends) and four low ones.

### P1. „Rückgängig“ is a button, but a keyboard user cannot reach it within the 5 seconds

- **Severity:** should-fix (the criterion is met to the letter; the purpose of story 30 and the undo is not).
- **Where:** `app/components/ChatPanel.vue` (`requestDelete`: `scroller.value?.focus()`, `UNDO_MS = 5000`), `app/components/ToastStack.vue` (the action is a plain `button`), `app/app.vue:10-11` (`<ToastStack />` comes after `<NuxtPage />`), `app/composables/useToast.ts` (no pause on hover or focus).
- **What the spec asks:** #763: „The toast is announced politely, „Rückgängig“ is reachable by keyboard“; story 30 / DS Communication: delete „reachable by keyboard at all times“, so a Host who deletes by keyboard also needs the undo by keyboard; story 69: „a toast … for 5 seconds … so a slip costs me one click“.
- **What the code does:** after a keyboard activation the focus is moved to the log (a test pins this, `chat-panel.test.ts:821`). The toast sits at the end of the document, behind the whole page's tab order (header, panel, stage, tab bar, dock). Nothing stops the 5-second timer while the toast has focus or the pointer. A keyboard user who slipped has to tab through the page in under 5 seconds, so for them the undo does not exist; the call goes out when the toast ends. No test checks the tab order.
- **Fix:** either move the focus to the toast's „Rückgängig“ after a delete (the log was refocused only so the pressed control's removal does not drop the focus to `body`), or let `useToast` pause its timer while the toast has focus or hover (WCAG 2.2.1 Timing Adjustable) and start `flush` at the end of the pause. One component test: Tab once after the click lands on „Rückgängig“, or the call is not sent while it has focus.

### P2. After a long disconnect the re-read leaves a hole of Messages that cannot be loaded any more

- **Severity:** should-fix (a bug a User can meet on a computer that slept in a lively chat; story 17).
- **Where:** `app/components/ChatPanel.vue:51-60` (`loadFirst`), `:57` (`if (first) next.value = page.next`), `:262-264` (the re-read when the connection opens), `app/utils/chat.ts` (`mergeMessages`).
- **What the spec asks:** story 17: „I want the Chat to read again when it opens, so that no Message sent meanwhile is missing and no Message deleted meanwhile still shows its text“; § Further Notes accepts that an older page already loaded keeps a text that was erased, and nothing else.
- **What the code does:** the re-read is the first page (at most 50, default). It is merged into what is held, and `next` is kept from the first load. When more than 50 Messages arrived while the socket was down, the page holds only the newest 50 and none of the Messages held before. The result is held Messages 1..N, then a gap, then the newest 50. The cursor `next` still points before Message 1, so „Ältere laden“ never reaches the gap, and nothing says it is there. `test/nuxt/chat-panel.test.ts:218` covers a page that overlaps the held list only.
- **Fix:** in `loadFirst` after a first load, when the page has `next !== null` and none of its ids is held, replace `messages` by the page and set `next` to `page.next` (what is older is one „Ältere laden“ away, as on a fresh open). Add a case with a re-read of 50 new ids.

### P3. The page's two seconds equal the room's two seconds, so a tap at the end of the ring can be dropped without a trace

- **Severity:** should-fix (an Emote a User sends and nobody sees, and the sender's own picture and sound come from the room, so they see nothing either).
- **Where:** `app/components/EmoteBar.vue:27` (`setTimeout(…, EMOTE_COOLDOWN_MS)`), `shared/emote.ts:34` (`now - time < EMOTE_COOLDOWN_MS`), `realtime/src/room.ts:109-111`.
- **What the spec asks:** story 43: „I want to be able to send one Emote every two seconds, and the buttons to show the wait … so that a button that does nothing is explained“; § C: the page's wait is the ring from the tap, „the room's two seconds are the rule“.
- **What the code does:** the page re-enables the buttons exactly `EMOTE_COOLDOWN_MS` after the tap (a timer fires at or after that), and the room measures the gap between the two arrivals. When the first Emote was delayed on the way and the second was not, a Member who taps as soon as the ring ends (the natural thing to do) arrives less than 2000 ms after the first and is dropped silently (decision of #668: no error shown). The ring then runs again for a tap that did nothing. I derived this from the code; I did not reproduce it.
- **Fix:** keep the room's rule exact and give the page a margin, for example `EMOTE_COOLDOWN_MS + 150` in `EmoteBar` (a named constant in `shared/emote.ts` next to the other, with the ring still draining over 2 s), or let the room accept an Emote 100 ms early. Either keeps the numbers of story 43 and 45 true to a User.

### P4. The re-read on reconnect scrolls a reader to the end

- **Severity:** low.
- **Where:** `app/components/ChatPanel.vue:59` (`scrollToEnd()` at the end of every `loadFirst`).
- **What the spec asks:** story 17 only asks for the re-read. `chat.added` follows the end only `if (follow)` (`:251`), so the page already knows the rule.
- **What the code does:** a Member who scrolled up to read earlier Messages is thrown to the bottom when the connection reopens.
- **Fix:** `if (first || follow) scrollToEnd()` with `follow = atEnd()` taken before the merge.

### P5. The Hidden-wheel flow does not read the Chat's endpoint

- **Severity:** low (the read is structurally from the `messages` table, and `messages-read.test.ts:248` pins its keys).
- **Where:** `test/integration/hidden-wheel-room.test.ts:137-216`.
- **What the spec asks:** § Testing Decisions, Secrecy: the room's messages of a Hidden-wheel Event with Messages written carry no game facts, „the pattern of `hidden-wheel-room.test.ts` and `veto-allowance-secrecy.test.ts`: search the room's messages and every GET for what must not be there“.
- **What the code does:** the flow writes and deletes Messages and checks the room's `chat.added` and `chat.deleted` (exact keys), but no `GET /api/e/:slug/messages` is added to its searched GETs.
- **Fix:** one `GET` of the Chat as Player and as Host in that flow, put through `expectNoGameFacts` (the Message texts of the flow name no game).

### P6. Changelog: two omissions, no false line

- **Severity:** low.
- **Where:** `CHANGELOG.md` `## [Unreleased]`.
- **What is wrong:** (a) web addresses in a Message become links in a new tab (#762, user-visible): no line mentions it; the ticket said „no changelog line (the Chat's line is 0.18-7's)“ but the line of #667 does not say it. (b) The Emotes line says everybody „sehen es … aufsteigen“ and does not say that a covered board, a hidden tab or a scrolled-away avatar shows nothing (heard, not seen: stories 50, 51).
- **Fix at the cut:** add „Webadressen in Nachrichten sind Links und öffnen in einem neuen Tab.“ to the Chat line, and „Wo das Spielbrett verdeckt oder nicht zu sehen ist, hörst du das Emote nur.“ to the Emotes line.

### P7. Stale header comment in `ChatPanel.vue`

- **Severity:** low.
- **Where:** `app/components/ChatPanel.vue:14-20`.
- **What is wrong:** the header says „(#761 …), read only“ and lists the composer, links and the delete control as later tickets; all are in this file now. The next reader is misled about what the component does.
- **Fix:** reword the header to the component as built (reading, composer, links, delete with undo, the Host's control).

### Secrecy rules and the tests that pin them

| Rule (spec #719) | Pinned by | Gap |
|---|---|---|
| Read: Members only; 401, 404 for a User who is no Member, 410 for a former Member of a Deleted Event | `test/integration/messages-read.test.ts:82`, `:92` | none |
| Write: any Member, the Host and the Stands included, in every Phase until the Finish; 401, 404, 410; a finished Event answers `wrong_phase`, stores and sends nothing | `messages.test.ts:89,111,121`; `finished-readonly.test.ts` (row „write a Message“ and the #760 case, 409 `wrong_phase`) | none |
| Delete: the Host any, a Member their own, another's 403, unknown or foreign or malformed id 404 alike, 401 and 410, still allowed after the Finish, Host's own recorded as the writer | `messages-delete.test.ts:84,101,115,126,139,177,257`; `finished-readonly.test.ts` (#760 case); the explicit `STILL_TAKEN` list | none |
| What the room's messages carry: `chat.added` = `message` with `id, writerId, text, at` only, no name, colour, zone or game; `chat.deleted` = `id` and `deletedBy` only; no `event.changed` | `hidden-wheel-room.test.ts:207-216` (exact keys, Hidden wheel); `messages.test.ts:73`; `messages-delete.test.ts:166` | see P5 (the Chat's GET is not in the Hidden-wheel flow) |
| The Chat's read carries no name and no place | `messages-read.test.ts:248` | none |
| An id probe learns nothing (a foreign id answers like a non-uuid on write, like an unknown id on delete; a foreign `before` is `invalid_cursor`) | `messages.test.ts:216`; `messages-delete.test.ts:177`; `messages-read.test.ts:226` | none |
| A deleted Message keeps no text in the row, the answer, the room message, the feed or any later read; a retry after deletion answers the deleted variant, never the text | `messages-delete.test.ts:152,166`; `messages-read.test.ts:159,176`; `messages.test.ts:202`; `chat-panel.test.ts:532` | none |
| What a deleted Message still exposes through the API: its id, writer id, instant and who deleted it (the line's content, by spec); through the Worker: nothing (the room stores nothing, `chat.deleted` has no text, writer or instant) | `messages-delete.test.ts:152,166`; the check `messages_deleted_text_check` (`chat-messages-migration.test.ts:97`) | by spec: a page that missed `chat.deleted` and an older page already loaded keep the text until a reload (Further Notes); only the first-page case is tested (`chat-panel.test.ts:218`) |
| A write answers a deleted Message's id with the deleted variant even for the writer (the page never brings a text back) | `messages.test.ts:202`; `chat-panel.test.ts:532` | none |
| The Activity feed never shows a Message, a Message writes no Activity entry | `messages.test.ts:256` (feed as before); by construction (own table, own types) | none |
| A new Message makes no sound and no notification | `event-chat-composer.test.ts:198` (cue log unchanged, no `Notification`) | none |
| Emotes are not stored: no route, no table, nothing reaches Nuxt; the room keeps only in-memory counters, which a hibernation drops | `event-emotes.test.ts:340` (no Activity entry, no request); `realtime/test/emote.test.ts:226`; structurally `ClientMessage` is the only place `emote.send` exists | none |
| An Emote's sender is the token's user, never a field of the message; garbage, an unknown id and a binary frame pass nothing and do not close the socket | `realtime/test/emote.test.ts:195,169` | none |
| The two room rules (2 s per Member across sockets, 3 sounds a second, a refused Emote not recorded, two Events share nothing) | `test/unit/emote.test.ts`; `realtime/test/emote.test.ts:78,110,121,139,153,207` | see P3 |
| An Emote carries no place, game or Veto fact; `emote.sent` is `userId`, `emote`, `sound` | the type `RoomMessage` (`shared/realtime.ts`); `hidden-wheel-room.test.ts` lists `emote.sent` as a Worker type | none |
| The Emote files are requested by the Event's state, never by what was sent | `event-emote-cues.test.ts:218,225` | none |
| Emote cue: own at full volume, another's at 60 %, silent when the room's mark says so (own too), silent with Ton off, nothing when 2000 ms late | `test/unit/sound-cues.test.ts` (`emoteCue`); `event-emote-cues.test.ts:125,140,162,176,191` | none |
| An older Worker ignores `emote.send` without an answer and without closing the socket | `realtime/test/emote.test.ts:169`; `realtime/test/room.test.ts` (publish and clock after an Emote) | none |

### Rate limits and length rules

| Rule | Server | Page |
|---|---|---|
| Message: 5 in 10 s per User, `rate_limited`, retry and a request refused later count, a 429 adds no hit, the clock moves the window | `messages/index.post.ts` (`createRateLimiter({ limit: 5, windowMs: 10_000 })`, `beforeBody`); `messages.test.ts:162,176` | no limiter of its own; 429 shows `error.rateLimited` above the retry button and keeps the text (`chat-panel.test.ts:546`) |
| Message length: 500 graphemes after trimming, line breaks (also VT, FF, NEL, LS, PS) become spaces, empty refused, NUL refused | `shared/message-text.ts`, `messages.test.ts:136,149`; `message-text.test.ts` | the same function in `ChatPanel` (`sendable`), input cut at 500 graphemes, counter from 400, warning from 492 (`chat-panel.test.ts:613,636,650`) |
| Emote: 1 per 2 s per Member (across sockets) | `shared/emote.ts` `judgeEmote`, `realtime/src/room.ts` | the ring and `aria-disabled` for `EMOTE_COOLDOWN_MS` (`event-emotes.test.ts:198`); see P3 |
| Emote: at most 3 a second carry a sound, the fourth passes with `sound: false` | same, `realtime/test/emote.test.ts:121-168` | the cue is silent when `sound` is false (`event-emote-cues.test.ts:162`) |

### The Host's and a Member's read of every change on the Event page

| Change | Host | Member (Stands included) | Pinned by |
|---|---|---|---|
| Side panel tabs Chat, Aktivität, Tabelle, opens on Chat | same | same | `event-page-standings.test.ts` (Host page: `[Chat, Aktivität, Tabelle]`, Chat selected), `use-event-tabs.test.ts:46,64` |
| Composer, 500 characters, Enter | writes | writes | `chat-panel.test.ts:672` (Stands and Host), `event-chat-composer.test.ts:171` |
| Delete control | on every live Message, always visible, named by the writer or „Nachricht löschen“; deleting the own Message reads „Gelöscht“ | on own Messages only | `chat-panel.test.ts:1109-1183`, `:786`, `event-chat-composer.test.ts:162` |
| After the Finish | no composer, note, delete control stays | same | `chat-panel.test.ts:686,1050,1183` |
| Phone bar Event, Tabelle, Chat, Aktivität, count | same | same | `event-chat-phone.test.ts:107-190` |
| Phone Chat view | the Host's crown is not shown there (decision of #765) | n/a | `event-chat-phone.test.ts:227` |
| Counts on the panel's tabs | same rule | same | `event-panel-counts.test.ts`, `use-event-tabs.test.ts:220` |
| Tour's Aktivität step opens the Aktivität tab | the Tour does not start for a Host | Member only | `event-page-tour.test.ts` („the panel's tab (#766)“) |
| Emote bar on the board, none in the dock | same four buttons, dock unchanged | same | `event-emotes.test.ts:146` |
| Emote rise and cue | same | same | `event-emotes.test.ts:235,385`, `event-emote-cues.test.ts` |

### Tickets and acceptance criteria

Legend: met / typed (judged from code and tests; a cloud run measured nothing) / not met. „knip“ was run here and is clean for the tip; type check and lint wait for CI. The browser-check items of every ticket are on #776 (the Chat) and #777 (the Emotes), one comment per ticket; verified by heading.

| Ticket | Criterion | Result and pinning test |
|---|---|---|
| #756 | Bar and panel list the same tabs in the same order, panel opens on Aktivität | met at its merge, then replaced by #761/#765 by design; `use-event-tabs.test.ts:46` |
| #756 | A test pins each surface's order and the default tab and fails for a row with no place | met: `use-event-tabs.test.ts:272,282,289,298` (the last is a type-level case) |
| #756 | Aktivität count and `tab-activity` marker unchanged | met: `use-event-tabs.test.ts:87,99`, `event-chat-phone.test.ts:176` |
| #756 | knip, type check | knip clean here; type check typed |
| #756 | No changelog line | met |
| #757 | Migration test: table, Event cascade, index | met: `chat-messages-migration.test.ts:64,122,128` |
| #757 | A deleted row cannot hold its text | met: check `messages_deleted_text_check`, `:97` |
| #757 | `db:generate` writes nothing further; migration runs on the dev database | `db:generate` run here: nothing; the dev-database run is typed (no database in a cloud run) |
| #757 | knip, type check; no changelog | met |
| #758 | Integration tests: Member and Host write, one `chat.added`, no `event.changed`, 404, 410, `wrong_phase`, empty, 501, the sixth refused, clock moved | met: `messages.test.ts:73,89,121,136,162` |
| #758 | A retry stores one row, sends nothing, answers the first; another Member's or Event's id refused | met: `messages.test.ts:188-250` |
| #758 | Finished-readonly guard has the route as a row | met: `finished-readonly.test.ts` (row „write a Message“) |
| #758 | Text rule unit tests at 0, 500, 501 (emoji one), a line break, spaces | met: `message-text.test.ts` |
| #758 | Secrecy test on a Hidden-wheel Event with Messages | met: `hidden-wheel-room.test.ts:207`; see P5 |
| #758 | `room-listeners.test.ts` lists `chat.added` with a page listener | met (green here) |
| #758 | New error codes have status and text, `api-error.test.ts` passes | met (green here): `invalid_message` 400 |
| #758 | knip, type check; no changelog | met |
| #759 | Integration tests: newest first, cursor, last page `next` null, unknown `before`, bad `limit`, 404 and 410, another Member's Message | met: `messages-read.test.ts:82-247` |
| #759 | The feed's own tests pass unchanged | met: `activity-query.test.ts`, `activity.test.ts` are not in the diff |
| #759 | `handler-clock.test.ts` unchanged | met (green here) |
| #759 | The read carries no name and no place | met: `messages-read.test.ts:248` |
| #759 | knip, type check; no changelog | met |
| #760 | Integration tests: Host deletes, Member own, 403, text gone, one `chat.deleted`, 404, second delete the same and sends nothing | met: `messages-delete.test.ts:84-256` |
| #760 | `allowFinished`, `STILL_TAKEN`, header comment, a finished-Event test for Host and writer, writing stays refused | met: `finished-readonly.test.ts` (#760 case); `event-access.ts` comment |
| #760 | Host's own Message recorded as the writer | met: `messages-delete.test.ts:115` |
| #760 | 410 for a former Member | met: `messages-delete.test.ts:257` |
| #760 | `chat.deleted` in `room-listeners.test.ts` with a minimal listener | met (green here; the listener is `ChatPanel`'s) |
| #760 | Error codes with status and text | met: `message_not_found` 404, `not_your_message` 403 |
| #760 | knip, type check; no changelog | met |
| #761 | Component tests: first page, a Message twice shown once, „Ältere laden“, re-read on open, failed and retry, empty at 0, a list of 1 and 2, the longest text | met: `chat-panel.test.ts:171,180,198,218,233,272,287`; see P2 for the one case missing |
| #761 | Grouping as a pure function at 2 min ∓ 1 s, another writer between, a deleted Message in the group | met: `chat.test.ts:25,36,46` (119/120/121 s) |
| #761 | The name line follows a rename and a move without a new read, with `memberView()` | met: `chat-panel.test.ts:370` |
| #761 | Panel opens on „Chat“ from md up in the order Chat, Aktivität, Tabelle; phone untouched at that ticket | met: `use-event-tabs.test.ts:46,64`; `event-page-standings.test.ts` |
| #761 | A new Message rises `y 8→0`, fade in `--cp-dur-base`, opacity only under reduced motion, test asserts duration and that something animated | met: `chat-motion.test.ts:27,43`, `chat-panel.test.ts:412` |
| #761 | `room-listeners.test.ts` passes for `chat.added` | met |
| #761 | Texts corrected (`empty.chat.text` says Event) | met: `de.json` „Sag Hallo. Alle im Event lesen mit.“ |
| #761 | Browser-check items for #776 | met: comment of 2026-11-19 18:34 |
| #761 | knip, type check; no changelog | met |
| #667 | Component tests: sending, success, failure with the text kept and retry, `rate_limited`, Enter, counter at 80 % and 500, pasted break, empty not sent, Stands writes, none on a finished page | met: `chat-panel.test.ts:461-686` |
| #667 | The page makes the id, „Erneut senden“ sends the same id | met: `chat-panel.test.ts:510` |
| #667 | A Message of the writer appears once (answer and `chat.added` meet by id) | met: `chat-panel.test.ts:483,735` |
| #667 | No cue and no notification on a new Message | met: `event-chat-composer.test.ts:198` |
| #667 | Texts complete including the finished note and the failed-send line | met: `chat.finished`, `chat.failed`, `chat.remaining` |
| #667 | Browser-check items for #776 | met: comment of 20:45 |
| #667 | knip, type check | met / typed |
| #667 | Changelog under „Neu“ and „Geändert“ | met; both lines true of the tip (see P6 for what they leave out) |
| #762 | Splitter unit tests: start, middle, end, full stop or comma, brackets, two, `javascript:` and `ftp:`, a very long address | met: `chat.test.ts:145-196` |
| #762 | Component test: `target="_blank"`, `rel="noopener noreferrer"`, `<b>` as text | met: `chat-panel.test.ts:295,309` |
| #762 | `privacy-hosts.test.ts` unchanged | met: not in the diff, nothing is fetched |
| #762 | knip, type check; no changelog | met (see P6 (a)) |
| #763 | Control on the viewer's own Messages only, the line replaces the text, `chat.deleted` replaces, a re-read replaces, 0, 1, 2 Messages | met: `chat-panel.test.ts:786,921,959,983,1064` |
| #763 | Undo: gone at once, no call, „Rückgängig“ within 5 s sends nothing, toast end, ✕ and leaving each send once, other pages change only when answered | met: `:821,836,853-912` (4999 ms, 5000 ms, pagehide, unmount, eviction) |
| #763 | The toast is polite, „Rückgängig“ reachable by keyboard, two deletes keep their own undo | polite met (`:821`); two deletes met (`:1013`); keyboard reachable met to the letter only, see P1 |
| #763 | On a finished page the control stays, the composer does not | met: `chat-panel.test.ts:1050`, `event-chat-composer.test.ts:154` |
| #763 | Control named „Nachricht von {name} löschen“, keyboard reachable | met: `chat-panel.test.ts:786` (a `button`, tab stop) |
| #763 | „Gelöscht“ is a text, `copy.test.ts` passes | met (green here) |
| #763 | `chat.deleted` in `room-listeners.test.ts` | met |
| #763 | Browser-check items for #776 | met: comment of 21:28 |
| #763 | knip, type check; changelog under „Neu“ | met; line true of the tip |
| #764 | Component tests: control on every Message as Host, gone on a deleted one, Member only own, Host's control focusable without hover | met: `chat-panel.test.ts:1114-1183`, `event-chat-composer.test.ts:162` |
| #764 | Host's own Message reads „Gelöscht“, same undo, control on a finished page | met: `:1159,1131,1183` |
| #764 | Browser-check items | met: comment of 22:02 / 22:23 |
| #764 | knip, type check; changelog under „Neu“ | met; the merged line is the corrected one (the Host's own reads „Gelöscht“) |
| #765 | Four items in order, the Chat view, the count rises on `chat.added` while another view shows, clears on opening, ignores an own Message, is in the accessible name | met: `event-chat-phone.test.ts:107,116,134,150,166` |
| #765 | The desktop panel unchanged by this ticket | met: `event-chat-phone.test.ts:202` (its counts are #778) |
| #765 | Browser-check items (390 px, Hell and Dunkel, keyboard room) | met: comment of 21:16 |
| #765 | knip, type check; changelog under „Neu“ | met; the keyboard fit is typed only (stubbed `visualViewport`, `event-chat-phone.test.ts:267`) |
| #766 | `activity` step on a computer shows the Aktivität tab, other steps leave the Member's tab, phone's `tabs` step still points at the item | met: `event-page-tour.test.ts` („the panel's tab (#766)“), `tour-layer.test.ts` („which step shows“) |
| #766 | Markers pass, `TOUR_VERSION` unchanged | met: `tour.test.ts` (green here), `use-event-tabs.test.ts:55` |
| #766 | knip, type check; no changelog | met |
| #767 | Worker tests: all sockets incl. sender, token user id, room `serverTime`, 2 s across two sockets, 3 and 4 in a second, unknown id, non-JSON, binary, two Events, publish and ping as before | met: `realtime/test/emote.test.ts:44-226`, `room.test.ts` (47 passed here) |
| #767 | Unit test of the shared rule at its edges | met: `test/unit/emote.test.ts` |
| #767 | `realtime-deploy-paths.test.ts` passes with the new files | met (green here): `shared/emote.ts`, `shared/chat.ts` in the workflow |
| #767 | `room-listeners.test.ts` lists `emote.sent` | met |
| #767 | Worker header comment names the first two rules | met: `realtime/src/room.ts` |
| #767 | knip, type check, realtime typecheck | knip clean here; the typechecks typed |
| #767 | No changelog | met |
| #668 | Component tests: one `emote.send`, wait with `aria-disabled` and „Kurz warten“, rise for a team Member and the Stands, `aria-hidden`, none on a finished page, none in the dock | met: `event-emotes.test.ts:146-256,372` |
| #668 | Motion tests: keyframes, 1.4 s, `--cp-ease-pop`, reduced-motion numbers and geometry | met: `emote-motion.test.ts:32,50,70,83` |
| #668 | No Activity entry, nowhere in the feed | met: `event-emotes.test.ts:340` |
| #668 | Four pictures under the public assets, deviation notes in `02-components.md` and `03-screens.md` | met: `public/emotes/*.svg`, `emote-art.test.ts`; notes in 02, 03, 04, 05 |
| #668 | Texts complete including „Kurz warten“ | met: `emote.label`, `emote.wait` |
| #668 | Browser-check items for #777 | met: comment of 14:53 |
| #668 | knip, type check; changelog under „Neu“ | met; line true of the tip (see P6 (b)) |
| #768 | Phone width: one button, opens the four, a pick sends one and closes, the ring during the wait | met: `event-emotes.test.ts:488-543` |
| #768 | Buttons named, keyboard reachable, Esc closes | met: `:501,574` |
| #768 | Browser-check items; knip, type check; no changelog | met |
| #769 | With the Clip up, the ceremony, a scrolled-away board, a phone's Chat view, a hidden tab: nothing drawn, no error; with the board seen it draws | met: `event-emotes.test.ts:386,410,433,456,619,637` (the wheel spin is the decision under „open points“) |
| #769 | Nothing is queued for later | met: the same cases check the next Emote and nothing late |
| #769 | Browser-check items; knip, type check; no changelog | met |
| #770 | Cue tests: own full, another's 60 %, unmarked nothing, Ton off nothing and no log, late nothing, a spin's or Veto's plan unchanged | met: `event-emote-cues.test.ts:125-206`, `cue-player.test.ts:853-896` |
| #770 | Credits file has the four entries, credits and sound-files tests pass | met (green here) |
| #770 | The cues are in `window.__compiesCueLog` as the others are | met: `volume` added to every line (decision) |
| #770 | Browser-check items for #777 | met: comment of 17:36 |
| #770 | knip, type check; changelog under „Neu“ | met; line true of the tip |
| #778 | Counts on „Chat“ and „Aktivität“ in the panel at a computer's width, accessible name, own Message not counted, „Tabelle“ none | met: `event-panel-counts.test.ts:100-173`, `use-event-tabs.test.ts:220` |
| #778 | The phone's counts behave as before by the same rule, one function | met: `arrived()` in `useEventTabs.ts`; `use-event-tabs.test.ts:125-218` |
| #778 | Browser-check items for #776 | met: comment of 21:42 |
| #778 | knip, type check; changelog under „Geändert“ | met; line true of the tip |

Every line of `## [Unreleased]`, checked against the tip: Emotes (row of four on the board, rise above the avatar in a team and on the Stands, 2 s wait, in place under reduced motion, not stored): true. Emotes klingen (own at full volume, others quieter, surplus silent, Ton off): true (`emoteCue`, `judgeEmote`). Der Chat (side panel, Stands write, every Phase until the Finish, live, 500 characters, Enter, line breaks to spaces, failed text kept, no sound and no notification): true. Der Chat auf dem Handy (tab between Tabelle and Aktivität, composer above the keyboard, count, own Messages not counted): true, the keyboard fit typed only. Eigene Nachrichten löschen (also after the Finish, gone at once, undo for 5 s, „Gelöscht“ for all afterwards): true. Der Host löscht jede Nachricht (also after the Finish, undo, „Vom Host gelöscht“ for another's Message): true. Das Seitenfeld hat neue Tabs: true. Zähler im Seitenfeld: true. No false line and no line that contradicts the tip.

### Scope creep and open points

- **Scope creep:** none that contradicts the spec. What goes beyond the tickets is recorded in their comments: the unused CSS rise `animate-emote-rise` and the text `emote.sent` removed (#668); `volume` on every cue-log line (#770); the Tour's `show` event (#766); the `active` prop of `ActivityFeed` (#761); the Host's crown hidden and the dock gone on the phone's Chat view (#765); the Host pill in a name line (the artboard draws it); a row in `MONO_USES` of `scripts/wording/walk.mjs` (needed by `wording-walk-mono.test.ts`).
- **Spec text and a settled decision that differ, said openly by the run (not findings):** (1) a spin of the Lucky Wheel is not a cover for the Emote rise (story 50 and § C name it); #769's decision and `03-screens.md` say so; on a window tall enough for wheel and board an Emote rises beside the spinning wheel. This is the one the operator should decide. (2) Own Messages sit on the right under „Du“ where story 14 says the current Display name (#761). (3) Leaving the phone's Chat view unmounts it: an unsent draft and a failed line are lost, where story 8 says a failed Message stays with its text (#765). (4) The phone's four Emotes open in the bottom sheet (#768) where the artboard draws a row. (5) The limit constants stay named `ACTIVITY_PAGE_DEFAULT` and `ACTIVITY_PAGE_MAX` in `shared/activity.ts` and `server/domain/paging.ts` imports them for the Chat (#759: a neutral name is a follow-up).
- **Typed, not measured:** the migration on the dev database (#757), the keyboard fit of the phone's Chat view (#765), the `keepalive` of the delete call when the page is left (#763: no test asserts it; #776 item 4), every browser-check item of #776 and #777. The four Emote sounds are generated, provisional and unheard (#770; the listening session #771 and the swap #772 are not this phase); the changelog line „Emotes klingen“ promises a sound, which ships as it is.
- **Not built here, so no finding:** #771 to #777 and #779.

## Code quality

Tip `c0b037a8` of `origin/spec/719-chat`, read against `origin/staging` (`71c905bd`, the cut of 0.17.0). `sound-candidates/`, `public/`, `drizzle/meta/` and `docs/design_handoff_compies/` left out. Read-only; nothing changed or posted, nothing run (findings are proved by reading, with the test that pins each behaviour named). The skill `christried-thermo-nuclear-code-quality-review` could not be called (the Skill tool refuses it: it is reserved for the user's own invocation), so this review follows the frame's list of what to look for and the `improve-codebase-architecture` vocabulary (deletion test, seam, depth), without the HTML report.

Overall: the server side is in good shape. `server/utils/chat.ts` is one small, deep module with one `messageOfRow`, an id that makes retries safe, and a delete that is one `UPDATE` with the race loser reading the winner. `shared/message-text.ts`, `shared/emote.ts` (`judgeEmote` is shared by the room and the bar's ring), `app/utils/chat.ts` and `emoteSeen` are pure and well tested, and the room's counters are bounded and pruned. No must-fix was found. What 0.18 leaves behind is (1) two ways the Chat's held Messages can go out of step with the server, (2) a component that copies the feed's skeleton and has grown five jobs, (3) a composer that is the third copy of a field rule, and (4) a test harness pasted into every page test, the same finding as 0.17's Q2.

Severity key: **must-fix** = a bug a User can meet, a leak, a race that loses or doubles a Message or a delete; **should-fix** = for this Release's fix ticket; **low** = Idea for later.

### Q1. should-fix (the nearest to must-fix): a `chat.deleted` for an id the Chat does not hold yet is dropped, and a page or `chat.added` that arrives after it shows the deleted text

- `app/utils/chat.ts:249-251` (`markDeleted` maps over what is held, so an unknown id changes nothing), listener `app/components/ChatPanel.vue:257-259`. `test/unit/chat.test.ts:102` and `test/nuxt/chat-panel.test.ts:973` ("changes nothing for an id it does not hold") pin exactly this.
- The Chat holds nothing for an id while its page is in flight: the first read (`loadFirst`, `:51`), „Ältere laden“ (`loadOlder`, `:67`) and the re-read on reconnect. The server answers the page at T0; the Host's delete commits at T1 and the room's `chat.deleted` reaches the page before the page's answer is applied. `markDeleted` skips the unknown id, then `mergeMessages` adds the live Message from the page. The same happens when the two publishes of a quick write-then-delete reach the room out of order (each publishes after its own commit, #202). Nothing corrects it until the next reload: the Host deleted the Message, and this viewer still reads it. The Host's delete is the moderation tool, so this is the case that matters.
- Cost: a deleted text stays on one viewer's screen. The window is one request flight, so it is rare; the fix is ten lines.
- **Fix:** keep the deletes the room announced as a `deleted: Map<id, MessageDeleter>` next to `messages`, fill it in the `chat.deleted` listener (also for unknown ids), and let `mergeMessages` take it: an incoming live Message whose id is in the map arrives as its line. One more case for `chat.test.ts` ("a delete that came before its page"). This also replaces the test that pins the drop.

### Q2. should-fix: a re-read after a long disconnect leaves an invisible hole in the log

- `app/components/ChatPanel.vue:51-65, 262-264`: on `open` the panel reads the first page (50 Messages, `ACTIVITY_PAGE_DEFAULT`) and merges it into what is held; `next` is kept from the first load. When the page was away for more than 50 Messages (a phone that slept in a lively Event), the new page and the held ones do not touch: the Messages between them are never shown, and „Ältere laden“ continues from the old `next`, which is below the held ones, so the hole cannot be closed from the UI. `ActivityFeed.vue:51-62` has the same shape (the 0.17 design the Chat copied), so it is the feed's flaw too.
- Cost: Messages lost to the reader without a sign, until the reload. `test/nuxt/chat-panel.test.ts:218` covers a re-read with one deleted Message, not a re-read bigger than a page.
- **Fix:** on a re-read, when the page's oldest Message is newer than the newest held one and `page.next !== null`, throw the held list away and keep the page (the outgoing lines are a separate list and stay), then reset `next`. Or walk `before` until a held id is met. One test with `pageSize` 2 and four missed Messages. Do it in the shared composable of Q4, once, for both logs.

### Q3. should-fix: a send that is in flight when the phone leaves the Chat view fails with nobody to say so

- `app/components/EventPage.vue:364-373` mounts the phone's `ChatPanel` only while `activeView === 'chat'` (a settled decision of #765, "an unsent draft and a failed line are lost", reported to the operator). The state of a send lives in the component: `outgoing`, `post()` at `app/components/ChatPanel.vue:124-142`. A Member who sends and taps „Tabelle“ at once, on a flaky mobile network, has the call fail into `outgoing.value` of an unmounted component: no „Nicht gesendet“, no retry, the Message is gone, and the reader returns to a Chat that reads fresh. The decision named the draft and the failed line; it did not name the call that fails after the leave. A delete that fails after the leave does say so (`flush` toasts), so the Chat already treats the two cases differently.
- **Fix, cheapest:** in `post()`'s catch, when the panel is unmounted (a flag set in `onBeforeUnmount`), `toast({ tone: 'error', text: t('chat.failed') })` with the text, as `flush` does. **Better, and it carries Q2 and Q4:** hold `messages`, `outgoing`, `next` and the draft in a `useChat(slug, room)` owned by `EventPage` and handed to `ChatPanel`, so the phone's view is a window onto it, the Chat is not read again on every opening, and `useEventTabs`' unread count and the panel read one stream. That changes the settled decision, so it is the operator's call; the toast does not.

### Q4. should-fix: `ChatPanel` copies `ActivityFeed`'s whole skeleton and has grown five jobs; a keystroke re-renders every bubble

- **Duplicated module, not just similar:** `ChatPanel.vue:36-90, 262-268, 319-328` and `ActivityFeed.vue:34-125` hold the same `entries`/`messages`, `next`, `status`, `loadingOlder`, `scroller`, `atEnd`, `scrollToEnd`, `loadFirst`, `loadOlder` (with the scroll-keeping), `retry`, the reconnect watch, the `active` watch and the „Ältere laden“ button, line for line (the Chat's header says it "follows the feed"). The 0.18 flaws Q1 and Q2 now live in two places. A third log would be a third copy.
- **Five jobs in one 536-line file:** paging and merging (`:36-90`), the outgoing sends (`:92-160`), the composer's field (`:162-179`), the delete with its toast, its timer-less undo and its flush (`:181-240`), and the name-line view model (`:270-298`). `hidden`, `pending` (a plain `Map`) and the global toast stack are three states kept in step by one watcher on the toasts' ids (`:223-227`); it works and is tested, but a reader has to hold all three.
- **The cost the mix has today:** `draft` is a `ref` of the same component (`:102`), so every keystroke re-renders the whole log: each bubble runs `splitMessageText` (a regex scan) and `outgoingById.get(...)` six times in the template (`:421-467`) for 50 to several hundred Messages.
- **Fix (the split):** (a) `usePagedLog({ fetchPage, merge })` in `app/composables/`, owning status, next, load first or older, reconnect, scroll; both the feed and the Chat use it, and Q1 and Q2 are fixed in it once. (b) `ChatComposer.vue` (draft, counter, Enter, `send` event) so typing re-renders only the composer. (c) `useChatOutgoing()` and `usePendingDeletes()` (or the Q3 `useChat`) for the two lists of in-flight work. (d) `ChatMessageGroup.vue` with the name line and the bubbles as props, with the pieces computed in `groups`, not in the template. `ChatPanel` is then about 150 lines of wiring. Not a file over 1000 lines (the test file is, Q6).

### Q5. should-fix: the composer is a third copy of the length-limited field, and its line-break rule is narrower than the shared one

- `app/components/ChatPanel.vue:105-107, 162-179` against `NoteEditor.vue:29, 58-73, 114` and `TextField.vue:61-66`: `characterCount` against the maximum, `nearLimit = >= MAX * 0.8`, the warning colour from `MAX - 8`, `cutToCharacters`, the written-back value and the caret restore, the IME-aware Enter. The brief said "as NoteEditor does", which is how it came; the result is that a change of the 80 % rule or the caret fix is made in three places.
- The rule that the page and the server share is broken here: `shared/message-text.ts:41` (`LINE_BREAK`: CRLF, `\r`, `\n`, VT, FF, NEL, U+2028, U+2029) says "the composer and the server enforce one rule", but `ChatPanel.vue:164` replaces `/\r\n|[\r\n]/g` only. A pasted U+2028 stays in the draft, the counter and `sendable` count it as a character, and `parseMessageText` turns it into a space only on send (the sent text is then shorter than the counter said; 500 stays safe, but the rule has two spellings).
- **Fix:** export `normalizeMessageBreaks(raw)` from `shared/message-text.ts` (the line `raw.replace(LINE_BREAK, ' ')` that `parseMessageText` already runs) and call it in `onInput`. For the field, a `useLimitedInput(max)` composable (count, `nearLimit`, `cut`, `writeBack`) used by the three; at the least, move the two numbers (`0.8` and `8`) into `shared/text.ts` beside `characterCount`.

### Q6. should-fix: the page tests paste one harness per file, one test file is over 1000 lines, and some tests restate the table

- **Pasted harness.** `mountLive` (the Event read with its Members, teams and standings, the three `registerEndpoint` calls, `mountSuspended`, the socket wait), `lastSocket`, `settle`, `arrives`, `feedEntry`, the `beforeEach` and `afterEach` blocks appear in `test/nuxt/event-chat-phone.test.ts:31-96`, `event-panel-counts.test.ts:30-84`, `event-emote-cues.test.ts:~40-100`, `event-emotes.test.ts:45-100`, `event-chat-composer.test.ts:44-100` and again in `event-activity-views.test.ts`, `event-live.test.ts`, `event-presence.test.ts` (eight files hold the same `registerEndpoint(`/api/e/${slug}/room`…)`). `arrives` and `feedEntry` are verbatim in `-phone` and `-panel-counts`; `settle2` is defined at the foot of `event-emotes.test.ts:657` after its first use. This is 0.17's Q2 again, three tickets later. `test/nuxt/cue-harness.ts` shows the repository already knows the remedy.
- **File over 1000 lines:** `test/nuxt/chat-panel.test.ts` (1196 lines, 49 cases), with `serveChat` and `fakeRoom` inline (`:46-125`). It is three subjects: reading (`:171-455`), writing (`:457-755`) and deleting (`:756-1196`).
- **Restating tests (they fail only if the file itself is edited):** `test/unit/sound-cues.test.ts` the `maps %s to %s` rows and "has a cue for every Emote, each its own" restate `EMOTE_CUE`, which is `Record<EmoteId, CueId>` (typecheck already says it); `test/unit/emote.test.ts` "the four of the locale, in this order" restates `EMOTE_IDS`; `test/unit/emote-art.test.ts` "has one picture per Emote" restates a `Record<EmoteId, string>`; `test/nuxt/chat-motion.test.ts:33-48` pins the keyframes and the `220`/`OUT` literals of `chatRise`, so a tuning of `--cp-dur-base` or the curve breaks it (it also reads the same tokens through the same `motionToken`). `cue-player.test.ts` "plays at the volume of its cue times a per-play factor" hard-codes `0.27/0.33/0.45`, i.e. `CUE_VOLUME` times 0.6, which #771's listening session is going to change.
- **Fix:** `test/nuxt/event-live-page.ts` exporting `mountLiveEvent({ slug prefix, serve })`, `lastSocket`, `arrives`, `feedEntry`, `openRoom` and the shared lifecycle body; `test/nuxt/chat-harness.ts` for `serveChat`, `fakeRoom`, `mountChat` and `texts`, and `chat-panel.test.ts` split into `chat-panel-read`, `-write` and `-delete`. Drop the restating cases, keep the behaviours (the 60 % factor, the 3-per-second rule). The pin of Q1 changes with its fix.

### Q7. low: the Tour's tab switch lives in `EventPage`, in front of the composable that owns the tab

- `app/components/EventPage.vue:167-185` (`tabBeforeTour`, `tourShows`, `restoreTab`, the `watch` on `tour.shown`) writes `panelTab.value` from outside `useEventTabs`, which owns `panelTab`, `unread` and the rule that a changed tab clears its count (`useEventTabs.ts:76-80`). The count clearing works only because the sync watcher on `shown` happens to see the Tour's write, and the page has to know that. The page file also grew by 84 lines in this Release for three subjects (Emotes, the Chat on a phone, the Tour's tab).
- **Fix:** `useEventTabs` returns `borrowPanelTab(key)` and `returnPanelTab()` (with the remembered tab inside), and the page calls them from `tourShows` and the `tour.shown` watch. The test in `use-event-tabs.test.ts` then covers the "put back" rule without a page.

### Q8. low: the Emote's wait lives in a component that the page unmounts, while its rule lives in the room

- `app/components/EmoteBar.vue:18-31, 48`: `tapped` and its timer are local. The bar is mounted with the Game board, which a phone drops when its view changes and the page drops for a Clip. Tap, switch to „Chat“ and back within two seconds: the bar is new, the ring is gone, a tap is accepted by the bar and silently dropped by the room (`realtime/src/room.ts`, no answer on refusal, by design). The Member sees nothing happen. A second tab of the same User does the same.
- **Fix:** the page keeps `emoteReadyAt` (set from `sendEmote`, `EMOTE_COOLDOWN_MS`) and passes it as a prop, or `useEmoteWait()` in the page; the bar draws the ring from it. Small, and it also removes the bar's own timer and its cleanup.

### Q9. low: small duplicated rules and names in the cue path

- `app/utils/cue-player.ts:132` and `:204` both compute `CUE_VOLUME[id] / 100 * factor`, once for the log and once for the gain. They are the same today; a later change to one (a master volume) makes the log say what was not played. One `gainOf(id, factor)`.
- `app/composables/useCuePlayer.ts:32-36`: `standings`, `board` and `emote` are now three fields of the same expression `setUp`, each with a comment "the same rule again, in its own field". This is 0.17's Q6 grown by one; the third copy is the sign that the "may part later" fields cost more than they save.
- `app/utils/sound-cues.ts:355-361` `emoteCue` returns `volume`; `app/components/EventPage.vue:43-46` hands it to `playNow(id, delayMs, factor)` as the third argument. The name changes between the two (`volume` of the rule, `factor` of the player) and the player's log has a third meaning, `volume`, which is the product. One word for the factor.

### Q10. low: `server/domain/activity.ts` is now a one-line wrapper, and the shared parser carries the Activity's names

- `server/domain/activity.ts:6-8` `parseActivityQuery` only calls `parsePageQuery` (`server/domain/paging.ts`). The deletion test says delete it: its one caller, `server/api/e/[slug]/activity.get.ts:23`, calls `parsePageQuery`, and `test/unit/activity-query.test.ts` becomes the parser's test. The same parser reads the Chat's page, but its limits are still `ACTIVITY_PAGE_DEFAULT` and `ACTIVITY_PAGE_MAX` from `shared/activity.ts`, so a change of the feed's page size changes the Chat's page, and the Chat's header says "default 50, at most 100" in `messages/index.get.ts:12` as a copy.
- **Fix:** rename the two constants `PAGE_DEFAULT` and `PAGE_MAX` into `shared/paging.ts` (or keep them and say in `paging.ts` that they are shared), delete the wrapper, and point the comment at the constant.

### Q11. low: stale or wrong comments

- `app/components/ChatPanel.vue:14-19` header: "read only", "The composer is #667's, links #762's and the delete control … #763's" are all built now; the file is the composer and the delete. Reword to what it is.
- `app/composables/useImmediateCue.ts:8`: "`(id, delayMs?)`" is stale; `playNow` takes `(id, delayMs?, factor?)` since #770.
- `scripts/wording/walk.mjs:63`: `site: 'ChatPanel.vue:392 common.counter'`; the `font-mono` is at `ChatPanel.vue:496`. The other rows' line numbers hold (`ClipPreview.vue:122`), so this one is wrong at birth. Drop the line number from the label, or the next row drifts the same way.
- `app/composables/useEventTabs.ts:8-12`: the header lists "the Event page, the Standings, the Activity feed or the Chat" and then says "The feed is mounted once … the Chat has its own phone view"; the Chat is mounted once too (panel or phone view), and the sentence about when each mounts should say so.
- `server/utils/clock.ts:7`: the new sentence is inserted in the middle of the list that "Not behind it" continues, so "Not behind it, because those systems keep their own clock" now follows the Messages' limiter. Move the sentence to the end.

### Not findings (checked)

- **`mergeMessages` and the own Message's race with `chat.added`.** The answer and the room's copy settle one outgoing line in either order (`ChatPanel.vue:128-129, 242-252`): a live and a deleted variant of one id keep the deleted one, a stale page does not bring text back. Held by `chat.test.ts:64-80` and `chat-panel.test.ts:483, 937`.
- **`writeMessage` and `deleteMessage`.** The retry with the same id answers the stored Message and queues nothing; a probe of an id of another Event or Member answers `invalid_value` / `message_not_found` alike; the loser of two deletes reads the winner; `deleted_by` of the Host's own Message is `writer`. The two check constraints in `drizzle/0040_chat_messages.sql` make a half-deleted row impossible. No finding.
- **Timers and listeners.** `ChatPanel` (`pagehide`, `onScopeDispose` of both room listeners, `flushAll` on unmount, which dismisses the toasts), `EmoteBar` (`clearTimeout` on unmount), `FloatingEmote` (`end()` is idempotent, the timer is cleared, `animation.finished.then(end, end)`), `EventChatView` (`stopKeyboard` on unmount). `room.on` in `EventPage` and `useEventTabs` has no stop, as `veto.cast` and `activity.added` before it have none: the room is the page's own and dies with it.
- **The undo.** `pending`, `hidden` and the toast ids stay in step on every end of the toast (timer, ✕, a fourth toast, unmount, `pagehide`); `flush` sends once (`pending.delete` first); the answer is merged and unhidden; a failure puts the Message back and toasts. Tests at `chat-panel.test.ts:853-920, 1013`. Leaving the view cutting the 5 s short is the settled decision of #763 and #765.
- **The room's Emote rules.** `judgeEmote` is pure and shared, the counters are pruned on every Emote, a refused Emote is not recorded and not answered, the sender is the token's, and a hibernation resets only the counters (documented in `room.ts`). `realtime/test/emote.test.ts` fakes only `Date` and polls in real time, with the reason written next to `until`.
- **`emoteSeen` and `useRisingEmotes`.** Decided on arrival and never queued; the anchor is matched by attribute value, not spliced into a selector; "no cap" is bounded by the room's one-per-two-seconds rule per Member. Not a leak.
- **`shared/` for the Worker.** `shared/chat.ts` is a types-only leaf, `shared/emote.ts` holds one pure function, both are in `.github/workflows/realtime-deploy.yml`, and `~~/shared/` is used in `app/`.
- **Unread counts.** One rule for the phone's bar and the panel's tabs (`arrived`), the shown tab counts nothing, the own Message does not count, the sync watcher clears the count the moment the tab is selected. No second counter exists.
- **Cue ids.** The 0.17 review's Q1 is applied (`app/utils/cue-ids.ts` is a leaf that Node imports); the Emote cues are one row in each table and one recipe file, and `up` of the recipes is in `scripts/cue-kit.mjs`.
- **Files over 1000 lines:** none outside the test file named in Q6 (`ChatPanel.vue` 536, `EventPage.vue` 501, `ChatPanel`'s test 1196).
