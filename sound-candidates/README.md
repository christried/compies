# Sound candidates

Files for the listening session of 0.13.3 (#535), played by the listening page on the dev server (`/dev/ton`, see the README). Not shipped: nothing here is under `public/` (#536 moves the chosen files there and removes the rest).

- Layout: `<cue id>/<name>.<wav|ogg|mp3>`, e.g. `wheel-tick/tick-b.wav`. WAV is preferred.
- `manifest.json` lists them: `{ "cues": { "<cue id>": [ { "name", "file", "source", "author", "licence", "note" } ] } }`.
  `file` is the path under this folder, `source` a URL or how it was made (`sfxr preset coin, seed 12`), `author` a name or `null`, `note` optional.
- Licence: `CC0` or `generated`. Nothing that needs a credit.
- The shipped placeholder of every cue is its first candidate and needs no entry.
