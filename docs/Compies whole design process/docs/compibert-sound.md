# COMPIES: sound cues (all moments)

Template for finding or making the sounds. Style: cartoony, dry and short, tabletop toys and a cheap arcade, never casino or orchestral. One-shots unless marked loop.

Delivery: 48 kHz, mono (stereo only where noted), peaks ≤ −1 dBTP, `.ogg` + `.m4a`. File names = the cue id.

**Relative volume** (Vol) is relative to the loudest cue, the fanfare = 100. Mix bus: `sfx` (UI + moments) and `cb` (Compibert voice), both behind one global mute.

## Rules
- **Global mute** in the header, stored per device. Muted = silence, animation unchanged.
- **First interaction gate:** nothing plays before the first tap or keypress (browser autoplay).
- **Room limit:** max 3 emote sounds per second for the whole room; extras play silent. Own emotes at full volume, other people's at 60 %.
- **Ducking:** fanfare and reveal stingers duck everything else by −6 dB while they play.
- **Variants:** where there are 3, pick at random, never the same one twice in a row. Pitch ±2 semitones on all UI cues.
- **Reduced motion** keeps sound, but loops become single hits (drumroll → one hit, steps → one step).
- **Server-timed moments** (wheel, veto, reveal, coin): cues are scheduled against server time so everyone hears the stop at the same moment.

## Cues

| Moment | Cue id | Character | Length | Vol |
|---|---|---|---|---|
| **Boot (3b)** | `boot-steps` | quick, light toy feet, loop under the sprint | 0.9 s loop | 35 |
| | `boot-skid` | rubber squeak + soft puff | 0.35 s | 45 |
| | `cb-hi` | short happy chirp, 3 variants | 0.3 s | 50 |
| **Smoke background** | — | silent on purpose | — | — |
| **Interaction style** | `ui-hover` | barely-there tick, desktop only | 30 ms | 8 |
| | `ui-press` | soft plastic click | 60 ms | 20 |
| | `ui-hold-fill` | rising hum while holding (veto, delete) | 1.0 s | 25 |
| | `ui-hold-done` | short bright confirm blip | 0.15 s | 40 |
| | `ui-toast` | soft pop | 0.12 s | 20 |
| | `ui-error` | low double bonk | 0.25 s | 35 |
| **Drag & drop (board)** | `drag-pick` | lift: little „bloop“ up | 0.12 s | 30 |
| | `drag-over` | zone wakes up: tiny sparkle | 0.1 s | 15 |
| | `drag-snap` | magnetic click-in | 0.15 s | 40 |
| | `drag-reject` | rubber boing back, someone was faster | 0.35 s | 40 |
| | `drag-longpress` | mobile: soft tick when the long press arms | 60 ms | 20 |
| **Lucky wheel** | `wheel-windup` | ratchet pulled back | 0.5 s | 45 |
| | `wheel-tick` | plastic flapper per peg, rate follows speed | 30 ms | 30 |
| | `wheel-stop` | thunk + three-note chord | 0.6 s | 70 |
| | `wheel-morph` | hidden mode: scramble/zip as the fake name turns real | 0.5 s | 50 |
| | `wheel-slice-out` | slice pops out, „schwupp“ | 0.3 s | 35 |
| | `cb-hype` / `cb-gulp` / `cb-yay` | Compibert: excited, gulp at the brake, yay ×3 | 0.6 / 0.25 / 0.5 s | 40 |
| **Veto window** | `veto-open` | shutter whoosh, window slides up | 0.4 s | 50 |
| | `veto-clock` | dry clock tick, last 10 s only, speeds up at 5 s | 40 ms | 25 |
| | `veto-clip-close` | soft TV off | 0.3 s | 35 |
| | `veto-seal` | own veto confirmed: wax-stamp thud | 0.3 s | 55 |
| | `veto-drumroll` | snare roll before the reveal | 1.2 s loop | 60 |
| | `veto-reveal` | all at once: cymbal hit + stamp per veto (staggered 80 ms) | 0.8 s | 85 |
| **Coin flip** | `coin-toss` | thumb flick + whoosh | 0.3 s | 50 |
| | `coin-spin` | metallic shimmer while in the air | 0.8 s | 30 |
| | `coin-land` | clink + wobble rattle | 0.5 s | 60 |
| | `coin-result` | short sting, Kopf/Schwanz same sound | 0.4 s | 55 |
| **Pick & ban** | `pb-turn` | turn changes: two-tone doorbell | 0.3 s | 40 |
| | `pb-ban` | marker scratch + paper rip | 0.45 s | 55 |
| | `pb-pick` | card slap onto the play order | 0.3 s | 50 |
| **Leaderboard** | `lb-swap` | rows swap: quick double whoosh | 0.3 s | 35 |
| | `lb-count` | point counter ticks, 1 per point, max 15/s | 25 ms | 20 |
| | `lb-winner` | mini celebration: party horn + 3 confetti pops | 0.8 s | 60 |
| **Tiebreaker** | `tie-alarm` | „Gleichstand!“ arcade alarm, 2 blips | 0.6 s | 70 |
| | `tie-drum` | tension low drum pulse, loop until spin | 1.0 s loop | 40 |
| | (wheel cues) | own wheel uses the wheel set | — | — |
| **Award ceremony (6b)** | `cer-drop` | banner thud | 0.3 s | 55 |
| | `cer-row` | place slides in, pitch rises with rank | 0.25 s | 40 |
| | `boot-steps` + `cer-trophy-rattle` | the run | run length | 40 |
| | `cer-trip` / `cer-bonk` | Stolpern / Volltreffer | 0.4 s | 60 |
| | `cer-stamp` | heavy rubber stamp „SIEGER“ | 0.2 s | 75 |
| | `cer-fanfare` | stereo, brassy toy fanfare | 2.5 s | 100 |
| | `cer-crowd` | stereo cheer under the fanfare | 2 s | 60 |
| **Share image** | `share-shutter` | camera shutter on „Bild teilen“ | 0.2 s | 35 |
| **Battle replay (9a)** | `br-cutin` | label pop per game | 0.2 s | 35 |
| | `br-move` | tokens slide, soft whoosh | 0.4 s | 20 |
| | `br-plus` | „+N“ coin blip | 0.15 s | 35 |
| | `br-lead` | „FÜHRUNG“ stamp | 0.3 s | 55 |
| | `br-win` | crown drop + short fanfare tail | 1.0 s | 80 |
| **Emotes (7a)** | `emo-clap` | 2–3 claps | 0.6 s | 45 |
| | `emo-haha` | wheezy giggle | 0.7 s | 45 |
| | `emo-grr` | short growl | 0.6 s | 45 |
| | `emo-roar` | small-dino roar, cute not scary | 1.0 s | 55 |
| **Compibert poke (5a)** | `cb-poke` | soft boop | 0.12 s | 30 |
| | `cb-giggle` `cb-boing` `cb-squish` `cb-huh` | per reaction | 0.3–0.5 s | 40 |
| | `cb-grr` | 5 taps in 2 s | 0.6 s | 45 |
| **Compibert states** | `cb-snore` | sleep, very quiet loop | 2 s loop | 10 |
| | `cb-hmm` | think, once per load > 1 s | 0.4 s | 25 |
| | `cb-uhoh` | confused, once per error | 0.5 s | 35 |
| **System** | `sys-join` | someone joins the lobby: soft door chime | 0.4 s | 25 |
| | `sys-reconnect` | connection back: up-blip | 0.3 s | 30 |

Not sounded: idle, look, blink, breathing, eye-follow, header logo, smoke, scroll.
