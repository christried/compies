# Polling instead of realtime in the MVP

The MVP (date poll only) has no websockets. Clients refetch `GET /api/s/:slug` every 15 s while the tab is visible, on focus, and after each of their own mutations; votes are optimistic with rollback. Realtime (one PartyServer room per Session on Cloudflare Durable Objects) is the 1.0 plan, but a date poll does not need sub-second updates, and shipping it first would pull the whole realtime foundation (T6: room tokens, clock sync, reconnect) in front of the first real game night. The UI already says „Aktualisiert sich von selbst“, so T6 can swap polling for events without UI changes.

**Note, 2026-10-23 (#51):** The UI no longer says „Aktualisiert sich von selbst“ on the Event page; the refresh hint and its dot are gone. The polling stays as decided here: every 15 s while the tab is visible, on focus, and after the User’s own writes.

**Note, 2026-10-28:** Realtime is one PartyServer room per **Event**, not per Session (ADR 0011), in a separate Worker next to Nuxt on Vercel (ADR 0012).

**Closing note, 2026-10-29 (#156):** 1.4 replaced the polling with the room (ADR 0012, ADR 0013): the Event page refetches when its room says something changed and on every (re)connect. The 15 s polling stays as the fallback while the connection is down, and is the only mechanism where the app knows no Worker.
