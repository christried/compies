# Polling instead of realtime in the MVP

The MVP (date poll only) had no websockets: a date poll does not need sub-second updates, and realtime would have pulled the whole realtime foundation in front of the first real game night. Clients refetch the Event read every 15 s while the tab is visible, on focus, and after each of their own writes; votes are optimistic with rollback.

## Where this stands

1.4 replaced the polling with the Event's room (ADR 0012, ADR 0013): the Event page refetches when its room says something changed and on every (re)connect. The 15 s polling stays as the fallback while the connection is down, and is the only mechanism where the app knows no Worker. Realtime is one room per Event, not per Session (ADR 0011).
