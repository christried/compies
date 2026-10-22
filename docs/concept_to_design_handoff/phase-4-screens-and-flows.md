# Phase 4 – Screens & Flows

> **Attachment:** `00-product-brief.md` + the results of phases 2 and 3
> **Goal:** All screens and flows of the app for desktop and mobile, including all states. Features labeled **[Post-1.0]** are designed too, but clearly marked.

---

## Prompt (copy)

Now design **all screens and flows** of COMPIES using our design system and the motion specs. For every screen:

- **Desktop first**, then **mobile**: fully functional, not just "readable"
- All relevant states:
  - empty, loading, error, no permission
  - **host view** vs. **player view**
- **German UI copy**, tone as in the brief: friendly, clear, a little cheeky
- Scope labels visible: **[1.0]**, **[1.0 – last ticket]**, **[Post-1.0]**

### Screen list

**Entry**
1. Boot animation / splash
2. Sign-in (Discord or Twitch)
3. First profile setup (display name, use or upload an avatar)
4. **Home**:
   - my sessions (upcoming, running, archive)
   - "create session" (only with host permission)
   - a notice for users without host permission

**Preparing a session**
5. **Create session** (stepper) with these steps:
   - name, format, teams/sizes, number of games, points table
   - selection mode (+ "hide wheel" option)
   - game pool with suggestions, tiebreaker pool
   - date
   - Includes the **info side sheet** (copy from the brief, section 17).
   - Tournament bracket and league shown as "Bald verfügbar".
6. **Invite**: copy link, rotate link (with confirmation)
7. **Opening an invite link** in these cases:
   - signed out (→ sign-in)
   - link invalid or rotated
   - session deleted
8. **Date poll**:
   - voter view
   - host view (confirm date, reschedule)
   - calendar file download

**Lobby & game**
9. **Lobby / game board** in these phases:
   - date poll (teams locked)
   - date set (team selection open, team-name words, "teams uneven")
   - running
   - Each with the chat/activity panel, emote bar and online indicators.
   - State: the host is sitting in the stands / on the bench / in a team.
10. **Host controls** (always reachable):
    - start session
    - move people
    - edit the wheel / pools
    - pool warning
    - set the next game directly
    - skip the clip for everyone
    - reset a team name
    - change the number of games
    - delete a chat message
    - enter and correct results
    - end / delete the session
11. **Lucky Wheel**:
    - visible and hidden
    - spinning, stop
    - clip + veto window, reveal
    - new spin after a veto
12. **Lucky Wheel – Loser's Advantage**: the ban step of the last-placed party before the spin
13. **Pick & Ban**:
    - coin flip, ban phase, pick phase, final play order
    - views for the party whose turn it is and for everyone else
14. **Loser's Pick**: the last-placed party picks, veto window, re-pick after a veto
15. **Admin pick**: the host picks the next game
16. **Result entry** (host):
    - sort parties, tied toggle, optional scores
    - correcting a past game
17. **Interim standings / live leaderboard** with mini celebration and the session's game history
18. **Tiebreaker**: announcement, tiebreaker wheel, only the tied parties play
19. **Award ceremony** + sharing: share-image preview, download or copy link
20. **Battle replay** **[1.0 – last ticket]**

**After the session**
21. **Archive**: list
22. **Archive detail**:
    - final standings
    - games with results
    - chat and activity log
    - share image, replay

**Library & profile**
23. **Game library**: list with search and filters, detail
24. **Create/edit game**:
    - YouTube link with start second and clip length, with a live preview of the excerpt
    - duplicate notice
25. **Profile & settings**:
    - display name, avatar
    - linked accounts (Discord + Twitch)
    - sound, push notifications, reduced motion
26. **Platform admin**: user list, grant/revoke host permission

**System states**
27. Realtime connection lost / reconnecting
28. Asking for push permission
29. Installing the PWA
30. Enable sound (browser blocked autoplay)
31. 404, no permission, generic error (with confused Compibert)

**[Post-1.0] – design these, mark them clearly**
32. Crews:
    - overview, create crew, members
    - crew invite link
    - host permissions within the crew
    - crew archive
33. Tournament bracket format
34. League format
35. Players report results themselves, host confirms
36. Language switch (German/English)

### Mobile notes

- The game board needs its own mobile solution, e.g. stacked zones or tabs. Dragging via long press.
- Chat/activity as a bottom sheet
- Veto, ban and pick buttons always within thumb reach
- The clip must never cover the veto button

### Flows

Also show these flows as connected click-through prototypes:

1. The host creates a session, starts a date poll and invites people.
2. A player opens the invite link, signs in, votes, and drags themselves into a team once the date is confirmed.
3. A full lucky-wheel round with a hidden wheel and two vetoes (both revealed, both consumed, new spin).
4. A full pick & ban phase for 2v2, including the coin flip.
5. The last game ends in a tie, followed by the tiebreaker, the award ceremony and sharing.
