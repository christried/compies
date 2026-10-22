# COMPIES: spec changes from Phase 2

Decisions made during the design system work that change or sharpen the product brief. Items marked **(confirm)** were decided by design and need a product yes/no.

## Visual system

- **Style:** Memphis sticker look: 2.5 px ink lines, flat accents, hard offset shadows, paper texture. Confetti is sticker confetti (white die-cut rim, hard shadow).
- **Modes:** light and dark are equal; light by default, dark via OS setting or toggle. Every screen works in both.
- **Team palette:** CVD-optimised set of 8 with new names (Rot, Orange, Gelb, Himmel, Grün, Blau, Pink, Nacht). Every team also has a symbol and a fill pattern; colour is never the only signal.
- **Type:** Lilita One for headlines, Bricolage Grotesque for UI and body, Bungee for scores and timers (with fixed digit slots), JetBrains Mono for codes. No „·“ separators in kickers, headers or timers.
- **Icons:** Lucide (MIT), 2.5 px round line, colour offset on active states.

## Game selection (brief §8)

- **Selection modes:** all five are 1.0. Admin-Wahl, Lucky Wheel and Pick & Ban are built first. **Loser's Pick** and **Lucky Wheel – Loser's Advantage** come later within 1.0; until they are done, setup shows them as locked „Bald verfügbar“ cards. The locked state is the generic pattern for any not-yet-built option.
- **Spin duration is a host setting:** 3–10 s in 1 s steps, default 5 s. Set in setup, changeable any time from the host dock („Mehr“), applies from the next spin. The server sends duration + result so everyone stops together. Reduced motion: always a calm 1.2 s spin.
- **Wheel look:** „Show-Rad“ (1b): bulb rim (blink at rest, chase during spin, flash on result), pins at every slice edge, hinged flapper that kicks per pin. Slices use the four accents, never team colours. The wheel never resizes during a spin.
- **Coin flip (Pick & Ban start):** „Zeitlupe“ (1i): coin rises, nearly freezes at the apex while the camera orbits once, drops, lands flat, top view of the result. Faces come with the Compibert work.
- **„Nächstes Spiel setzen“** is reachable from the host dock in every mode.

## Compibert (Phase 3)

- **Direction:** „Flitzer Großkopf“ (2b): horizontal sprinter body, head 25 % larger, short neck, twin crest, striped back and tail. Face = the Phase 2 profile face (one eye, brow arc, smirk with one fang, nostril at the snout tip).
- **Outline treatment:** light mode = hard offset shadow (7/8 px at rig scale, ink); dark mode = sticker (cream die-cut rim + hard shadow). The rim keeps the ink outline readable on the dark stage.
- **Boot:** 3b „Reinsprinten“. He runs in, letters spring up behind him, skid + dust, wave. First visit per 24 h only; tap skips; reduced motion = 200 ms fade.
- **Presence:** 4a „Logo + Auftritte“. Header head-logo always; full body only in moment slots (boot, wheel, win, empty lobby, error, ceremony), then he leaves.
- **Interaction:** 5a „Anstupsen“. Tap = random reaction (laugh, hop, wave, squash, shrug); 5 taps in 2 s = angry easter egg.
- **Ceremony:** 6b „Pokal-Lauf“. He runs in with the trophy, trips, trophy lands on the winner. Then the full standings. Gag variants so it doesn’t wear off.
- **Ceremony avatars:** after the stamp, the winning party’s members pop in as large avatars under the winner card (80 px, 64 px mobile; stagger 0.08 s, `back.out(2)`), before Compibert dances. Max 6 cells: more members → 5 avatars + „+N“. Free-for-all (single winner): one 120 px avatar. Skip and reduced motion show them at once. `AwardCeremony` prop `members: [{who, host?}]`.
- **App icon:** 1c „Sonnenkopf“: grinning head (wave face) with hard shadow on the share-image sunburst. Favicon = simplified head with cream sticker rim. Theme colour follows the mode (paper #fff3df / #17121d). Files in `assets/icons`, options page `Compibert Icons`.
- **Static assets:** coin faces + rim and the 4 emotes exist as baked, filter-free SVG files (`assets/coin`, `assets/emotes`) for `<img>`/Satori use; the live UI keeps the rig.
- **Emotes:** 7a „Kopf-Sticker“. Head in a round sticker, own `emote` viewBox (158 −10 296 296) so the head never clips, also when it jumps or rotates.
- **Coin:** Kopf = head rig on yellow; Schwanz = striped tail curling in from the rim, on cobalt (mint body on mint was too low contrast).
- **Component:** `CompibertRig` (variant head | bust | full | emote | tail, size, state) replaces the Phase 2 `Compibert` placeholder in the smoke test header, share image and coin.
- **Specs:** `Compibert Momente` holds the build specs for all five decisions; `Compibert Rig` holds parts, states and the state machine (now incl. run, clap, roar).
- **Share image:** 8a „Poster“, reworked: winner name + standings 2–4 + all games (dot = game winner) on the left, small Compibert on a sunburst on the right. Component `ShareImage`, archive screen shows it live.
- **Battle replay:** 9a „Wettrennen“. One lane per party, 1.45 s per game (≈ 10 s for 6 games), small game label top-left that fades out, „FÜHRUNG“ stamp on lead changes, crown at the finish. Compibert full body bottom-right, reacts without speech.
- **Rig:** profile face, so only `-left` eye parts (eye, lid, pupil, brow). „left“ = screen-left/near side.

## People and teams

- **Team name builder:** each member adds one word (≤ 12 chars, no spaces), in join order; before any word, a team is named after its colour. The name freezes at kick-off; the host can reset it to the colour name but never write one. **(confirm)**
- **Last free slot** is decided by the server; the loser bounces back with „X war schneller“.
- **Uneven teams** block „Session starten“; the host sees why and gets „Von der Bench nachziehen“.
- **Host tools are moves only** in 1.0: no kick, no ban. **(confirm)**
- Display names don't have to be unique (≤ 24 chars). The last linked account can't be unlinked.

## Scoring

- **Ties within a game:** places 1, 1, 3; tied parties get the better place's points.
- **Scores** (e.g. 3:1) are optional and decorative; they never affect points.
- **Corrections:** the host can correct any past game; the leaderboard recalculates with the same animation and the feed logs it. No confirm dialog.
- **Custom points table** can't give a worse place more points than a better one; no negative points.
- **Tiebreaker** only for a tie on 1st place; repeats until decided; no bans, leftover vetoes still count.

## Communication

- **Chat:** everyone in the session can write, incl. bench and stands. Host can delete (leaves „Vom Host gelöscht“). No reactions, threads, DMs or images in 1.0. Game events go to Aktivität, never into the chat.
- **Emotes:** four, 2 s cooldown per person, max 3 emote sounds per second for the room.
- **Date poll:** Ja / Wenn nötig / Nein; best slot = most Ja, then most Wenn nötig, then earliest. Only a suggestion until the host confirms. Rescheduling keeps the teams.
- **Push:** soft in-app ask after the first poll vote, then the browser prompt. No push while the session is open in a visible tab. „Spiel gezogen“ and „Ergebnis“ only go to people not in the lobby.

## Frame

- **Host dock:** floating at the bottom centre of the stage; max 3 actions + „Mehr“, one primary. Collapses to the crown after 8 s idle. Shortcut H. Mobile: crown button + bottom sheet.
- **Mobile tabs:** Spielbrett, Tabelle, Chat, Aktivität, Leute. Desktop side panel: Chat, Aktivität, Tabelle, Leute.
- **Connection:** nothing for drops < 2 s; „wird wiederhergestellt“ banner after 2 s; „verloren“ after 15 s. Input is queued, never lost.

## Out of Phase 2

- Award ceremony: designed together with Compibert.
- Emote art: placeholders + brief.

## Phase 4: screens & flows

- **Splash** „Reinsprinten“ only on the first visit per 24 h, tap skips; otherwise just the short loading state. No sound at boot.
- **Sign-in:** Discord primary, Twitch secondary; neutral icons in mockups, official brand assets in the build. Via invite link the sign-in card shows who invites; after sign-in you land on the bench.
- **First profile setup** only on first login; name prefilled from Discord/Twitch.
- **Home:** „Läuft gerade“ always on top as the one primary action. Without host right: notice instead of a create button.
- **Invite link:** format `compies.app/s/<slug>-<token>`; rotating changes the token only. Rotate = hold 1 s; people already in the session stay. Rotated and deleted links look alike but say clearly what happened; a rotated link doesn't reveal whether the session still exists.
- **Stepper:** 8 steps; Loser's Pick and Loser's Advantage use the same locked „Bald verfügbar“ card as bracket/league until shipped. „Rad verdecken“ is removed (not just disabled) for Loser's Advantage.
- **Best poll slot:** most Ja, then most Wenn nötig, then earliest. Suggestion only; the host confirms.
- **Drag conflict:** loser bounces back to the bench with toast „X war schneller“. Keyboard: focus own avatar, Enter → „Verschieben nach …“.
- **Loser's Advantage tie for last:** each tied party bans 1, one after another in table order.
- **Pick & Ban coin:** Kopf = Compibert head on yellow, Schwanz = curly tail on cobalt.
- **Result correction:** no confirmation dialog; table re-animates, feed logs it, game gets „korrigiert“.
- **Share image:** 1200 × 630 (OG/Discord) or 1080 × 1080, PNG download or link with preview, built server-side with Satori.
- **Archive filters:** Alle, Gewonnen, Als Host. Cards show own placement.
- **Game duplicate check** while typing the name (normalised spaces, digits vs. words, abbreviations); a hint, never a blocker.
- **Settings** add Hell/Dunkel/System next to sound, push, reduced motion.
- **Admin:** granting host right is one click, revoking asks briefly.
- **PWA hint** on Home after taking part in a session; „Später“ hides it for 14 days. iOS gets an instruction sheet.
- **Autoplay blocked:** clip keeps running muted and in sync with a big „Ton aktivieren“; one click unlocks sound for the whole evening.
- **Desktop nav „Profil“** link added to match the mobile tab bar **(confirm)**.
- **Example team name** in all mockups: „Wilde Gurken“ (two words, not three).
- **[Post-1.0] League** suggests 3 / 1 / 0 points and needs crews. **Self-reported results:** a contradiction from another party goes to the host; the table changes only after confirmation.

## Phase 5: handoff + MVP

- **MVP first:** the first release only does date coordination (sign-in, create session with date proposals, invite link, poll, confirm, .ics). Everything else shows a construction page. Screens M1–M4 in `App MVP Terminfindung.dc.html`, component `BaustelleZone`.
- **MVP without push:** the .ics carries a 1 h alarm instead of the reminder push. **(confirm)**
- **MVP host right via env allowlist** until the admin UI (ticket 3). **(confirm)**
- **MVP poll refresh:** polling every 15 s while visible; realtime events replace it in ticket 6, UI unchanged.
- **Construction look:** red/white Absperrband, CSS Bauzaun panels, barrier, cone, yellow sign „Baustelle! Eltern haften für ihre Dinos.“, Compibert with a hard hat (new rig accessory `compibert-hat`). Nav items that lead to a construction page carry a small tape marker.
- Full handoff: `design_handoff_compies/README.md`; open questions there in `08-open-questions.md`.

## Open questions

1. Team name builder rules (above): OK as is?
2. No kick/ban for the host in 1.0: OK, or is a „aus der Session entfernen“ needed for trolls joining via link?
3. Should players see the „Korrigieren“ history marker, or only the host?
4. Push for „Spiel gezogen“: only for people not in the lobby, or never?
5. „Profil“ in the desktop nav (Phase 4): keep, or avatar menu only?
6. Splash once per 24 h: right frequency, or only on the very first visit?
