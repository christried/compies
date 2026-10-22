# COMPIES – Product Brief

> This document is the **single source of truth** for the functional scope of COMPIES.
> Attach it to every design phase (Claude Design). It also becomes part of the final handoff to Claude Code.
>
> **Language note:** This brief is in English. The **app UI in version 1.0 is German**. All UI copy quoted in this brief (labels, explanation texts, placeholder names, feed examples) is German on purpose and must stay German in the designs.

## Scope labels

Every feature carries a label. These labels must remain visible in all designs, mockups and in the handoff.

| Label | Meaning |
|---|---|
| **[1.0]** | Part of the first release |
| **[1.0 – last ticket]** | Part of 1.0, but built as the very last ticket. Dropped if it can't be built as described. |
| **[Post-1.0]** | Designed now (mockups wanted), but **not** in 1.0. In the UI shown as "Bald verfügbar" (coming soon) or not shown at all. In the handoff, listed as later issues. |
| **[Discarded]** | Deliberately cut. Do not design. |

---

## 1. Vision

**COMPIES** (from *competitiveness*) is a web app for groups of friends who compete in challenges every now and then: video games (e.g. Counter-Strike 2 in 2v2), board games or any other activity.

- **Games are not played inside the app.** COMPIES organizes everything around them:
  - finding a date
  - forming teams
  - picking games (lucky wheel, pick & ban, …)
  - recording results
  - showing a live leaderboard
  - and ending with a big award ceremony
- **Everyone is live on the same website at the same time.** One host runs the session; everyone else does lightweight interactions (choosing a team, vetoes, bans, picks, chat, emotes).
- **Show character:** The app should be funny, beautiful and full of effects and motion. Lots of satisfying effects that never get annoying.
- **Mascot "Compibert":** a small, cheeky dinosaur (a Compsognathus). **Original character design**. No references to film designs or protected brands.
- **Usage:** primarily **desktop** (everyone is gaming at their PC). Mobile must be **fully functional**. Also shipped as a **PWA**.
- **Scale:** 1v1 up to 6v6, free-for-all up to 8 people, at most 8 parties.
- **Language:** Version 1 is **German**. All copy is translatable from day one. English is the next language **[Post-1.0]**.
- **Not a public product (yet)**, but built so that it could become one.

---

## 2. Roles & permissions

### [1.0]

| Role | Who | Can |
|---|---|---|
| **Platform admin** | the operator only | Everything. Manages the user list and grants/revokes the **"host sessions"** permission. Maintains the game library. |
| **Host** | users who received the host permission from the platform admin | Create sessions. Within their own session they are **session admin** and can do everything there. **No** other admin rights on the platform. |
| **User** | anyone who has signed in | Edit their profile, join sessions via invite links, view the archive of their own sessions. |

- Each session has **exactly one host**: the person who created it.
- The host can sit **anywhere**: in a team, on the bench or in the stands. Everywhere they have the same full rights. **Default assumption: the host does not play**, but can always act as a regular player.
- The host controls must therefore be **reachable regardless of where the host is sitting**.

### [Post-1.0] Crews

- A **crew** is a group (circle of friends) with its own members, sessions, archive and host permissions.
- The operator's crew is the first crew.
- **Founding a crew** is a permission granted by the platform admin (later switchable to "open for everyone").
- The **crew owner** manages members and grants host permissions within their crew.
- People join a crew via the **crew invite link** (rotatable).
- Archive: all crew members see their crew's sessions. Session participants don't have to be crew members.
- Mockups wanted for: crew overview, member management, crew invite, permission management.

---

## 3. Sign-in & profile [1.0]

- Signing in is **required** for everything. Sign-in via **Discord** or **Twitch**. Both accounts can be linked to one profile.
- Profile:
  - **Display name**: freely chosen, not unique
  - **Avatar**: defaults to the Discord/Twitch picture, replaceable by an upload
  - Linked accounts
  - "My sessions" (upcoming, running, archive)
  - Settings: sound on/off, push notifications, reduced motion (in addition to the OS setting)

---

## 4. Session lifecycle [1.0]

```
Draft → Date poll (optional) → Date set → Running → Finished → Archive
```

| Phase | What happens |
|---|---|
| **Draft** | The host configures the session (see 5). |
| **Date poll** | Voting on dates. Lobby, chat, bench and stands are already usable; team slots are still locked ("Teamwahl öffnet, sobald der Termin steht"). |
| **Date set** | Team selection is open. A session can only be started once a date is set. |
| **Running** | The host has started; teams are locked. The game-round loop runs (see 9). |
| **Finished** | After the configured number of games (plus tiebreaker if needed), the award ceremony follows. |
| **Archive** | Read-only. |

- Access to a session only via its **invite link**. The host can **rotate** the link (the old link becomes invalid).
- Anyone arriving via the link lands on the **bench**.
- Multiple sessions may run **in parallel**, also by different hosts.
- Only the session's host and the platform admin can delete it.

---

## 5. Creating a session [1.0]

A guided flow (stepper) with these settings:

1. **Name** of the session
2. **Format**
   - **Free-for-all** ("Jeder gegen jeden"): every player is their own party. 2 to 8 parties.
   - **Teams**: 2 to 8 teams.
     - All teams have equal size.
     - Max 6 players per team, max 24 players in teams in total (e.g. 1v1 … 6v6, 4 × 6, 8 × 3).
   - **Tournament bracket** **[Post-1.0]**: shown as "Bald verfügbar"
   - **League** **[Post-1.0]**: shown as "Bald verfügbar"
3. **Number of games** after which the session ends. Can be changed during the session.
4. **Points table**: how many points each placement earns. Presets:
   - *Linear*: number of parties minus placement (with 4 parties: 3/2/1/0)
   - *Winner takes all*
   - *Custom table*
5. **Selection mode**: how the next game is determined (see 8). Fixed for the whole session. Options:
   - Hide wheel (only for "Lucky Wheel", see 8)
6. **Game pool**: the games for the wheel, picks and bans, taken from the game library.
   - While filling it, the host gets **suggestions** that match the chosen format and player count.
   - Nothing is **filtered out automatically**; the host decides.
7. **Tiebreaker pool**: a separate game pool used only for the tiebreaker.
8. **Date**: set it directly or start a date poll (see 6).

**Info side sheet:** Next to the format and selection-mode choices, a side sheet explains every option **in detail**, with an example run-through, so that hosts without prior knowledge understand everything. The (German) copy is in section 17.

---

## 6. Date poll [1.0]

- The host proposes several slots (**date + time**).
- Everyone with the invite link votes while signed in: **Ja / Wenn nötig / Nein** (yes / if need be / no). Everyone sees who voted what.
- The app highlights the best slot; the host confirms it. Alternatively, the host sets a date directly without a poll.
- After confirming:
  - a push notification goes to everyone
  - the date can be downloaded as a calendar file (.ics)
  - a reminder goes out 1 hour before
- The host can reschedule; everyone gets notified again. Teams stay as they are.
- The host may start as soon as a date is set, also earlier than planned.

---

## 7. Lobby & game board [1.0]

The **game board** is the heart of the lobby. All participants appear as **avatars** and are moved between zones via **drag and drop**.

**Zones**
- **Team slots** (or player slots in free-for-all)
- **Bench** ("Bench" in the German UI too): substitutes, unlimited, also during the session. The host pulls people from here into teams when needed.
- **Stands** ("Tribüne"): spectators, unlimited. In 1.0 no function besides emotes. **[Post-1.0]**: more features for the stands.

**Rules**
- Everyone moves **only themselves**; the host moves **everyone**.
- Before the date is set: team slots locked.
- After the session starts:
  - Team slots are locked for players.
  - Everyone may still move freely between **bench and stands**.
  - The host can still remove people from teams and substitute from the bench.
- A game can only start when **all teams have equal size**. Otherwise the host sees a clear notice.
- If two people drag onto the last free slot at the same time, the server decides. The other avatar bounces back with an animation.
- **Online indicator** on every avatar.

**Team names**
- Each team member contributes **one word** (max 12 characters).
- Word order = order in which people joined the team.
- The name is frozen when the session starts. The host can reset it.
- Long names are truncated; the full name shows on hover.

**Team colors:** assigned automatically from a fixed palette of **8 clearly distinguishable colors**.

**Host controls:** always reachable, wherever the host sits.

---

## 8. Game selection: modes, vetoes, bans [1.0]

### Ground rule
**In every mode and at any time, the host can set or change the next game directly.** This is also the fallback if anything goes wrong.

### The five modes

| Mode | How it works | Vetoes |
|---|---|---|
| **Admin pick** | The host picks every game directly. | – |
| **Lucky Wheel** | The host fills the wheel and spins it. The drawn game leaves the wheel, and the clip starts automatically. | ✅ |
| **Pick & Ban** | First bans, then picks, alternating in a snake pattern, like map veto in Counter-Strike. **No time limit.** | – (bans replace vetoes) |
| **Loser's Pick** | The party in last place picks the next game from the pool. | ✅ |
| **Lucky Wheel – Loser's Advantage** | Before each spin, the last-placed party bans one game from the wheel (no time limit). Then the host spins. | ✅ |

### Wheel, general
- The result is **drawn on the server**. The animation runs on **all devices at the same time** and stops everywhere at the same moment.
- **Everything that gets drawn leaves the wheel**, whether it was played, vetoed or banned. The remaining slices redistribute (animated).
- The host can edit the wheel **at any time**, also during the session.
- It is intended that games are left on the wheel at the end. That keeps it exciting until the last spin.
- **Pool warning:**
  - If the pool can no longer mathematically cover the configured number of games (including possible vetoes and bans), **only the host** gets a notice.
  - The others notice nothing.
  - The warning doesn't block anything.
- If a drawn game can't be played (server down, etc.), the host can put it back on the wheel and spin again.

### Hidden wheel (option for "Lucky Wheel")
- The host can configure that players **can't** see the entries. The animation still runs.
- Instead of real games, the wheel shows placeholders: either "???" or **made-up game names** (list in section 18).
- As soon as the wheel stops, the slice **transforms** (animated) into the real name.
- This prevents people from saving their vetoes strategically.
- **Not available with "Loser's Advantage"**, because there you have to see what you're banning.

### Veto rules
- **Every player has 1 veto.**
  - In a team, vetoes are **pooled**: a 5-person team has 5 vetoes, and any member can spend them.
  - So one person can burn all of the team's vetoes on different games. That team dynamic is intended and funny.
  - In free-for-all, each player has 1 veto.
- **Max 1 veto per party per drawn game.** Once a team member has pressed it, the button is locked for the rest of the team for that game.
- **Veto window: 60 seconds**, starting the moment the game is determined.
  - For the first 30 seconds the clip plays.
  - Then the **clip closes automatically**, and 30 seconds remain.
  - The **veto button stays reachable the entire time**, also while the clip plays.
- **Hidden until the end:**
  - Your own team sees its veto immediately.
  - Other parties only see who vetoed when the countdown ends. Then all vetoes are **revealed dramatically at the same time**.
  - So nobody waits for the others to shout "veto" first.
- If several parties vetoed, **all of those vetoes are consumed**.
- On a veto, the game leaves the wheel/pool, and there is a new spin or new pick, followed by a new veto window.
- **Against misclicks:** the veto button must be **held** for about 1 second. A cast veto cannot be withdrawn.
- After the reveal, the activity feed shows who cast the veto.

### Pick & Ban in detail
- **Who starts is decided by an animated coin flip.** One side of the coin shows **Compibert's funny head** ("Kopf"), the other his **tail / rear end** ("Schwanz").
- **Number of bans per party = number of members** (i.e. as many as it would have vetoes). In free-for-all that's 1 ban per person.
- **Ban order follows a snake pattern:** party A 1 ban, party B 2 bans, A 2 bans, B 2 bans … until all bans are used. With more than 2 parties, the snake goes back and forth: A, B, C, C, B, A, A, B, C …
- **Then picks** in the same pattern until the configured number of games is reached. The party that did **not** start the bans starts the picks.
- **Pick order = play order.**
- **No time limit.** The host is responsible for keeping things moving.
- In a team, any member can ban or pick for the team (first to confirm wins; hold-to-confirm button).
- The clip plays at the start of the round in which the game is played.

### Loser's Pick in detail
- The **first game** is decided by the wheel.
- After that, the last-placed party picks the next game from the pool.
- Then the 60-second veto window with clip begins. If vetoed, the game leaves the pool and **the same party picks again**.
- If several parties share last place, the wheel decides.

### Lucky Wheel – Loser's Advantage in detail
- No ban before the **first spin** (there is no last place yet).
- Before every further spin, the last-placed party bans **1 game** from the wheel (no time limit). If several parties share last place, each of them bans 1 game.
- Then the host spins, followed by the normal 60-second veto window.
- The wheel is always visible (cannot be hidden).

---

## 9. The game round [1.0]

For every game, this loop runs:

1. **The game is determined** (depending on the mode, see 8)
2. **Clip:** a 30-second excerpt of a YouTube video (start second + length are stored with the game). It plays on all devices at the same time.
   - On desktop it starts **automatically with sound**. If the browser blocks it, a "Ton aktivieren" (enable sound) prompt appears.
   - Everyone can mute or close the clip for themselves. The host can skip it for everyone.
   - The clip closes automatically when it ends.
3. **The game is played outside the app.**
4. **The host enters the result:**
   - Drag and drop the parties into the correct **placement**.
   - A **"gleichauf"** (tied) toggle merges places. Draws are allowed but rare.
   - Optionally enter **scores** from the game (e.g. 16:12). They are **purely cosmetic** and don't affect the standings.
5. **Points** are awarded via the points table. Tied places all get the points of the better place; the next place is skipped (1, 1, 3).
6. **Live leaderboard** updates with animation, plus a **small celebration** for the game's winner.
7. On to the next game.

- The host can **correct past results**; the leaderboard recalculates.
- The host can change the number of games during the session.

---

## 10. Scoring, end & tiebreaker [1.0]

- There are **party standings only**. No individual standings per player in team mode.
- The session ends after the configured number of games.
- **Tiebreaker:** If parties are tied for **1st place**, an extra game (n+1) is played.
  - It is drawn from a **separate wheel** using the **tiebreaker pool**.
  - Only the tied parties play.
  - **Remaining vetoes may be used.** There are no bans here.
  - If the tiebreaker also ends in a draw, the wheel spins again.

---

## 11. Award ceremony & sharing [1.0]

- A **big, funny, spectacular award ceremony** at the end of the session: podium, confetti, Compibert dancing, sound. Optionally a 3D podium (only here).
- A **shareable image** with final standings, teams/players and Compibert, e.g. for Discord.
- **Battle replay** **[1.0 – last ticket]**: an in-app animation that tells the session as a battle.
  - The parties battle each other.
  - After every game you see who stood where.
  - In between: game cut-ins and randomly generated, generic gaming references.
  - At the end, the winner comes out on top.
  - Runs **in-app only** (built with GSAP), no server and no video rendering. If it can't be done that way, the feature is dropped.
- **[Discarded]**: MP4 export via Remotion or render servers (no running costs wanted).

---

## 12. Chat & activity feed [1.0]

- One panel with **two tabs**: **Chat** and **Aktivität** (activity). Both with timestamps.
- **Chat:** everyone in the session can write, including bench and stands. The host can delete messages.
- **Activity:** automatic events, e.g.:
  - "Kitty ist der Session beigetreten"
  - "Chris ist auf die Tribüne gewechselt"
  - "Team Wilde Kartoffel hat Trackmania gebannt"
  - "Glücksrad: Counter-Strike 2"
  - "Veto von Larsi (Team Rot)"
  - "Team Blau gewinnt Spiel 3"
- Chat and feed are stored in the **archive**, so you can read through the evening later.

---

## 13. Emotes [1.0]

- Everyone in the lobby (teams, bench, stands) can send emotes. The emote **rises above the sender's avatar** on the game board.
- Four emotes, as **custom illustrations in Compibert's style** (not system emojis):
  1. Clapping
  2. Tears of joy
  3. Angry
  4. **Compibert Roar**: Compibert roars
- Short cooldown against spam.

---

## 14. Sound [1.0]

- Sound effects for the big moments, e.g.:
  - wheel ticking
  - suspense while it slows down
  - reveal
  - veto reveal
  - coin flip
  - fanfare
  - cheering
  - emotes
- A global mute toggle, remembered persistently.

---

## 15. Game library [1.0]

- **Global**: visible to everyone. Every host benefits from games already added.
- Games are **not imported** but created by hosts. Played games stay stored.
- **Fields:**
  - name
  - image (upload)
  - YouTube link with start second and clip length (default 30 s), with preview while creating
  - recommended player count
  - suitable formats
- The app uses recommended player count and suitable formats **only for suggestions** when filling pools.
- Hosts can create games. Editing is allowed for the creator and the platform admin.
- When creating a game, the app checks whether it already exists (against duplicates like "CS2" vs "Counter-Strike 2").

---

## 16. Archive, notifications, admin area [1.0]

**Archive**
- Visible to everyone who played **at least one game in a party** in that session, and to the platform admin. **[Post-1.0]**: additionally all crew members.
- Contents:
  - final standings
  - all games with results and cosmetic scores
  - chat and activity log
  - share image
  - battle replay

**Push notifications** (via the PWA, also on desktop):
- date confirmed
- date rescheduled
- reminder 1 hour before
- session started
- game drawn
- result entered
- session finished

**Platform admin area**
- user list with search
- grant/revoke host permission
- manage games in the library
- **[Post-1.0]**: permission to found crews

---

## 17. Explanation copy for the info side sheet (draft, German UI copy)

> Tone: friendly, clear, a little cheeky. Every option has the sections "So läuft's" (how it works), "Gut für" (good for) and "Achtung" (heads-up). **Keep this copy in German.**

### Format: Jeder gegen jeden
**So läuft's:** Jede Person spielt für sich. Nach jedem Spiel bringst du als Host alle in die richtige Reihenfolge, und die Punktetabelle verteilt die Punkte. Wer am Ende die meisten Punkte hat, gewinnt.
**Gut für:** Battle-Royales, Rennspiele, Party- und Brettspiele mit 3 bis 8 Leuten.
**Achtung:** Bei vielen Spielern lohnt sich eine Punktetabelle, die gute Plätze stärker belohnt.

### Format: Teams
**So läuft's:** Du legst fest, wie viele Teams es gibt (2 bis 8). Alle Teams müssen gleich groß sein (max. 6 pro Team). Sobald der Termin steht, ziehen sich die Spieler selbst in ein Team. Jedes Mitglied steuert ein Wort zum Teamnamen bei. Mit dem Start sind die Teams gesperrt.
**Gut für:** 1v1 bis 6v6, z. B. Counter-Strike 2 im 2v2.
**Achtung:** Ein Spiel startet nur, wenn alle Teams gleich groß sind. Fehlt jemand, kannst du Leute von der Bench nachziehen.

### Auswahlmodus: Admin-Wahl
**So läuft's:** Du als Host bestimmst jedes Spiel selbst. Kein Zufall, keine Vetos.
**Gut für:** Abende mit festem Programm.
**Achtung:** Du kannst übrigens in jedem Modus jederzeit selbst eingreifen und das nächste Spiel setzen.

### Auswahlmodus: Lucky Wheel
**So läuft's:** Du legst Spiele auf das Glücksrad und drehst es. Alle sehen live, wie es dreht und wo es stehen bleibt. Das Spiel fliegt vom Rad, der 30-Sekunden-Clip startet. Danach hat jede Partei 60 Sekunden für ein Veto. Jeder Spieler bringt 1 Veto mit, im Team werden sie zusammengelegt, und jedes Mitglied darf sie einsetzen. Pro Spiel kann eine Partei höchstens 1 Veto einlegen. Wer ein Veto eingelegt hat, siehst du erst, wenn die Zeit abläuft. Dann werden alle gleichzeitig aufgedeckt. Gibt es ein Veto, wird neu gedreht.
**Option „Rad verdecken“:** Die Spieler sehen statt der echten Spiele nur Platzhalter oder erfundene Namen. Erst wenn das Rad stoppt, zeigt sich, was es wirklich ist. So spart niemand seine Vetos taktisch auf.
**Gut für:** Maximale Spannung und Chaos.
**Achtung:** Leg genug Spiele aufs Rad. Alles, was ausgelost wird, fliegt runter, auch per Veto abgelehnte Spiele. Wird es knapp, warnt dich die App, die anderen merken nichts davon.

### Auswahlmodus: Pick & Ban
**So läuft's:** Wie das Map-Veto in Counter-Strike. Ein Münzwurf (Compibert-Kopf oder Compibert-Schwanz) entscheidet, wer anfängt. Jede Partei bekommt so viele Bans, wie sie Mitglieder hat. Gebannt wird abwechselnd: A bannt 1, B bannt 2, A bannt 2 und so weiter, bis alle Bans weg sind. Danach wird nach demselben Muster gepickt. Mit dem Picken beginnt die Partei, die nicht mit dem Bannen angefangen hat. Die Reihenfolge der Picks ist die Spielreihenfolge.
**Gut für:** Taktische Abende, bei denen jede Partei mitbestimmen will.
**Achtung:** Es läuft keine Uhr. Du sorgst dafür, dass es vorangeht. Der Pool muss mindestens so groß sein wie alle Bans plus die Anzahl Spiele.

### Auswahlmodus: Loser's Pick
**So läuft's:** Das erste Spiel bestimmt das Glücksrad. Danach darf immer die Partei auf dem letzten Platz das nächste Spiel aussuchen. Die anderen können innerhalb von 60 Sekunden ein Veto einlegen, dann muss neu gewählt werden. Teilen sich mehrere den letzten Platz, entscheidet das Glücksrad.
**Gut für:** Aufholjagden. Wer hinten liegt, spielt sein Lieblingsspiel.
**Achtung:** Vetos funktionieren wie beim Lucky Wheel.

### Auswahlmodus: Lucky Wheel – Loser's Advantage
**So läuft's:** Wie Lucky Wheel, mit einem Bonus für die Letzten: Vor jedem Dreh (außer dem ersten) darf die Partei auf dem letzten Platz ein Spiel vom Rad bannen. Dann wird gedreht, und es gibt wie gewohnt 60 Sekunden für Vetos.
**Gut für:** Zufall mit einem kleinen Vorteil für die, die hinten liegen.
**Achtung:** Das Rad kann hier nicht verdeckt werden, sonst wüsste niemand, was er bannt.

### Tiebreaker
**So läuft's:** Liegen am Ende mehrere Parteien punktgleich auf Platz 1, dreht ein eigenes Glücksrad mit deinem Tiebreaker-Pool. Nur die Punktgleichen spielen. Übrige Vetos dürfen noch eingesetzt werden. Bei erneutem Gleichstand wird wieder gedreht.

---

## 18. Placeholder names for the hidden wheel (starter list, German UI copy)

Counter-Strudel · League of Leberkäse · Mario Kartoffel · Rocket Lieg · Super Smash Bratwurst · Tetris Tapas · Fortnight Fortnacht · Street Fighter Stollen · Minecraft Mettbrötchen · Hearthstein · Dota Döner · Overwatschen · Fifa Fiasko · Apex Leberwurst · Valorantsauce · Trackmania Tiramisu · Siedler von Snackan · Mensch ärgere dich doch · Uno Momento · Halo Hallo

---

## 19. Technical frame (constraints for design and the later build)

| Area | Decision |
|---|---|
| Framework | **Nuxt** (Vue) + **Tailwind CSS** |
| Database | **Neon** (Postgres) + **Drizzle** |
| Auth | **Better Auth** with Discord and Twitch |
| Hosting | **Vercel** with a custom domain |
| Realtime | **Cloudflare Durable Objects + PartyServer**: one room per session. The server dictates the timing (wheel stop, clip start, countdowns); clients sync their clocks to the server. Online presence comes from the connection. |
| Files | **Cloudflare R2** (avatars, game images) |
| App | **PWA** with push notifications |
| Share image | **nuxt-og-image** (Satori) |
| Motion | **GSAP** as the central animation engine: wheel, leaderboard (Flip), celebrations, Compibert states, coin flip (CSS 3D flip, no 3D engine needed), battle replay. Optionally **TresJS** (Three.js for Vue) only for the 3D podium in the award ceremony, lazy-loaded. |
| Mascot | **No Rive.** Compibert is an SVG with a **rig of individually named parts**, animated with GSAP and driven by a state machine. |
| Accessibility | When "reduce motion" is set in the OS, every big animation has a calm alternative. |
| i18n | All copy as translation keys. Version 1 German only. |
| Data model | Designed so that crews **[Post-1.0]** can be added without a rebuild. |

---

## 20. Scope overview

**[Post-1.0]**
- Crews (incl. crew owner, crew invite link, permission to found crews, archive for crew members)
- Tournament bracket and league formats
- Players report results themselves (host confirms)
- More features for the stands
- English and further languages

**[Discarded]**
- Cross-session stats, Elo/TrueSkill, head-to-head, badges
- Seasons, hall of fame
- Bonus points
- Importing a game database (IGDB/RAWG)
- Random teams, captain draft, rating-based team balancing
- Joining via QR code, projector/TV view
- Individual standings per player in team mode
- MP4 export of the replay (Remotion, render servers)
- Rive
