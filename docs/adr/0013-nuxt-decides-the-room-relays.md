# Nuxt decides, the realtime room relays

Release 1.4 makes the Event page live through the PartyServer room of ADR 0012, and we sharpen who holds the truth: every change (a move on the Game board, a Team word, starting or ending a Session, a Vote, a settings change) is an HTTP call to Nuxt, checked by the domain rules and written to Postgres in one transaction, and only then sent to the Event's room over a signed server-to-server call. The room holds sockets, Online state, clock sync and fan-out, never Event state, so a Worker deploy or a hibernated room loses nothing and the Hidden wheel secrecy stays in the one place that already enforces it. Timed moments that need a single clock (the 1.5 wheel stop and veto window alarms) are the room's job, but their outcome is still written through Nuxt.

## Considered Options

- **The room decides** (intents over the socket, state in Durable Object storage, written back to Nuxt at durable moments, as ADR 0012 first put it): saves one Vercel and Neon hop per move (about 100–300 ms), but puts the settings rules and a second copy of the state into the Worker. A lobby move can afford the hop.

## Consequences

- A race for the last free team slot is settled by a row lock in Postgres, not by the room.
- The room's messages carry no game data in 1.4; the Hidden wheel secrecy test covers what the room sends.
