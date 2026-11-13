# Sound candidates

Files for the listening session of 0.13.3 (#535), played by the listening page on the dev server (`/dev/ton`, see the README). Nothing here is under `public/`, so no deployment serves it. What the app ships is a byte copy of one candidate per cue (below); the unchosen candidates leave this folder when the session has chosen (#593).

- Layout: `<cue id>/<name>.<wav|ogg|mp3>`, e.g. `wheel-tick/tick-b.wav`. WAV is preferred.
- `manifest.json` lists them: `{ "cues": { "<cue id>": [ { "name", "file", "source", "author", "licence", "note" } ] } }`.
  `file` is the path under this folder, `source` a URL or how it was made (`sfxr preset coin, seed 12`), `author` a name or `null`, `note` optional.
- Licence: `CC0` or `generated`. Nothing that needs a credit.
- What ships is made by `node scripts/ship-cue-sound.mjs <cue id>=<name>`: it copies the candidate's WAV byte for byte to `public/sounds/cues/<cue id>.wav` and writes the cue's entry in `public/sounds/cues/credits.json` (source, author and licence from the manifest entry). The listening page's first row per cue (`ausgeliefert`) is that file, with its source read from the credits. #593 swaps the files for the sounds the session chose and removes the unchosen candidates. An own CC0 sound is first added here and to the manifest as a candidate, then shipped by the same script.
