# Release review 0.21 „Profil und Konto“, 2026-11-25

Diff `v0.20.0...spec/907-profil-und-konto` at its tip `d163d8d4` (spec #907), reviewed on the integration branch in two axes (`docs/agents/release.md` § Review, walk-through, retro).

## Standards

Standards review of `v0.20.0...origin/spec/907-profil-und-konto` (tip `d163d8d4`, 57 commits, 111 files).

Read in full: both migrations and the schema, `delete-user.ts`, `me.delete.ts`, `me/image.put|delete.ts`, `me/hosted.get.ts`, `images/[key].get.ts`, `realtime/src/room.ts`, `room-notifier.ts`, `event-access.ts`, `shared/auth.ts`, `shared/image.ts`, `server/domain/image.ts`, the Chat and Activity reads, the client composables and the Profil components, the operator script. Tests and the walk's states only skimmed. No hard violation of a documented rule found; the findings below are judgement calls unless marked.

### Hard violations (documented standard)

None that I could pin to a rule with certainty. Closest: the one-home rows of `CODING_STANDARDS.md` § One home per concern (finding 4 and 6).

### Should fix

1. **A session revives a Deleted User's row.** `server/utils/user.ts:40-44` (`getUser`) never asks `deletedAt`. `deleteUser` removes the sessions and accounts, but an OAuth callback already in flight can insert a session after the commit (the FK is satisfied, the row stays). The nameless row then reads as signed in. Standard: § Secrecy (who sees a deleted account). Change: `getUser` answers null when `deletedAt` is set (one `isNull` in the select, or a check on the row), plus a test that a session inserted after the deletion is 401.

2. **Profile PUT can write a key onto a Deleted User.** `server/api/me/image.put.ts:38-47`. `requireUser` passed, the deletion commits, the update then sets `profile_image_key` on the emptied row and the object is never cleaned. The route then serves it publicly for a year. Change: `update ... where id = ? and deleted_at is null`, check `returning`, delete the new object when no row came back. The DELETE route has no such window (it only nulls).

3. **Deletion changes other Hosts' Events outside the Event lock.** `server/utils/delete-user.ts:46-110` ends memberships, deletes Votes and blanks Messages in Events it never locks, where § One home row 1 says every Event change takes `loadEvent`'s lock. A Message insert or Vote already past `isMember` in a `changeEvent` waits on the user row, then lands after the commit with its text (the row's `FOR UPDATE` blocks the FK share lock, it does not make the write fail). Lock order is also users, then events, the reverse of `changeEvent` (events, then FK share on users): a Host action naming the deleting User (a move) can deadlock with it; the comment at `me.delete.ts:13` covers only the double-call race. Change: select the `memberships` Event rows `for('update')` in id order, together with `hosted`, before the user-owned writes; re-read membership after the lock.

4. **Dead words, and a screen that ignores the error table.** `app/utils/api-error.ts:60` words `image_unsupported` as `error.imageUnsupported`; `ProfileCard.vue:~190` shows `profile.imageUploadFailed` for every refusal and `scripts/browser/walk-states-konto.mjs` lists the key as `UNREACHED`. § One home (API error shown to Users: `reasonKey`/`apiErrorKey`) and § Copy ("promises only what the app does today"): a rate-limited PUT (429) and an oversize body read as "klappt nicht". Change: let `useProfileImageUpload` keep the code and read `reasonKey` on `profile` as a screen entry, or make `image_unsupported` one of the `null` codes and drop the key.

5. **Cached picture outlives the promise.** `server/api/images/[key].get.ts:30` sends `public, max-age=31536000, immutable` for a Profile picture. After a replace, a removal or a deletion the origin answers 404, but browsers (and any shared cache) keep the bytes for a year, while the Datenschutzerklärung says the picture is deleted. Standard: § Secrecy (image section of the Datenschutzerklärung). Change: a shorter `max-age` (a day) or `private`; the key still changes per upload, so staleness is not the reason for a year.

6. **Hard-coded image path.** `server/utils/library.ts:82` still writes `` `/api/images/${row.imageKey}` `` although `IMAGE_PATH` (`shared/image.ts:30`) is now the home. § One home: a second copy is a finding. Use `IMAGE_PATH`.

7. **CODING_STANDARDS rows missing for new homes.** The diff adds rows for `readPerson`/`shownPerson` and `endMembership`, not for: `profilePicture` (the one address function), `deleteUser` and `removeImages` (route and operator script share them), `readWriters` (the Chat row 61), `membershipEnded` (`app/utils/members.ts`, used by two components), `IMAGE_PATH`. Without rows the next feature copies. Add them.

### Notes (smells, labelled)

8. Possible Speculative Generality: `EventChange.publishLast`, the `closing` queue and `closeAfterResponse` (`event-access.ts:53,102,123`) have no caller in 0.21 (`me.delete.ts` calls `afterCommit` directly); the room's close is built for 0.22's removal (#697). Keep only if the spec asks for it now.

9. Possible Primitive Obsession / long parameter list: `afterCommit(event, row, messages, named, broadcast = true, closing)` (`event-access.ts:116`), called positionally with a bare `true` and `[]` in `me.delete.ts:41`. An options object would read.

10. Possible Data Clump: `{ name, image, deleted? }` is written three times (`readPerson`'s return in `shared/auth.ts:66`, `WriterView` in `shared/chat.ts:26`, `MemberView`'s fields in `shared/event.ts`). The comment says `shared/chat.ts` stays a leaf; a `PersonView` in a leaf file could serve all three.

11. Possible Duplicated Code: the upload prologue (`content-length` check, `readUpTo`, `isWebp`, 413/415) in `me/image.put.ts:28-32` and `games/[id]/image.put.ts:22-25`; the text-link class string in `ProfileCard.vue:130` (a seventh copy; this one lacks `focus-visible:focus-ring` that `BackLink.vue` and `profil.vue` carry).

12. Possible Duplicated Code: `endMembership` deletes the User's Votes (`invite.ts:60-66`) after `deleteUser` already deleted all of them (`delete-user.ts:90`); harmless, but one of the two is dead for this caller.

13. `ProfileImageCrop.vue` reads `gameEdit.*` keys (`imageZoom`, `imageCrop`, `imageCropHelp`, `imagePreviewAlt`, `imageZoomFits`): a feature's keys borrowed across screens; a shared `image.*` group would survive a rename of the game form. `AccountDeleteSheet.vue` is a declared copy of `EventDeleteSheet`'s shape (reason in its comment, as § One home asks).

14. Two concurrent PUTs of one User both read the same old key; the first one's new object is never deleted (orphan, never served). `image.put.ts:36-37`. Cheap fix: `select ... for update` on the row, or read the old key from the update's `returning` of a CTE.

15. Deploy order: Nuxt shipping before the Worker makes `close` answer 400 (fails closed by design, `shared/realtime.ts`), so a Deleted User's open socket keeps receiving the room until its next ticket is refused. The Release PR should name "Worker first" (the diff changes `realtime/`; § Review step 2 already forces a staging re-run).

### Checked and fine

Migrations 0043/0044: nullable columns without defaults keep the previous deployment correct (ADR 0007), the unique index sits with the column the image route filters on, journal order and snapshots are present. Secrecy: `readPerson` cuts name, picture and key for a Deleted User on every read that names one (Event read, Chat writers, Activity feed); no `users.image` reader bypasses it except the invite preview (Host never deleted). `event.gone` and the close call carry no game data. R2: key first then object on removal, the reverse on upload, orphan logs name keys only. CHANGELOG lines follow § Changelog lines (groups, order, links, plain German). Operator script prints counts and Event ids only.

## Spec

Spec review of v0.20.0...origin/spec/907-profil-und-konto (tip d163d8d4, 57 commits, 111 files), against #907 and its 16 tickets plus #990.

Overall: every ticket's acceptance criteria are present in the diff, and the deletion module, the room's `{ close, last }` call, the picture route and the crop match their briefs. Nothing is a "must fix". One "should fix" and six notes.

### (c) Looks implemented, but is wrong or thinner than it reads

**1. should fix: in a finished Event the open Activity feed keeps a Deleted User's old name.**
#990: "no text node of the page ... holds `member2`'s old Display name"; spec story 46: older entries "name the actor as „Gelöschtes Konto“".
The trigger is `membershipEnded` (app/components/ActivityFeed.vue:124, ChatPanel.vue:303), and it fires only when a Member id leaves the Members list. In a finished Event the membership stays by design (delete-user.ts:98 skips finished Events), so the id never leaves. The Chat is fine there, because it reads names from the Members. The feed re-reads only on `refreshTick`, which instants drive, so it keeps the held entries ("… ist beigetreten") with the old Display name until a reload. This is #990's bug in the other phase. The measured PASS covered an unfinished Event only.
Fix: also re-read when a Member's `deleted` mark turns true, not only when an id leaves.

**2. note: the room's close is best-effort, with a 60 s hole.**
Spec story 49 and #913: a Deleted User gets "nothing more of any Event, from the moment of the deletion".
- `httpRoomNotifier.post` (room-notifier.ts) logs a refused or failed call and does not retry. A timeout leaves the sockets open.
- A room token minted up to `ROOM_TOKEN_TTL_SECONDS` = 60 s before the deletion can still connect after the close call. The Worker checks it once, and the socket then stays open (it receives `chat.added` with text) until the tab dies. The 404 at the token route only stops tokens asked for later.
- The comment in event-access.ts:~118 says the last messages "go out after everything else". They are independent fetches, so there is no order.
The Worker could remember recently closed User ids for the token lifetime, or Nuxt could repeat the close once after about 60 s. At minimum the Release note should say so.

**3. note: a PUT in flight can attach a key to a just-deleted row.**
Spec: "A new upload stores its object, then its key". image.put.ts:42 updates by `users.id` only, not `AND deleted_at IS NULL`.
- A PUT that passed `requireUser` before the deletion commits writes an R2 object and puts its key on the Deleted User's row.
- The image route would serve that address (an owner row exists), and nothing deletes the object.
- Two parallel PUTs by one User also leak the first object (`current` is read without a lock).
- Both leaks are orphans only, but the first is the one case where a deleted account's picture stays loadable.

**4. note: "immutable" for a year against "answers like a missing one".**
Story 19, and §5's "löschen wir das bisherige sofort aus dem Speicher".
- The route sends `public, max-age=31536000, immutable` (images/[key].get.ts, profile branch), as the spec prescribes.
- Browser caches, and a shared cache if the host puts one in front, keep serving a replaced, removed or account-deleted picture for up to a year, whatever R2 holds.
- The text is true for storage only. Consider `s-maxage` or `private`, or accept it and say so.

**5. note: a finished Event can still hold a Team word.**
Story 45: "Team word out of our Team name, in a finished Event too".
- delete-user.ts:97 clears `event_members.team_word`, and names after 0.12 are composed, so they follow.
- Events finished before 0.12 keep `event_teams.frozen_name` with the words in it. The approved §16 already says so.
- The comment at delete-user.ts:96 ("frozen at the Finish") and the doc comment at shared/event.ts:159 ("Team word stay as stored") are stale or wrong. The word is cleared.

### (a) Missing or partial

**6. note: not checked by any test, only by the walk-through.**
#678's own comment: "the one thing tests cannot cover is that the header reader accepts Chrome's real canvas WebP". The staging run reports PUT 200 against R2, but not that the file came from a real canvas. `webpInfo` handles VP8, VP8L and VP8X. Make a real browser upload (an opaque JPEG and a transparent PNG) an explicit walk-through item.

Not missing, checked:
- The 0.21-10 and 0.21-11 deletion list is complete. Every foreign key to `users` is handled: votes, messages, memberships, hosted Events, games, the sessions and accounts that cascade, and the stay-rows (vetoes, bonus vetoes, coin tosses, activity).
- The R2 objects are removed after the commit: the picture, and game images that no remaining game row names.
- The session cookie is cleared, with a test for it.
- The Chat's `writers` and the Deleted User's names in the Members, the feed and the ceremony go through `readPerson` and `shownPerson`.
- The operator's query for games held by another Host's Event is in the PR notes.

### (b) Not asked for (scope)

**7. note, minor, all small and documented in tickets.**
- The emptied row also resets `newsSeen`, `tourSeen` and `appearance` (#681 brief decision 3).
- `GET /api/me/hosted` returns `games` as well as `events` (#918, decision 1).
- `useEventRoom` stops for good on any 4xx at token time, so also on 408 or 429. The spec says "a 4xx", and today no limiter sits on that route.
- delete-account.mjs:80 prints `Database <first host label of DATABASE_URL>`. The header says the script never prints "the URL"; this is the Neon endpoint id, not a secret, but it is a piece of the URL.
- #914 changed behaviour for every Event page. A failed read other than 404 or 410 keeps the last Event, a 401 and 403 included. It has a `### Behoben` line the ticket did not plan, and the PR note says so.

Carried from #921's comment, not a spec finding: the full wording walk exits 1 on four older states, which go to the cut's sweep.
