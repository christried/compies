# Nuxt decides, the realtime room relays

Release 1.4 makes the Event page live through the PartyServer room of ADR 0012, and we sharpen who holds the truth: every change (a move on the Game board, a Team word, starting or ending a Session, a Vote, a settings change) is an HTTP call to Nuxt, checked by the domain rules and written to Postgres in one transaction, and only then sent to the Event's room over a signed server-to-server call. The room holds sockets, Online state, clock sync and fan-out, never Event state, so a Worker deploy or a hibernated room loses nothing and the Hidden wheel secrecy stays in the one place that already enforces it. Timed moments that need a single clock (the 1.5 wheel stop and veto window alarms) are the room's job, but their outcome is still written through Nuxt. Superseded for timed moments by the amendment below.

## Considered Options

- **The room decides** (intents over the socket, state in Durable Object storage, written back to Nuxt at durable moments, as ADR 0012 first put it): saves one Vercel and Neon hop per move (about 100–300 ms), but puts the settings rules and a second copy of the state into the Worker. A lobby move can afford the hop.

## Consequences

- A race for the last free team slot is settled by a row lock in Postgres, not by the room.
- The room's messages carry no game data in 1.4; the Hidden wheel secrecy test covers what the room sends. Replaced by the 2026-11-05 amendment below.

## Amendment, 2026-10-31: Nuxt owns the deadlines too

Settled in the 0.7 „Glücksrad“ grilling (finding A2 of review 1.4, the Release now numbered 0.5.0). It replaces the sentence above that makes timed moments the room's job.

- Nuxt owns every timed moment: the wheel stop, the end of a veto window, the clip start, the coin landing, the end of a Countdown. Each is an instant stamped by Nuxt's clock and stored in Postgres with the state it belongs to; messages carry it as an explicit instant.
- No timer runs anywhere. What follows an instant (the reveal of the Vetoes, the outcome „neu drehen“ or „wird gespielt“) is a function of the stored state and the time; the first read or write after the instant settles it, idempotently. Reads are gated by time: under a Hidden wheel the drawn game reaches non-Hosts only from the stop instant on, and a Party sees other Parties' Vetoes only from the end of the window on.
- The room keeps no Event state and no schedule, so a Worker deploy still loses nothing. It gains one ability: sending a message to named Users of the Event only. A sealed Veto goes only to the Players of the Party that cast it; broadcast to everyone, it would tell the other Parties that a Veto was cast.
- Clients keep estimating their offset from the room's clock. Nuxt (Vercel) and the room (Cloudflare) both run NTP-synced clocks; the gap between them is accepted inside the 50 ms budget for server-timed moments.

Considered: the room owns the deadlines with Durable Object alarms. Rejected, because a stored schedule is Event state in the room (a deploy could drop a pending reveal, and the deploy guard would have to know about it), the room's one alarm already runs the presence sweep, and the outcome would still have to be written through Nuxt.

## Amendment, 2026-11-05: what the room's messages carry

From the 0.7 Release review (standards S5, #260), written after 0.8 deleted the unread messages (#258). It replaces the Consequences line „The room's messages carry no game data in 1.4“ and, in the amendment above, the words „messages carry it as an explicit instant“.

- A message carries only what every User it reaches may know at that instant. `event.changed` has no payload; clients refetch the Event read, which filters per viewer and is gated by time.
- `activity.added` is the one message with game data: an Activity entry that names a game everyone may already know. An entry that waits for its instant (a draw's stop, the Vetoes' reveal, the coin's landing) is not published; the Event read shows it from that instant on.
- No message carries the wheel's placeholder labels, a timed instant or the coin's side: 0.8 deleted `round.set`, `round.putBack`, `round.spun`, `countdown.changed` and `coin.tossed`, which no client read. The Event read still carries the coin's side (`coin.side`) before the landing, by decision; the UI hides it until `landsAt`.
- The named send (`{ to, direct }` in `RoomPublishBody`, used by `veto.cast`) has its own shape so that it fails closed: a Worker older than the shape answers 400 (no `messages` array) and sends nothing, where `messages` plus `to` would have reached every Party.
