# Nuxt decides, the realtime room relays

Release 1.4 makes the Event page live through the PartyServer room of ADR 0012, and we sharpen who holds the truth: every change (a move on the Game board, a Team word, starting or ending a Session, a Vote, a settings change) is an HTTP call to Nuxt, checked by the domain rules and written to Postgres in one transaction, and only then sent to the Event's room over a signed server-to-server call. The room holds sockets, Online state, clock sync and fan-out, never Event state, so a Worker deploy or a hibernated room loses nothing and the Hidden wheel secrecy stays in the one place that already enforces it. Timed moments that need a single clock (the 1.5 wheel stop and veto window alarms) are the room's job, but their outcome is still written through Nuxt.

## Considered Options

- **The room decides** (intents over the socket, state in Durable Object storage, written back to Nuxt at durable moments, as ADR 0012 first put it): saves one Vercel and Neon hop per move (about 100–300 ms), but puts the settings rules and a second copy of the state into the Worker. A lobby move can afford the hop.

## Consequences

- A race for the last free team slot is settled by a row lock in Postgres, not by the room.
- The room's messages carry no game data in 1.4; the Hidden wheel secrecy test covers what the room sends.

## Amendment, 2026-10-31: Nuxt owns the deadlines too

Settled in the 0.7 „Glücksrad“ grilling (review 1.4, finding A2). It replaces the sentence above that makes timed moments the room's job.

- Nuxt owns every timed moment: the wheel stop, the end of a veto window, the clip start, the coin landing, the end of a Countdown. Each is an instant stamped by Nuxt's clock and stored in Postgres with the state it belongs to; messages carry it as an explicit instant.
- No timer runs anywhere. What follows an instant (the reveal of the Vetoes, the outcome „neu drehen“ or „wird gespielt“) is a function of the stored state and the time; the first read or write after the instant settles it, idempotently. Reads are gated by time: under a Hidden wheel the drawn game reaches non-Hosts only from the stop instant on, and a Party sees other Parties' Vetoes only from the end of the window on.
- The room keeps no Event state and no schedule, so a Worker deploy still loses nothing. It gains one ability: sending a message to named Users of the Event only. A sealed Veto goes only to the Players of the Party that cast it; broadcast to everyone, it would tell the other Parties that a Veto was cast.
- Clients keep estimating their offset from the room's clock. Nuxt (Vercel) and the room (Cloudflare) both run NTP-synced clocks; the gap between them is accepted inside the 50 ms budget for server-timed moments.

Considered: the room owns the deadlines with Durable Object alarms. Rejected, because a stored schedule is Event state in the room (a deploy could drop a pending reveal, and the deploy guard would have to know about it), the room's one alarm already runs the presence sweep, and the outcome would still have to be written through Nuxt.
