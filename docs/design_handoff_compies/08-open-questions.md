# 08 Open questions

Decide these before or during the matching ticket. Each has the assumption the designs currently use.

## MVP (decide before T2a)

1. **Push in the MVP?** Assumed: no. The .ics carries a 1 h alarm instead; „Termin steht“ is visible in the app. Push arrives with T17.
2. **Host permission in the MVP:** assumed env allowlist (operator + named hosts). OK, or do we need the admin list (T3) before launch?
3. **Event length in the .ics:** assumed 3 h. Make it a Session field later?
4. **Time zone:** assumed Europe/Berlin for display and input, UTC in the DB. Anyone in another zone?
5. **Max slots per poll:** assumed 8.
6. **Editing slots after the poll started:** not designed. Assumption: host can add slots any time; removing a slot that has votes needs hold-to-confirm and drops those votes. Confirm.
7. **Domain:** mockups use `compies.app`. Final domain?
8. **Legal pages:** a publicly reachable German site usually needs an Impressum and a privacy notice (Datenschutzerklärung), even for a private group; sign-in with Discord/Twitch processes personal data. Not designed. Please check what you need; a plain text page in the app frame is enough design-wise.
9. **Deep link without login:** assumed the poll page always requires sign-in (brief). A read-only preview for signed-out visitors (title + host, no votes) is shown on 07; confirm no vote counts leak there.

## From earlier phases (still open)

10. Team name builder: one word ≤ 12 chars per member, join order, frozen at kick-off, host can only reset to the colour name. OK?
11. No kick/ban for the host in 1.0 (moves only). Enough, given anyone with the link can join? Rotate link is the current remedy.
12. „korrigiert“ marker on corrected games: visible to everyone (current design) or host only?
13. Push „Spiel gezogen“: only to people not in the lobby (current) or never?
14. „Profil“ in the desktop nav (current) or avatar menu only?
15. Splash/boot animation once per 24 h (current) or only on the very first visit?

## Assumptions made in Phase 5

16. **Clock sync tolerance:** synchronised moments aim for ≤ 50 ms spread between clients after sync (see 04-motion). Late joiners seek into the running animation; nobody waits.
17. **Wheel physics are fake:** the server sends `resultIndex`, `startAt`, `durationMs`; the client computes the final angle (with a random offset inside the slice seeded by the server) so all clients land on the same pixel.
18. **Clip sync:** YouTube IFrame API, `seekTo(start + elapsed)` on late join; drift > 1 s is corrected once, never continuously.
19. **Veto window = 60 s from `determinedAt`** (server), clip closes at +30 s. Reveal at +60 s for everyone, including the host.
20. **Hidden-wheel names** come from `wheel.placeholders` (20 names); if the wheel has more slices than names, fall back to „???“ for the rest. Names are shuffled per spin, never repeated on one wheel.
21. **Sound production:** cue list exists (05-assets). Who produces/licenses the sounds?
22. **Battle replay:** kept as last ticket; storyboard is final. If GSAP alone can't do it smoothly at 8 lanes on mid-range phones, drop it (brief).
23. **Discord/Twitch logos:** mockups use neutral icons; use the official brand assets and follow their guidelines in the build.
24. **Share image font licensing:** Lilita One, Bungee, Bricolage Grotesque are OFL; fine for server-side rendering.
