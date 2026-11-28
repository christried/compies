# Nuxt decides, the realtime room relays

The Event page is live through the PartyServer room of ADR 0012. Every change (a move on the Game board, a Team word, starting or ending a Session, a Vote, a settings change, a Chat Message) is an HTTP call to Nuxt, checked by the domain rules and written to Postgres in one transaction, and only then sent to the Event's room over a signed server-to-server call. The room holds sockets, Online state, clock sync and fan-out, never Event state and no schedule, so a Worker deploy or a hibernated room loses nothing and the Hidden wheel secrecy stays in the one place that already enforces it.

Rejected: the room decides (intents over the socket, state in Durable Object storage). It saves one Vercel and Neon hop per move (about 100–300 ms) but puts the settings rules and a second copy of the state into the Worker.

## Nuxt owns the deadlines (amendment, 2026-10-31)

- Nuxt owns every timed moment: the wheel stop, the end of a veto window, the clip start, the coin landing, the end of a Countdown. Each is an instant stamped by Nuxt's clock and stored in Postgres with the state it belongs to.
- No timer runs anywhere. What follows an instant (the reveal of the Vetoes, the outcome „neu drehen“ or „wird gespielt“) is a function of the stored state and the time; the first read or write after the instant settles it, idempotently. Reads are gated by time: under a Hidden wheel the drawn game reaches non-Hosts only from the stop instant on, and a Party sees other Parties' Vetoes only from the end of the window on.
- Clients estimate their offset from the room's clock. Nuxt and the room both run NTP-synced clocks; the gap is accepted inside the 50 ms budget for server-timed moments.
- A race for the last free team slot is settled by a row lock in Postgres, not by the room.

Rejected: Durable Object alarms in the room. A stored schedule is Event state in the room (a deploy could drop a pending reveal), and the outcome would still have to be written through Nuxt.

## What the room's messages carry (amendment, 2026-11-05)

- A message carries only what every User it reaches may know at that instant. `event.changed` has no payload; clients refetch the Event read, which filters per viewer and is gated by time.
- `activity.added` is the one message with game data: an Activity entry that names a game everyone may already know. An entry that waits for its instant (a draw's stop, the Vetoes' reveal, the coin's landing) is not published; the Event read shows it from that instant on. A Chat Message is relayed with its text, like an Activity entry.
- No message carries the wheel's placeholder labels, a timed instant or the coin's side. The Event read still carries the coin's side (`coin.side`) before the landing, by decision; the UI hides it until `landsAt`.
- The named send (`{ to, direct }` in `RoomPublishBody`, used by `veto.cast`) sends to named Users of the Event only: a sealed Veto goes only to the Players of the Party that cast it. It has its own shape so that it fails closed: a Worker older than the shape answers 400 and sends nothing, where `messages` plus `to` would have reached every Party.

## Emotes go through the room alone (amendment, 2026-11-16)

- An Emote is the one thing a Member sends over the socket that the room passes on without Nuxt. It is not Event state: nothing stores it, no rule depends on it, and a Member who opens the Event later never sees it.
- The room enforces the Emote's two rules, because only it sees every Emote of an Event: one Emote per Member every two seconds, and at most three Emotes a second that carry a sound.

Rejected: Emotes through Nuxt. The two-second rule would need a database write per Emote or a counter in one of several Vercel instances' memory, and the hop is felt on a reaction.

## The room closes the sockets of named Users (amendment, 2026-11-20)

- The Worker checks a room token once, at connect. A User who stops being a Member (a Deleted User, ADR 0020, or a Member the Host removed) would otherwise keep receiving the Event's messages, count as Online and send Emotes.
- So with the change that ends the membership, Nuxt tells the room to send a last message to the named Users and close their sockets. Nuxt still decides who is a Member: the room keeps no list of Members. A closed socket cannot come back, since the token endpoint refuses a User who is no Member.
- The call has its own shape so that it fails closed, as the named send does: an older Worker answers 400, sends nothing and closes nothing. The Worker deploys before Nuxt.

Rejected: sockets that end with their token (a reconnect a minute for every Member, and up to a minute of reading along), and the room asking Nuxt per message whether a User is still a Member (a call per socket and message, and a second place that knows about membership).
