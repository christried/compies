# GSAP for Compibert's rig and the Award ceremony

Decided on 2026-11-05 in the grilling for 0.9 „Siegerehrung“. Until 0.8, all motion in the app is our own Web Animations code (`app/utils/motion.ts`, `StickerConfetti`, `CpNum`). The Award ceremony needs Compibert's animated rig and the „Pokal-Lauf“, and both references (`reference/compibert-options.js`, `reference/AwardCeremony.dc.html`, timings in `Compibert Rig.dc.html`) are GSAP timelines with labels, handed off as „port it, keep the numbers“. A Member who opens the Event mid-ceremony has to join the timeline at „now − startAt“, which GSAP does with `seek`. So the rig and the ceremony use GSAP, loaded lazily with them, and everything else keeps using `motion.ts`.

## Considered Options

- **Port both to our own Web Animations code**: one motion system and no new dependency, but every timeline, label, `svgOrigin` pivot and state transition of the rig would be rewritten by hand and checked against the reference frame by frame, and seeking into a sequenced timeline would be ours to build.

## Consequences

- The app has two motion systems. New motion goes into `motion.ts` unless it animates Compibert's rig or plays inside the ceremony.
- GSAP comes under its own no-charge licence, not an open-source one. Read its terms before using it anywhere new.
- The rig's still poses for the Share image are rendered once with GSAP and saved as static SVGs, as the hand-off describes (`compibert-handoff.md` § Share image).
