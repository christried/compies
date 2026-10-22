# 07 Scope & tickets

## Labels

| Label | Meaning |
|---|---|
| **[MVP]** | New in Phase 5. Ships first, before the rest of 1.0. Only date coordination works; every other area shows the construction page. |
| **[1.0]** | Part of the first full release |
| **[1.0 – last ticket]** | Part of 1.0, built last, dropped if it can't be built as described (battle replay) |
| **[Post-1.0]** | Designed (mockups exist), not in 1.0. Not shown in the UI, or shown as „Bald verfügbar“ where the brief says so |
| **[Discarded]** | Do not build |

„Bald verfügbar“ in the 1.0 UI (locked option pattern: dashed border, lock, chip, `aria-disabled`, skipped by arrow keys): format **Turnierbaum**, format **Liga** (both Post-1.0, brief §5), and the selection modes **Loser's Pick** and **Lucky Wheel – Loser's Advantage** until ticket 12 is done.

## Scope per element

| Element | Label |
|---|---|
| Sign-in Discord + Twitch, link both | [MVP] sign-in + one provider each; linking both [1.0] |
| Profile: name + avatar from provider, logout | [MVP] |
| Profile: avatar upload (R2), settings (sound, push, reduced motion, theme) | [1.0] |
| Host permission | [MVP] env allowlist · [1.0] admin UI (T3) |
| Create session: name + date (poll or direct) | [MVP] |
| Create session: format, games, points, mode, pools, info sheet | [1.0] |
| Invite link + rotate | [MVP] |
| Date poll: vote, matrix, best slot, confirm, reschedule, .ics with 1 h alarm | [MVP] |
| Date poll: push (confirmed, rescheduled, reminder) | [1.0] (T17) |
| Construction page + BaustelleZone + nav tape marker | [MVP] (removed piece by piece) |
| Lobby/board, zones, team names, colours, chat, feed, emotes | [1.0] |
| Admin pick, Lucky Wheel (+ hidden), clip, vetoes, Pick & Ban, coin | [1.0] |
| Loser's Pick, Loser's Advantage | [1.0] (shown „Bald verfügbar“ until T12) |
| Results, points, leaderboard, corrections, tiebreaker | [1.0] |
| Award ceremony, share image | [1.0] · 3D podium (TresJS) optional |
| Archive | [1.0] |
| Push notifications | [1.0] |
| Compibert everywhere, sound, boot, smoke background | [1.0] |
| Battle replay | [1.0 – last ticket] |
| Crews, bracket, league, self-reported results, stands features, English | [Post-1.0] |

## MVP cut (ship first)

The MVP is four slices of the planned tickets. Each slice is a real part of that ticket, not a prototype.

**T1 Project setup** (full ticket, unchanged)
- Nuxt, Tailwind v4 theme from `tokens/`, `@nuxtjs/color-mode`, vue-i18n with `i18n/de.json`, fonts, Lucide (`lucide-vue-next`, stroke 2.5).
- PWA shell: manifest + icons from `reference/assets/icons/`, offline fallback page. No push yet.
- Base components: Button, IconButton, HoldToConfirmButton, TextField, SegmentedControl, Toast, Sheet/Modal, Icon, CpNum, AppShell (header, HubNav with tape marker, mobile tab bar), FullScreenState, **ConstructionPage**, **BaustelleZone**, Compibert (still head in header; full body still pose on the construction page).
- Route guard: every route not in the MVP renders ConstructionPage (`/archiv`, `/bibliothek`, `/profil`, `/admin`, `/s/:id/brett`, …). See M4.
- Acceptance: `App MVP Terminfindung.dc.html?s=site` all 4 states, light/dark, desktop/mobile.

**T2a Sign-in**
- Better Auth with Discord and Twitch. Sign-in screen 02 (states: Standard, Über Einladung, Weiterleitung, Abgebrochen). First-login profile setup 03 reduced to the name (prefilled), avatar = provider image.
- Host permission: `HOST_USER_EMAILS` or `HOST_PROVIDER_IDS` env allowlist; platform admin = `ADMIN_PROVIDER_IDS`. Store it as `users.canHost` so T3 only adds the UI.
- Logout reachable from the avatar menu and the construction page „Profil“.
- Later in T2b: link a second provider, upload avatar (R2), settings.

**T5a Create session (date step only)**
- Screen M2. Creates a real `sessions` row in phase `poll` (or `date_set` with „Direkt festlegen“). Format, mode, pools, points stay `NULL` until T5b adds the full stepper (05), which edits the same row.
- Invite link `/s/<slug>-<token>`, copy, rotate (hold 1 s, screen 06). Link opening 07 (signed out → sign-in with invite context; invalid/rotated/deleted).

**T7a Date poll**
- Screens M1 and M3 (= 08 without chat panel and push). Vote Ja / Wenn nötig / Nein per slot, change until confirmed; matrix „Wer kann wann?“; best slot rule; host confirm; reschedule (new date/time, notify by UI state only); .ics download.
- Live: polling every 15 s while visible + on focus. Optimistic votes with rollback.
- .ics: `UID` stable per session, `SEQUENCE` +1 per reschedule, `DTSTART` UTC, default duration 3 h (see open questions), `VALARM TRIGGER:-PT1H`, `URL` = session link. Summary from `mvp.ics.summary`.
- Later in T7b (with T6 realtime + T17 push): realtime updates, push on confirm/reschedule, server reminder.

**MVP release:** deploy to the custom domain. Then continue with T3.

## 1.0 ticket order (after the MVP)

Adjustable. Strikethrough parts are already done in the MVP.

1. ~~Project setup~~ (done in MVP)
2. Sign-in, profile, avatar upload (R2): **T2b** = second provider linking, upload, settings (sound, push, reduced motion, theme). Screens 02, 03, 25.
3. Platform admin: user list, search, grant/revoke host permission (26). Replaces the env allowlist.
4. Game library incl. YouTube excerpt preview and duplicate check (23, 24).
5. Create session: **T5b** full 8-step stepper + info side sheet (05), editing existing MVP sessions.
6. Realtime foundation: one PartyServer room per session, presence, clock sync, reconnect (27). Switch the poll to events.
7. Date poll: **T7b** realtime + reminder job (push lands in 17).
8. Lobby/game board: drag and drop, zones, locking, team names, team colours (09, 10).
9. Chat, activity feed, emotes.
10. Game selection: admin pick (15), lucky wheel + hidden (11), clip (30), veto logic.
11. Pick & ban incl. coin flip (13).
12. Loser's Pick (14), Lucky Wheel – Loser's Advantage (12). Removes the „Bald verfügbar“ lock.
13. Result entry, points table, live leaderboard, corrections (16, 17).
14. Tiebreaker (18).
15. Award ceremony (19), share image.
16. Archive (21, 22).
17. Push notifications (28) incl. date poll pushes.
18. Compibert states everywhere, sound, boot animation (01), smoke background, motion polish, PWA install hint (29).
19. **Battle replay** (20) [1.0 – last ticket]; dropped if not feasible purely with GSAP.

With each ticket, delete the matching construction routes and BaustelleZone usages, and remove the tape marker from that nav item.

## Post-1.0 issues (one issue each)

| Issue | Mockup | Notes |
|---|---|---|
| Crews: overview, found, members + host rights, crew invite (rotatable), crew archive | `App Post-1.0.dc.html?s=crews` (5 states) | Data model already has `crewId` (nullable) on sessions and permissions |
| Permission to found crews (admin), later „open for everyone“ | same, state „Ohne Gründungsrecht“ | |
| Format: tournament bracket | `?s=bracket` | „Bald verfügbar“ card in 1.0 setup |
| Format: league | `?s=league` | suggests 3 / 1 / 0, needs crews |
| Players report results, host confirms, contradictions go to host | `?s=report` (3 states) | |
| More features for the stands | none yet | brief §7 |
| English + further languages | `?s=lang` | copy deck already keyed |
| Proposals from design (confirm first): kick/ban from a session, chat reactions/threads/DMs/images, custom emotes, per-slot comments in the poll | none | from `reference/docs/post-1.0.md` |

## Data model notes (for the MVP to be future-proof)

Minimum tables for the MVP, shaped so 1.0 and crews need no rebuild:
- `users` (+ Better Auth tables): `displayName`, `avatarUrl`, `canHost`, `isAdmin`.
- `sessions`: `id`, `slug`, `inviteToken`, `hostId`, `crewId` (nullable, Post-1.0), `name`, `phase` (`draft | poll | date_set | running | finished | archived`), `dateMode` (`poll | direct`), `startsAt` (nullable), `icsSequence`, and nullable 1.0 config: `format`, `partyCount`, `teamSize`, `gameCount`, `pointsTable` (jsonb), `selectionMode`, `hiddenWheel`, `spinSeconds`.
- `session_members`: `sessionId`, `userId`, `joinedAt`, `zone` (`bench | stands | team`, default `bench`), `partyId` (nullable), `teamWord` (nullable). Created when a signed-in user opens the invite link.
- `poll_slots`: `id`, `sessionId`, `startsAt` (UTC), `position`.
- `poll_votes`: `slotId`, `userId`, `value` (`yes | maybe | no`), `updatedAt`. Unique (slotId, userId).
